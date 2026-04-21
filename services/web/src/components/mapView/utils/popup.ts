import type {
  ForestAtResponse,
  SoilAtResponse,
  WaterDistanceResponse,
  TerrainAtResponse,
} from "../../../lib/api";

const FOREST_NAMES: Record<string, string> = {
  pine: "Сосновый лес",
  spruce: "Ельник",
  larch: "Лиственничник",
  fir: "Пихтовый лес",
  cedar: "Кедровник",
  birch: "Берёзовый лес",
  aspen: "Осинник",
  alder: "Ольшаник",
  oak: "Дубрава",
  linden: "Липовый лес",
  maple: "Кленовый лес",
  mixed_coniferous: "Смешанный хвойный",
  mixed_broadleaved: "Смешанный лиственный",
  mixed: "Смешанный лес",
  unknown: "Лес (тип не определён)",
};

const EDIBILITY_STYLE: Record<string, string> = {
  edible: "color:#2e7d32;font-weight:600",
  conditionally_edible: "color:#e65100;font-weight:600",
  inedible: "color:#757575",
  toxic: "color:#c62828;font-weight:600",
  deadly: "color:#b71c1c;font-weight:700",
};

const MONTH_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const ROMAN = ["", "I", "II", "III", "IV", "V"];

// Виды, интересные грибникам. Остальные скрыты по умолчанию.
const PRIORITY_SPECIES = new Set([
  "Белый гриб",
  "Лисичка обыкновенная",
  "Лисичка трубчатая",
  "Подосиновик красный",
  "Подосиновик жёлто-бурый",
  "Подберёзовик обыкновенный",
  "Опёнок осенний",
  "Опёнок летний",
  "Сморчок настоящий",
  "Груздь настоящий",
  "Рыжик сосновый",
  "Маслёнок настоящий",
  "Маслёнок зернистый",
]);

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;
}

const WATER_KIND_LABEL: Record<string, string> = {
  waterway:   "ручей/река",
  water_zone: "водоохранная зона",
  wetland:    "болото",
};

function buildWaterHtml(water: WaterDistanceResponse | null): string {
  if (!water || !water.nearest) return "";
  const n = water.nearest;
  const label = WATER_KIND_LABEL[n.kind] ?? n.kind;
  const named = n.name ? ` «${n.name}»` : "";
  // Покажем все три источника если они разные — даёт понимание контекста
  const bs = water.by_source;
  const detailBits: string[] = [];
  if (bs.waterway && bs.waterway !== n) detailBits.push(`ручей ${fmtDistance(bs.waterway.distance_m)}`);
  if (bs.wetland  && bs.wetland  !== n) detailBits.push(`болото ${fmtDistance(bs.wetland.distance_m)}`);
  return `
    <div style="margin-top:6px;font-size:11px;color:#555">
      💧 До воды: <b>${fmtDistance(n.distance_m)}</b> (${label}${named})
      ${detailBits.length ? `<div style="font-size:10px;color:#888;margin-top:1px">${detailBits.join(" · ")}</div>` : ""}
    </div>`;
}

const ASPECT_RU: Record<string, string> = {
  N: "С", NE: "СВ", E: "В", SE: "ЮВ",
  S: "Ю", SW: "ЮЗ", W: "З", NW: "СЗ",
};

function buildTerrainHtml(t: TerrainAtResponse | null): string {
  if (!t || t.elevation_m == null) return "";
  const bits: string[] = [`${Math.round(t.elevation_m)} м`];
  if (t.slope_deg != null && t.slope_deg >= 0.5) {
    const aspect = t.aspect_cardinal ? ASPECT_RU[t.aspect_cardinal] ?? t.aspect_cardinal : null;
    bits.push(`склон ${t.slope_deg.toFixed(1)}°${aspect ? ` на ${aspect}` : ""}`);
  }
  return `
    <div style="margin-top:6px;font-size:11px;color:#555">
      ⛰ Рельеф: <b>${bits.join(" · ")}</b>
    </div>`;
}

function buildSoilHtml(soil: SoilAtResponse | null): string {
  if (!soil || !soil.polygon) return "";
  const p = soil.polygon;
  const accomp = [p.soil1, p.soil2, p.soil3].filter(Boolean).map(s => s!.descript);
  const parent = p.parent1?.name;
  const profile = soil.profile_nearest;
  const profileBits: string[] = [];
  if (profile) {
    if (profile.ph_h2o != null) profileBits.push(`pH ${profile.ph_h2o.toFixed(1)}`);
    if (profile.corg   != null) profileBits.push(`Cорг ${profile.corg.toFixed(1)}%`);
    profileBits.push(`разрез ${profile.distance_km.toFixed(0)} км`);
  }
  return `
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #eee">
      <div style="font-size:11px;color:#888;margin-bottom:3px">Почва</div>
      <div style="font-size:12px;color:#333">${p.soil0.descript}</div>
      ${accomp.length ? `<div style="font-size:10px;color:#888;margin-top:1px">+ ${accomp.join("; ")}</div>` : ""}
      ${parent ? `<div style="font-size:10px;color:#888;margin-top:1px">Порода: ${parent}</div>` : ""}
      ${profileBits.length ? `<div style="font-size:10px;color:#666;margin-top:2px">${profileBits.join(" · ")}</div>` : ""}
    </div>`;
}

