"""
HTML-отчёт по последним обработанным VK-постам — проверить качество
извлечения района (NER + regex fallback).

Запуск:
  python pipelines/vk_districts_report.py
  python pipelines/vk_districts_report.py --since 1day --out report.html
  python pipelines/vk_districts_report.py --last 200
  python pipelines/vk_districts_report.py --suspect-only   # только подозрительные (red/orange)

Колонки:
  - id + дата (ссылка на пост в VK)
  - текст
  - результат: район + confidence (или «—»)
  - place_match: что нашёл NER + regex (mentions / detected_places / reason)
  - photo_species (если есть)

Подсветка строк:
  - GREEN: район определён, confidence >= 0.7
  - YELLOW: район определён, confidence < 0.7 (низкая уверенность)
  - ORANGE: район НЕ определён, но regex/NER нашёл что-то релевантное
            (district_lo / settlement / lake — возможный miss)
  - RED:   district_admin_area_id IS NULL и regex детектировал
            district_spb / subject_ru / etc — текст вне ЛО или коллизия
  - GRAY:  пустой текст / нет NER mentions вообще
"""

from __future__ import annotations

import argparse
import json
import os
import webbrowser
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def build_dsn() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map",
    )


HTML_HEAD = """<!doctype html>
<html><head><meta charset="utf-8"><title>VK districts report</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 16px;
         background: #fafafa; color: #222; font-size: 13px; }
  h1 { font-size: 18px; }
  .stats { background: #fff; padding: 10px 14px; border: 1px solid #ddd;
           border-radius: 6px; margin-bottom: 14px; font-size: 13px; }
  .stats span { margin-right: 18px; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
  th { background: #eee; text-align: left; position: sticky; top: 0; z-index: 2; }
  td.text { max-width: 460px; font-size: 13px; line-height: 1.45;
            white-space: pre-wrap; word-wrap: break-word; }
  td.match { font-size: 12px; font-family: ui-monospace, Consolas, monospace;
             white-space: pre-wrap; max-width: 360px; word-wrap: break-word; }
  td.district { font-weight: 600; min-width: 200px; }
  td.conf { font-size: 11px; color: #666; }
  .post-meta { font-size: 11px; color: #888; }
  a { color: #06c; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .pill { display: inline-block; padding: 1px 6px; border-radius: 3px;
          margin: 1px; border: 1px solid #cce; background: #eef; font-size: 11px; }
  .pill.other { background: #fee; border-color: #ecc; }
  tr.row-green  { background: #eaf7e8; }
  tr.row-yellow { background: #fff8d7; }
  tr.row-orange { background: #ffe4cc; }
  tr.row-red    { background: #ffdcdc; }
  tr.row-gray   { background: #f0f0f0; color: #888; }
  .filters { background: #fff; padding: 8px 12px; border: 1px solid #ddd;
             border-radius: 6px; margin-bottom: 10px; font-size: 13px;
             position: sticky; top: 0; z-index: 5; }
  .f-btn { display: inline-block; padding: 3px 9px; border-radius: 4px;
           margin: 2px; cursor: pointer; user-select: none;
           border: 1px solid #cce; background: #eef; }
  .f-btn.active { background: #06c; color: #fff; border-color: #06c; }
  .f-btn .cnt { color: #888; margin-left: 4px; font-size: 11px; }
  .f-btn.active .cnt { color: #cce; }
  tr.hidden { display: none; }
</style></head><body>
"""


# ── classification ───────────────────────────────────────────────────

LO_RELEVANT_KINDS = {"district_lo", "settlement", "lake", "river", "tract"}
NON_LO_KINDS = {"district_spb", "subject_ru", "city_ru"}


def classify_row(district_id, conf, pm) -> str:
    """Возвращает css-класс строки: row-green/yellow/orange/red/gray."""
    if district_id is not None:
        if conf is not None and conf >= 0.7:
            return "row-green"
        return "row-yellow"
    # district NULL — смотрим почему
    if not pm:
        return "row-gray"
    reason = pm.get("reason", "")
    if reason == "no_ner_mentions" and not pm.get("detected_places"):
        return "row-gray"
    detected = pm.get("detected_places") or []
    has_lo_relevant = any(d.get("kind") in LO_RELEVANT_KINDS for d in detected)
    has_non_lo = any(d.get("kind") in NON_LO_KINDS for d in detected)
    if has_lo_relevant:
        return "row-orange"  # LO-релевантное упоминание, но без района — возможный miss
    if has_non_lo:
        return "row-red"     # детектировал не-ЛО (СПб/субъект) — обычно правильно skip
    return "row-gray"


