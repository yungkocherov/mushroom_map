---
name: screenshot-prod-via-playwright
description: Use when user asks for a high-quality screenshot of a live geobiom page (lending cameo refresh, docs/methodology figures, sharing a specific map view). Captures real prod data including authoritative PMTiles render — better than dev preview which CORS-blocks api.geobiom.ru tiles. Avoid for quick visual smoke (preview_screenshot is faster); use this when the output is a file going into the repo.
---

# Screenshot prod page through headless playwright

Когда нужен high-quality static image живой prod-страницы (типично `/map` с включёнными слоями) — `mcp__Claude_Preview__preview_screenshot` не подходит:
- Возвращает JPEG в context, не на диск
- На worktree dev preview cross-origin `api.geobiom.ru` блокируется CORS — forest.pmtiles не грузится → пустая карта без forest
- MapLibre WebGL canvas создан с `preserveDrawingBuffer: false` → `canvas.toDataURL()` отдаёт пустую картинку

Playwright headless решает всё это: запускает реальный Chromium, идёт прямо на `https://geobiom.ru`, ждёт network idle, делает screenshot на полном rendered DOM (включая WebGL).

## Pre-flight

Один раз (~150MB места):

```bash
cd /c/tmp
export PATH="/c/Program Files/nodejs:$PATH"
npm install playwright@latest
npx playwright install chromium
```

`/c/tmp` — на ntfs C:\, не WSL'ный /tmp. Скачивается Chromium headless shell в `%USERPROFILE%\AppData\Local\ms-playwright\`.

## Базовый recipe (lending cameo, 4:5 portrait)

```js
// /c/tmp/snap.js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 2000 },
    deviceScaleFactor: 2,  // retina-grade output (final 1000×1250)
  });
  const page = await ctx.newPage();
  // Skip onboarding gate.
  await ctx.addInitScript(() => localStorage.setItem('geobiom_onboarded', '1'));

  // share-URL ловит все слои + режим через useShareUrlBootstrap (V4.5+):
  //   ?lat=&lon=&z=&layers=forest,wetland&bm=scheme&fcm=species&lf=
  await page.goto('https://geobiom.ru/map?lat=59.95&lon=30.30&z=8.4&layers=forest,wetland,waterway&fcm=species', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(14000);  // дотянуть PMTiles range-requests + label-tiles

  // Скрыть весь UI (см. селекторы ниже)
  await page.addStyleTag({ content: `
    [class*="MapTopBar"], [class*="_bar_"] { display: none !important; }
    [class*="floating"] { display: none !important; }
    [class*="_panel_"], aside[aria-label*="прогноз"] { display: none !important; }
    [aria-label="Написать автору"] { display: none !important; }
    .maplibregl-ctrl-bottom-right,
    .maplibregl-ctrl-bottom-left,
    .maplibregl-ctrl-attrib { display: none !important; }
    [role="dialog"], [role="listbox"] { display: none !important; }
  ` });
  await page.waitForTimeout(2000);

  // Crop в нужный aspect-ratio. 1600×2000 @ 2x = 3200×4000 raw.
  // Clip 960×1200 даёт 4:5 portrait — это родная aspect-ratio cameo
  // (см. LandingMapCameo.module.css `aspect-ratio: 4 / 5`).
  await page.screenshot({
    path: '/tmp/cameo-raw.png',  // запишется в /c/tmp/cameo-raw.png на Windows!
    clip: { x: 320, y: 0, width: 960, height: 1200 },
  });
  await browser.close();
  console.log('OK /tmp/cameo-raw.png');
})().catch(e => { console.error(e); process.exit(1); });
```

Запуск из `/c/tmp/`:

```bash
node snap.js  # ~30s (включая 14s wait для тайлов)
```

## Crop + downscale → final JPEG

Playwright дёт PNG 1920×2400 (clip × 2 DPR). Дальше Python+PIL:

```bash
.venv/Scripts/python.exe << 'EOF'
from PIL import Image
src = r'C:\tmp\cameo-raw.png'
dst = r'C:\Users\ikoch\mushroom-map\apps\web\public\landing-cameo.jpg'  # или нужный target
img = Image.open(src)
img = img.resize((1000, 1250), Image.LANCZOS)
if img.mode == 'RGBA':
    bg = Image.new('RGB', img.size, (244, 237, 224))  # --paper tone
    bg.paste(img, mask=img.split()[3])
    img = bg
img.save(dst, 'JPEG', quality=88, optimize=True, progressive=True)
EOF
```

JPEG q88 → ~300-400 KB. Меньше — обычно зернит подписи населённых пунктов.

## Гача и почему именно так

- **`/c/tmp/` НЕ `/tmp/`** — Git-Bash's `/tmp` mapped в Windows TEMP, playwright runs from там не любит spaces. `/c/tmp/` = `C:\tmp\` — short ASCII path.
- **Cwd cleanup**: `playwright install` качает в `%LOCALAPPDATA%\ms-playwright`, не в проект. После сессии можно `rm -rf /c/tmp/node_modules` если место надо.
- **14s waitForTimeout** — не magic. PMTiles делает HTTP Range requests за tile blocks (4KB-256KB). `networkidle` 500ms не гарантирует что все zoom-13 tiles распарсились — нужно give explicit slack. На медленной сети поднимать до 20s.
- **`deviceScaleFactor: 2`** — без него labels будут blurry после downscale 1600→1000. С 2 DPR raw render = 3200×4000, downscale до 1000×1250 имеет 3x super-sampling → крупнее labels.
- **`addStyleTag` после goto+wait** — если до wait, MapLibre может re-add UI на rerender'ах.
- **Если нужен другой aspect ratio** — поменять `clip` пропорции: 4:5 = 960×1200, 16:9 = 1600×900, 1:1 = 1200×1200 и т.д.

## Когда НЕ использовать

- **Quick visual smoke** (юзер просит «посмотри как выглядит» в чате) → `mcp__Claude_Preview__preview_screenshot` — быстрее, без install
- **Debug DOM/styles** на dev edit'ах → preview_eval/preview_inspect — playwright это против прода, отвлечь
- **Документация production-flow** где нужны 5+ кадров → playwright OK, но lookup в browser MCP который умеет cookies / auth

## Где лежит файл сейчас

`apps/web/public/landing-cameo.jpg` — лендинг cameo. После commit + push deploy-web rsync'ит на оба VM (TimeWeb + Oracle). Через секунду доступен на `https://geobiom.ru/landing-cameo.jpg`.