export function buildPopupHtml(
  data: ForestAtResponse,
  soil?: SoilAtResponse | null,
  water?: WaterDistanceResponse | null,
  terrain?: TerrainAtResponse | null,
): string {
  if (!data.forest) {
    return `<div style="font-family:sans-serif;padding:4px 2px;color:#555">
      Вне лесных полигонов${buildTerrainHtml(terrain ?? null)}${buildWaterHtml(water ?? null)}${buildSoilHtml(soil ?? null)}
    </div>`;
  }

  const f = data.forest;
  const forestName = FOREST_NAMES[f.dominant_species] ?? f.dominant_species;
  const areaStr = f.area_m2 ? `${(f.area_m2 / 10_000).toFixed(1)} га` : "";
  const curMonth = new Date().getMonth() + 1;

  const metaBits: string[] = [];
  if (f.bonitet != null && f.bonitet >= 1 && f.bonitet <= 5)
    metaBits.push(`бонитет ${ROMAN[f.bonitet]}`);
  if (f.timber_stock != null)
    metaBits.push(`${Math.round(f.timber_stock)} м³/га`);
  if (f.age_group != null)
    metaBits.push(f.age_group);
  const metaStr = metaBits.join(" · ");

  const speciesRows = data.species_theoretical
    .slice(0, 12)
    .map((s) => {
      const style = EDIBILITY_STYLE[s.edibility ?? ""] ?? "color:#333";
      const inSeason = (s.season_months ?? []).includes(curMonth);
      const isPriority = PRIORITY_SPECIES.has(s.name_ru);
      const months = (s.season_months ?? [])
        .map((m) =>
          m === curMonth
            ? `<b style="text-decoration:underline">${MONTH_SHORT[m - 1]}</b>`
            : MONTH_SHORT[m - 1]
        )
        .join("&thinsp;");
      const aff = s.affinity ? Math.round(s.affinity * 100) : 0;
      return `<tr class="sp-row" data-p="${isPriority ? 1 : 0}" data-s="${inSeason ? 1 : 0}"
          style="display:${isPriority ? "table-row" : "none"}">
        <td style="${style};padding:2px 6px 2px 0">${s.name_ru}</td>
        <td style="color:#aaa;font-size:10px;padding:2px 6px 2px 0;font-style:italic">${s.name_lat ?? ""}</td>
        <td style="font-size:10px;color:#555;padding:2px 6px 2px 0;white-space:nowrap">${months}</td>
        <td style="font-size:10px;color:#888;padding:2px 0">${aff}%</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:sans-serif;font-size:13px;min-width:0;max-width:100%;line-height:1.4">
    <div style="margin-bottom:6px">
      <strong style="font-size:14px">${forestName}</strong>
      ${areaStr ? `<span style="font-size:11px;color:#aaa;margin-left:8px">${areaStr}</span>` : ""}
      ${metaStr ? `<div style="font-size:11px;color:#888;margin-top:2px">${metaStr}</div>` : ""}
    </div>
    ${speciesRows ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;color:#888">Виды грибов</span>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="font-size:10px;color:#666;cursor:pointer;display:flex;align-items:center;gap:3px">
            <input type="checkbox" id="sp-all-cb" style="margin:0"
              onchange="const ns=document.getElementById('sp-filter-cb').checked;document.querySelectorAll('.sp-row').forEach(r=>{r.style.display=(this.checked||r.dataset.p=='1')&&(!ns||r.dataset.s=='1')?'table-row':'none'})">
            все виды
          </label>
          <label style="font-size:10px;color:#666;cursor:pointer;display:flex;align-items:center;gap:3px">
            <input type="checkbox" id="sp-filter-cb" style="margin:0"
              onchange="const all=document.getElementById('sp-all-cb').checked;document.querySelectorAll('.sp-row').forEach(r=>{r.style.display=(all||r.dataset.p=='1')&&(!this.checked||r.dataset.s=='1')?'table-row':'none'})">
            в сезоне
          </label>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:10px;color:#aaa;border-bottom:1px solid #eee">
          <th style="text-align:left;padding:0 6px 3px 0">Гриб</th>
          <th></th>
          <th style="text-align:left;padding:0 6px 3px 0">Сезон</th>
          <th style="text-align:left">Афф.</th>
        </tr></thead>
        <tbody>${speciesRows}</tbody>
      </table>`
    : `<p style="color:#aaa;font-size:12px;margin:0">Нет данных о видах для этого типа леса</p>`}
    ${buildTerrainHtml(terrain ?? null)}
    ${buildWaterHtml(water ?? null)}
    ${buildSoilHtml(soil ?? null)}
  </div>`;
}