# ── rendering ────────────────────────────────────────────────────────

def render_place_match(pm) -> str:
    if not pm:
        return '<span class="pill">—</span>'
    parts = []
    if "reason" in pm:
        parts.append(f'<div><b>reason:</b> {escape(str(pm["reason"]))}</div>')
    if "mentions" in pm and pm["mentions"]:
        ms = ", ".join(escape(str(m)) for m in pm["mentions"][:8])
        parts.append(f'<div><b>NER mentions:</b> {ms}</div>')
    if "matched_name" in pm:
        parts.append(f'<div><b>matched:</b> {escape(str(pm["matched_name"]))} '
                     f'({escape(str(pm.get("kind","?")))})</div>')
    if "detected_places" in pm and pm["detected_places"]:
        items = []
        for d in pm["detected_places"][:8]:
            kind = d.get("kind", "?")
            name = d.get("name", "?")
            cls = "pill other" if kind in NON_LO_KINDS else "pill"
            items.append(f'<span class="{cls}">{escape(kind)}: {escape(name)}</span>')
        parts.append('<div><b>regex:</b> ' + " ".join(items) + "</div>")
    if "regex_confidence" in pm:
        parts.append(f'<div class="post-meta">regex_conf: {pm["regex_confidence"]}</div>')
    return "".join(parts) or '<span class="pill">—</span>'


def render_species(species) -> str:
    if not species:
        return ""
    parts = []
    for it in species[:8]:
        sp = it.get("species", "?")
        cnt = it.get("count", 0)
        cls = "pill other" if sp == "other" else "pill"
        parts.append(f'<span class="{cls}">{escape(sp)}&times;{cnt}</span>')
    return " ".join(parts)


def render_district(name: str | None, conf: float | None) -> str:
    if name is None:
        return '<span style="color:#999">—</span>'
    conf_str = f' <span class="conf">({conf:.2f})</span>' if conf is not None else ""
    return f"{escape(name)}{conf_str}"


# ── main ─────────────────────────────────────────────────────────────

