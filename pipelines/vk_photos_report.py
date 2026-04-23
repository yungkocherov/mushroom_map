"""
Генерирует HTML-отчёт с фото и ответами моделей для последних обработанных
постов. Если в vk_post_model_result есть результаты нескольких моделей —
каждая получает отдельную колонку.

Запуск:
  python pipelines/vk_photos_report.py
  python pipelines/vk_photos_report.py --limit 200 --out report.html
  python pipelines/vk_photos_report.py --include-empty
"""

from __future__ import annotations

import argparse
import os
import webbrowser
from collections import defaultdict
from html import escape
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def build_dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    return "postgresql://mushroom:mushroom_dev@127.0.0.1:5434/mushroom_map"


HTML_HEAD = """<!doctype html>
<html><head><meta charset="utf-8"><title>VK photos report</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 16px;
         background: #fafafa; color: #222; }
  h1   { font-size: 18px; }
  .stats { background: #fff; padding: 10px 14px; border: 1px solid #ddd;
           border-radius: 6px; margin-bottom: 14px; font-size: 13px; }
  .stats span { display: inline-block; margin-right: 18px; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top;
           font-size: 13px; }
  th { background: #eee; text-align: left; position: sticky; top: 0; }
  td.photos img { height: 110px; margin: 2px; border: 1px solid #ccc;
                  border-radius: 4px; }
  td.cls { font-size: 12px; min-width: 180px; max-width: 260px; }
  .empty { color: #aaa; font-style: italic; font-size: 11px; }
  .post-meta { font-size: 11px; color: #888; }
  a { color: #06c; text-decoration: none; }
  a:hover { text-decoration: underline; }
  /* zebra-striping убран — создавал эффект затемнения на фото-карточках */
  .sp-badge { display: inline-block; background: #eef; padding: 1px 6px;
              border-radius: 3px; margin: 1px 1px 2px; border: 1px solid #cce; }
  .sp-badge.other { background: #fee; border-color: #ecc; }
  .model-header { font-size: 11px; font-weight: normal; color: #555;
                  display: block; margin-bottom: 4px; }
  .filters { background: #fff; padding: 10px 14px; border: 1px solid #ddd;
             border-radius: 6px; margin-bottom: 14px; font-size: 13px;
             position: sticky; top: 0; z-index: 10; }
  .filters .hint { color: #888; margin-right: 10px; font-size: 12px; }
  .f-btn { display: inline-block; background: #eef; padding: 3px 9px;
           border-radius: 4px; margin: 2px; border: 1px solid #cce;
           cursor: pointer; user-select: none; font-size: 12px; }
  .f-btn:hover { background: #dde; }
  .f-btn.active { background: #06c; color: #fff; border-color: #06c; }
  .f-btn.other { background: #fee; border-color: #ecc; }
  .f-btn.other.active { background: #c40; border-color: #c40; color: #fff; }
  .f-btn .cnt { color: #888; margin-left: 4px; font-size: 11px; }
  .f-btn.active .cnt { color: #cce; }
  .f-clear { background: #fff; border: 1px solid #999; color: #555; }
  tr.hidden { display: none; }
</style></head><body>
"""


def render_species(species: list[dict] | None) -> str:
    if not species:
        return '<span class="empty">—</span>'
    parts = []
    for it in species:
        sp = it.get("species", "?")
        cnt = it.get("count", 0)
        n_p = it.get("n_photos", "?")
        n_s = it.get("photos_sampled", "?")
        cls = "sp-badge other" if sp == "other" else "sp-badge"
        parts.append(
            f'<div><span class="{cls}">{escape(sp)}</span> '
            f'&times;{cnt} '
            f'<span class="post-meta">({n_p}/{n_s})</span></div>'
        )
    return "".join(parts)


