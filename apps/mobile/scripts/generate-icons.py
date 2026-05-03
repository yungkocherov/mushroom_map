#!/usr/bin/env python3
"""
Генерирует brand icon + adaptive-icon + splash для Geobiom Android.
Воспроизводит web-icon (apps/web/public/icon.svg): paper background,
тёмно-зелёная шляпа гриба, кремовая ножка.

Output:
    apps/mobile/assets/icon.png            1024×1024 (legacy + RuStore listing)
    apps/mobile/assets/adaptive-icon.png   1024×1024 foreground transparent (66% safe)
    apps/mobile/assets/splash.png          1242×2436 portrait splash background
    apps/mobile/assets/splash-logo.png     400×400 splash centerpiece

Usage (из репо-root):
    .venv/Scripts/python.exe apps/mobile/scripts/generate-icons.py

Требования: только Pillow (PIL).
"""
from pathlib import Path
from PIL import Image, ImageDraw

# ─── Brand palette (синхронизировано с packages/tokens) ─────────────────
PAPER = (245, 241, 230, 255)       # #f5f1e6
PAPER_RISE = (252, 249, 240, 255)  # #fcf9f0
FOREST = (45, 90, 58, 255)         # #2d5a3a — cap colour
RULE = (216, 210, 192, 255)        # #d8d2c0 — stem stroke

ASSETS = Path(__file__).resolve().parent.parent / "assets"
ASSETS.mkdir(exist_ok=True)


def draw_mushroom(img: Image.Image, *, scale: float = 1.0, transparent_bg: bool = False) -> None:
    """Нарисовать гриб в центре img. scale=1.0 → cap+stem ≈ side*scale."""
    W, H = img.size
    if not transparent_bg:
        img.paste(PAPER, (0, 0, W, H))

    draw = ImageDraw.Draw(img, mode="RGBA")

    # Footprint (cap_w × total_h) занимает квадрат size×size, scale задаёт
    # отношение этого квадрата к min(W,H). Внутри: cap = верхняя половина
    # эллипса cap_w×cap_h, stem ниже cap'а.
    size = min(W, H) * scale
    cap_w = size
    cap_h = size * 0.42
    stem_w = size * 0.30
    stem_h = size * 0.32
    total_h = cap_h + stem_h

    cx = W / 2
    top_y = (H - total_h) / 2

    # Cap — верхняя половина эллипса. PIL pieslice angles: 0°=3 o'clock,
    # 270°=top → диапазон 180°..360° даёт верхнюю половину (через 270°).
    # Ставим bbox высотой 2*cap_h, центр в (cx, top_y+cap_h) — но сам cap
    # рисуется только в верхней половине (выше центра bbox), т.е. от
    # top_y до top_y+cap_h. Это даёт высоту cap'а = cap_h.
    bbox_cy = top_y + cap_h
    cap_bbox = [
        cx - cap_w / 2,
        bbox_cy - cap_h,
        cx + cap_w / 2,
        bbox_cy + cap_h,
    ]
    draw.pieslice(cap_bbox, start=180, end=360, fill=FOREST)

    # Stem — rounded rect, верхний край вплотную к низу cap'а
    stem_top = top_y + cap_h
    stem_bottom = stem_top + stem_h
    radius = max(int(stem_w * 0.18), 4)
    stroke = max(int(size * 0.012), 1)
    draw.rounded_rectangle(
        [cx - stem_w / 2, stem_top, cx + stem_w / 2, stem_bottom],
        radius=radius,
        fill=PAPER_RISE,
        outline=RULE,
        width=stroke,
    )


def make_icon():
    img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mushroom(img, scale=0.62)
    out = ASSETS / "icon.png"
    img.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ASSETS.parent.parent)}: {out.stat().st_size:,} bytes")


def make_adaptive_icon():
    """
    Adaptive icon foreground: гриб на transparent background.
    Android applies background separately (configured в app.json
    `adaptiveIcon.backgroundColor`). Safe-area = 66% от 1024×1024,
    логотип ещё меньше чтоб не обрезался launcher mask'ой.
    """
    img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mushroom(img, scale=0.40, transparent_bg=True)
    out = ASSETS / "adaptive-icon.png"
    img.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ASSETS.parent.parent)}: {out.stat().st_size:,} bytes")


def make_splash():
    """
    Splash background: paper-фон с центральным логотипом.
    Размер 1242×2436 (iPhone 6.5" portrait — Expo дефолт; на Android
    Expo сам resize'нет под dpi'ы). resizeMode "contain" в app.json
    означает что центральный логотип сохранит aspect-ratio.
    """
    W, H = 1242, 2436
    img = Image.new("RGBA", (W, H), PAPER)
    # Внутренний логотип 400×400 нарисуем напрямую в этом канвасе
    cx, cy = W // 2, H // 2
    logo_size = 400
    logo = Image.new("RGBA", (logo_size, logo_size), (0, 0, 0, 0))
    draw_mushroom(logo, scale=0.85, transparent_bg=True)
    img.paste(logo, (cx - logo_size // 2, cy - logo_size // 2), logo)
    out = ASSETS / "splash.png"
    img.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ASSETS.parent.parent)}: {out.stat().st_size:,} bytes")


def make_splash_logo():
    """
    Standalone splash-logo для использования в SplashScreen компоненте,
    если в будущем перейдём с background-image splash на code-driven.
    """
    img = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    draw_mushroom(img, scale=0.85, transparent_bg=True)
    out = ASSETS / "splash-logo.png"
    img.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ASSETS.parent.parent)}: {out.stat().st_size:,} bytes")


def main():
    print("Generating Geobiom mobile icons -> apps/mobile/assets/")
    make_icon()
    make_adaptive_icon()
    make_splash()
    make_splash_logo()
    print("Done.")


if __name__ == "__main__":
    main()