def parse_since(s: str) -> datetime:
    """'1day' / '3h' / '30min' / ISO дата → timestamp."""
    s = s.strip().lower()
    now = datetime.now(timezone.utc)
    if s.endswith("day") or s.endswith("d"):
        n = int(s.rstrip("day").rstrip("d") or "1")
        return now - timedelta(days=n)
    if s.endswith("h"):
        n = int(s.rstrip("h"))
        return now - timedelta(hours=n)
    if s.endswith("min") or s.endswith("m"):
        n = int(s.rstrip("min").rstrip("m") or "1")
        return now - timedelta(minutes=n)
    # ISO date / datetime
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc) if "T" not in s \
        else datetime.fromisoformat(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="1day",
                    help="посты обработанные не ранее (1day/3h/30min или ISO). default: 1day")
    ap.add_argument("--last", type=int,
                    help="вместо --since: взять N последних по place_extracted_at")
    ap.add_argument("--suspect-only", action="store_true",
                    help="только orange/red/yellow строки (где есть подозрение)")
    ap.add_argument("--group", default="grib_spb")
    ap.add_argument("--out", default="vk_districts_report.html")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    conn = psycopg.connect(build_dsn())

    if args.last:
        where = "p.place_extracted_at IS NOT NULL AND p.vk_group = %s"
        params: list = [args.group]
        order_limit = " ORDER BY p.place_extracted_at DESC LIMIT %s"
        params.append(args.last)
    else:
        cutoff = parse_since(args.since)
        where = "p.place_extracted_at >= %s AND p.vk_group = %s"
        params = [cutoff, args.group]
        order_limit = " ORDER BY p.place_extracted_at DESC"

    sql = f"""
        SELECT p.id, p.vk_group, p.post_id, p.date_ts, p.text,
               p.district_admin_area_id, p.district_confidence,
               p.place_match, p.place_extracted_at,
               (SELECT a.name_ru FROM admin_area a WHERE a.id = p.district_admin_area_id) AS d_name,
               (SELECT r.photo_species FROM vk_post_model_result r
                WHERE r.vk_post_id = p.id LIMIT 1) AS species
        FROM vk_post p
        WHERE {where}
        {order_limit}
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    print(f"posts: {len(rows)}")

    # classify
    classified = []
    counts = {"row-green": 0, "row-yellow": 0, "row-orange": 0, "row-red": 0, "row-gray": 0}
    for r in rows:
        (pid, vg, post_id, date_ts, text,
         did, conf, pm, extracted_at, d_name, species) = r
        cls = classify_row(did, conf, pm)
        counts[cls] += 1
        if args.suspect_only and cls not in ("row-orange", "row-red", "row-yellow"):
            continue
        classified.append((cls, pid, vg, post_id, date_ts, text, did, conf, pm, d_name, species))

    out = Path(args.out)
    with out.open("w", encoding="utf-8") as f:
        f.write(HTML_HEAD)
        f.write(f"<h1>VK districts report — {escape(args.group)}</h1>")

        f.write('<div class="stats">')
        f.write(f'<span><b>{len(rows)}</b> постов</span>')
        f.write(f'<span style="color:#2a8">green ({counts["row-green"]})</span>')
        f.write(f'<span style="color:#a80">yellow ({counts["row-yellow"]})</span>')
        f.write(f'<span style="color:#c60">orange ({counts["row-orange"]})</span>')
        f.write(f'<span style="color:#c00">red ({counts["row-red"]})</span>')
        f.write(f'<span style="color:#777">gray ({counts["row-gray"]})</span>')
        if args.suspect_only:
            f.write(f' <span><b>shown: {len(classified)}</b> (suspect only)</span>')
        f.write('</div>')

        # filter chips
        f.write('<div class="filters">'
                'Фильтр: '
                '<span class="f-btn" data-cls="row-green">green</span>'
                '<span class="f-btn" data-cls="row-yellow">yellow</span>'
                '<span class="f-btn" data-cls="row-orange">orange</span>'
                '<span class="f-btn" data-cls="row-red">red</span>'
                '<span class="f-btn" data-cls="row-gray">gray</span>'
                '<span class="f-btn" data-cls="*" style="background:#fff;border-color:#999">все</span>'
                '</div>')

        f.write('<table>')
        f.write('<tr><th>id / дата</th><th>текст</th><th>район</th>'
                '<th>place_match</th><th>виды</th></tr>')
        for (cls, pid, vg, post_id, date_ts, text, did, conf, pm, d_name, species) in classified:
            vk_url = f"https://vk.com/wall-{vg.replace('grib_spb','grib_spb')}_{post_id}" \
                if isinstance(post_id, int) else "#"
            # better: try resolving group id; fallback skip link
            date_str = date_ts.strftime("%Y-%m-%d %H:%M") if date_ts else "?"
            text_html = escape(text or "")[:2000]
            f.write(f'<tr class="{cls}" data-cls="{cls}">'
                    f'<td><div>#{pid}</div>'
                    f'<div class="post-meta">{date_str}</div>'
                    f'<div class="post-meta"><a href="https://vk.com/wall-{escape(str(vg))}_{escape(str(post_id))}" target="_blank">vk</a></div></td>'
                    f'<td class="text">{text_html}</td>'
                    f'<td class="district">{render_district(d_name, conf)}</td>'
                    f'<td class="match">{render_place_match(pm)}</td>'
                    f'<td>{render_species(species)}</td>'
                    f'</tr>')
        f.write('</table>')

        # filter script
        f.write("""
<script>
const btns = document.querySelectorAll('.f-btn');
const rows = document.querySelectorAll('tr[data-cls]');
let active = new Set();
function apply() {
  rows.forEach(r => {
    const c = r.getAttribute('data-cls');
    r.classList.toggle('hidden', active.size > 0 && !active.has(c));
  });
}
btns.forEach(b => b.addEventListener('click', () => {
  const c = b.dataset.cls;
  if (c === '*') { active.clear(); btns.forEach(x => x.classList.remove('active')); }
  else {
    if (active.has(c)) { active.delete(c); b.classList.remove('active'); }
    else { active.add(c); b.classList.add('active'); }
  }
  apply();
}));
</script>
</body></html>""")

    print(f"saved {out.resolve()}")
    if not args.no_open:
        webbrowser.open(out.resolve().as_uri())


if __name__ == "__main__":
    main()