def short_model(model: str) -> str:
    """google/gemma-3-12b → gemma-3-12b"""
    return model.split("/")[-1] if "/" in model else model


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--group",   default="grib_spb")
    ap.add_argument("--limit",   type=int, default=200)
    ap.add_argument("--out",     default="vk_photos_report.html")
    ap.add_argument("--date-from", help="ISO дата (YYYY-MM-DD), включая")
    ap.add_argument("--date-to",   help="ISO дата (YYYY-MM-DD), исключая")
    ap.add_argument("--include-empty", action="store_true",
                    help="показывать посты где все модели ничего не нашли")
    ap.add_argument("--random", action="store_true",
                    help="случайная выборка вместо последних по дате")
    ap.add_argument("--month", type=int, nargs="+",
                    help="фильтр по месяцам (1-12), например --month 7 8 9")
    ap.add_argument("--prompt-version",
                    help="SQL LIKE-паттерн для vk_post.photo_prompt_version, "
                         "например 'v9%%' или 'v10-balance%%'")
    ap.add_argument("--species", nargs="+",
                    help="оставить только посты, в которых ХОТЯ БЫ ОДНА модель "
                         "вернула что-то из этого списка видов")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    conn = psycopg.connect(build_dsn())

    # Посты с хотя бы одним результатом в vk_post_model_result.
    # Без --include-empty отфильтровываем на уровне SQL те, где все модели
    # вернули пустой массив — иначе при --random 500 из 30k постов только
    # ~50 окажутся с грибами.
    if args.include_empty:
        result_cond = "EXISTS (SELECT 1 FROM vk_post_model_result r WHERE r.vk_post_id = p.id)"
    else:
        result_cond = ("EXISTS (SELECT 1 FROM vk_post_model_result r "
                       "WHERE r.vk_post_id = p.id "
                       "AND jsonb_array_length(COALESCE(r.photo_species, '[]'::jsonb)) > 0)")
    posts_sql = f"""
        SELECT p.id, p.post_id, p.date_ts, p.text, p.photo_urls
        FROM vk_post p
        WHERE p.vk_group = %s
          AND {result_cond}
    """
    params: list = [args.group]
    if args.date_from:
        posts_sql += " AND p.date_ts >= %s"
        params.append(args.date_from)
    if args.date_to:
        posts_sql += " AND p.date_ts < %s"
        params.append(args.date_to)
    if args.month:
        posts_sql += " AND EXTRACT(MONTH FROM p.date_ts) = ANY(%s)"
        params.append(args.month)
    if args.prompt_version:
        posts_sql += " AND p.photo_prompt_version LIKE %s"
        params.append(args.prompt_version)
    if args.species:
        posts_sql += (
            " AND EXISTS (SELECT 1 FROM vk_post_model_result r2,"
            " LATERAL jsonb_array_elements(COALESCE(r2.photo_species,'[]'::jsonb)) s"
            " WHERE r2.vk_post_id = p.id AND s->>'species' = ANY(%s))"
        )
        params.append(args.species)
    if args.random:
        posts_sql += " ORDER BY random() LIMIT %s"
    else:
        posts_sql += " ORDER BY p.date_ts DESC, p.id DESC LIMIT %s"
    params.append(args.limit)

    posts = conn.execute(posts_sql, params).fetchall()

    if not posts:
        print("нет обработанных постов в vk_post_model_result")
        conn.close()
        return

    post_ids = [row[0] for row in posts]

    # Все модельные результаты для этих постов
    results_sql = """
        SELECT vk_post_id, model, prompt_version, photo_species
        FROM vk_post_model_result
        WHERE vk_post_id = ANY(%s)
        ORDER BY model
    """
    result_rows = conn.execute(results_sql, [post_ids]).fetchall()
    conn.close()

    # model_results[post_id][model] = photo_species list
    model_results: dict[int, dict[str, list]] = defaultdict(dict)
    models_seen: list[str] = []
    for vk_post_id, model, _ver, species in result_rows:
        model_results[vk_post_id][model] = species or []
        if model not in models_seen:
            models_seen.append(model)
    models_seen.sort()

    # Фильтр --include-empty
    if not args.include_empty:
        posts = [
            p for p in posts
            if any(
                model_results[p[0]].get(m)
                for m in models_seen
            )
        ]

    print(f"posts: {len(posts)}  models: {models_seen}")

    # Статистика по видам на модель
    sp_counts: dict[str, dict[str, int]] = {m: {} for m in models_seen}
    for pid, _, _, _, _ in posts:
        for m in models_seen:
            for it in model_results[pid].get(m, []):
                sp = it.get("species", "?")
                sp_counts[m][sp] = sp_counts[m].get(sp, 0) + 1

    out = Path(args.out)
    with out.open("w", encoding="utf-8") as f:
        f.write(HTML_HEAD)
        f.write(f"<h1>VK photos report — {escape(args.group)}</h1>")

        f.write('<div class="stats">')
        f.write(f'<span><b>{len(posts)}</b> постов</span>')
        for m in models_seen:
            n = sum(1 for p in posts if model_results[p[0]].get(m))
            f.write(f'<span><b>{short_model(m)}</b>: '
                    f'{n} с грибами ({100*n//max(len(posts),1)}%)</span>')
        f.write('<br>')
        for m in models_seen:
            f.write(f'<b>{short_model(m)}:</b> ')
            for sp, n in sorted(sp_counts[m].items(), key=lambda x: -x[1]):
                cls = "sp-badge other" if sp == "other" else "sp-badge"
                f.write(f'<span class="{cls}">{escape(sp)}&times;{n}</span> ')
            f.write('&nbsp;&nbsp; ')
        f.write('</div>')

        # Панель фильтров — все уникальные виды, кликабельно (multi-select, OR)
        all_species: dict[str, int] = {}
        for pid, *_ in posts:
            for m in models_seen:
                for it in model_results[pid].get(m, []):
                    sp = it.get("species", "?")
                    all_species[sp] = all_species.get(sp, 0) + 1
        MONTH_NAMES = {
            1: "янв", 2: "фев", 3: "мар", 4: "апр", 5: "май", 6: "июн",
            7: "июл", 8: "авг", 9: "сен", 10: "окт", 11: "ноя", 12: "дек",
        }
        months_seen: dict[int, int] = {}
        for _, _, date_ts, _, _ in posts:
            m = date_ts.month
            months_seen[m] = months_seen.get(m, 0) + 1

        f.write('<div class="filters">')
        f.write('<span class="hint">Месяц:</span>')
        for m in sorted(months_seen):
            f.write(f'<span class="f-btn" data-month="{m}">'
                    f'{MONTH_NAMES[m]}<span class="cnt">{months_seen[m]}</span></span>')
        f.write('<span class="hint" style="margin-left:14px">Вид:</span>')
        for sp, n in sorted(all_species.items(), key=lambda x: -x[1]):
            cls = "f-btn other" if sp == "other" else "f-btn"
            f.write(f'<span class="{cls}" data-sp="{escape(sp)}">'
                    f'{escape(sp)}<span class="cnt">{n}</span></span>')
        f.write('<span class="f-btn f-clear" id="f-clear">сброс</span>')
        f.write('<span id="f-count" style="margin-left:12px;color:#555;font-size:12px;">—</span>')
        f.write('</div>')

        # Заголовок таблицы
        model_col_w = max(10, 60 // max(len(models_seen), 1))
        f.write('<table id="report-table"><tr>')
        f.write('<th style="width:80px">Пост</th>')
        f.write('<th>Фото</th>')
        for m in models_seen:
            f.write(f'<th style="width:{model_col_w}%">{escape(short_model(m))}</th>')
        f.write('<th style="width:18%">Текст</th>')
        f.write('</tr>')

        for pk, post_id, date_ts, text, urls in posts:
            vk_url = f"https://vk.com/{args.group}?w=wall_{post_id}"
            # Все виды во всех моделях этого поста — для data-атрибута
            row_species = set()
            for m in models_seen:
                for it in model_results[pk].get(m, []):
                    row_species.add(it.get("species", "?"))
            sp_attr = " ".join(sorted(row_species))
            f.write(f'<tr data-species="{escape(sp_attr)}" data-month="{date_ts.month}">')

            # Мета
            f.write(f'<td><a href="{escape(vk_url)}" target="_blank">#{post_id}</a>'
                    f'<br><span class="post-meta">{date_ts.date()}</span></td>')

            # Фото
            f.write('<td class="photos">')
            for url in (urls or []):
                f.write(f'<a href="{escape(url)}" target="_blank">'
                        f'<img src="{escape(url)}" loading="lazy"></a>')
            f.write('</td>')

            # Одна колонка на модель
            for m in models_seen:
                species = model_results[pk].get(m)
                f.write(f'<td class="cls">{render_species(species)}</td>')

            # Текст
            text_short = (text or "")[:250] + ("…" if text and len(text) > 250 else "")
            f.write(f'<td><span class="post-meta">{escape(text_short)}</span></td>')
            f.write('</tr>')

        f.write('</table>')
        f.write('''<script>
(function() {
  const activeSpecies = new Set();
  const activeMonths  = new Set();
  const spBtns    = document.querySelectorAll('.f-btn[data-sp]');
  const monthBtns = document.querySelectorAll('.f-btn[data-month]');
  const rows      = document.querySelectorAll('#report-table tr[data-species]');
  const clearBtn  = document.getElementById('f-clear');
  const countEl   = document.getElementById('f-count');
  const total     = rows.length;

  function apply() {
    let shown = 0;
    rows.forEach(r => {
      let visible = true;
      if (activeMonths.size > 0) {
        visible = activeMonths.has(r.dataset.month);
      }
      if (visible && activeSpecies.size > 0) {
        const sp = new Set((r.dataset.species || '').split(' '));
        visible = false;
        for (const s of activeSpecies) if (sp.has(s)) { visible = true; break; }
      }
      r.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    if (countEl) countEl.textContent = 'видно ' + shown + ' из ' + total;
  }

  spBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sp = btn.dataset.sp;
      if (activeSpecies.has(sp)) { activeSpecies.delete(sp); btn.classList.remove('active'); }
      else                       { activeSpecies.add(sp);    btn.classList.add('active'); }
      apply();
    });
  });
  monthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.month;
      if (activeMonths.has(m)) { activeMonths.delete(m); btn.classList.remove('active'); }
      else                     { activeMonths.add(m);    btn.classList.add('active'); }
      apply();
    });
  });
  clearBtn.addEventListener('click', () => {
    activeSpecies.clear();
    activeMonths.clear();
    spBtns.forEach(b => b.classList.remove('active'));
    monthBtns.forEach(b => b.classList.remove('active'));
    apply();
  });
  apply();
})();
</script>''')
        f.write('</body></html>')

    print(f"saved: {out.resolve()}")
    if not args.no_open:
        webbrowser.open(out.resolve().as_uri())


if __name__ == "__main__":
    main()
