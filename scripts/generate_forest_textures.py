"""
Процедурная генерация стилизованных bark-текстур для лесного слоя.

На вход ничего не нужно, на выход — seamless 256×256 PNG для каждого
slug'а из geodata.types.ForestTypeSlug. Текстуры кладутся в
``services/web/public/textures/forest/``, откуда Vite отдаёт их как
``/textures/forest/<slug>.png``.

Принцип seamlessness:
    все элементы паттерна размещаются полностью внутри кадра, плюс
    копии с wrap через np.roll по краям при необходимости. Для
    горизонтальных/вертикальных штрихов мы используем модульную
    арифметику и не даём чему-то пересекать границу.

Запуск:
    python scripts/generate_forest_textures.py

Можно передать ``--out DIR`` чтобы положить куда-то ещё,
``--size 512`` если нужны более крупные тайлы.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ─── Настройки ────────────────────────────────────────────────────────────────

DEFAULT_SIZE = 256
DEFAULT_OUT = Path(__file__).parent.parent / "services" / "web" / "public" / "textures" / "forest"

#: Все slug'и из ForestTypeSlug + unknown.
SLUGS: list[str] = [
    "pine",
    "spruce",
    "larch",
    "fir",
    "cedar",
    "birch",
    "aspen",
    "alder",
    "oak",
    "linden",
    "maple",
    "mixed_coniferous",
    "mixed_broadleaved",
    "mixed",
    "unknown",
]


# ─── Утилиты ──────────────────────────────────────────────────────────────────

def base_noise(size: int, base_rgb: tuple[int, int, int], amp: int = 12, seed: int = 0) -> Image.Image:
    """Плоский фон с очень лёгким гауссовым шумом. Полностью seamless
    (шум генерируется одним np.random и блюрится периодически)."""
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, amp, size=(size, size, 3)).astype(np.float32)
    # periodic blur: кладём 3x3 тайл + блюр + вырезаем центр
    big = np.tile(noise, (3, 3, 1))
    big_img = Image.fromarray(np.clip(big + 128, 0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(radius=2.2)
    )
    big_arr = np.asarray(big_img, dtype=np.int16) - 128
    center = big_arr[size : 2 * size, size : 2 * size, :]
    base = np.zeros((size, size, 3), dtype=np.int16) + np.array(base_rgb, dtype=np.int16)
    out = np.clip(base + center, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGB")


def to_rgba(img: Image.Image) -> Image.Image:
    if img.mode == "RGBA":
        return img
    out = img.convert("RGBA")
    # полный непрозрачный альфа-канал
    alpha = Image.new("L", img.size, 255)
    out.putalpha(alpha)
    return out


def seamless_wrap_draw(draw_fn):
    """Декоратор: рисует паттерн, затем копирует tile через np.roll
    по X и Y и берёт максимум — гарантирует отсутствие видимых швов
    при tile'инге. Работает для паттернов, где «темнее = элемент»."""

    def wrapper(size: int, seed: int, *args, **kwargs):
        img = draw_fn(size, seed, *args, **kwargs)
        arr = np.asarray(img, dtype=np.int16)
        # Сдвиги для проверки швов
        rolls = [
            np.roll(arr, size // 2, axis=0),
            np.roll(arr, size // 2, axis=1),
            np.roll(arr, (size // 2, size // 2), axis=(0, 1)),
        ]
        stacked = np.stack([arr] + rolls, axis=0)
        # берём минимум (= самое тёмное в любой копии), даёт seamless
        blended = np.min(stacked, axis=0)
        return Image.fromarray(blended.astype(np.uint8), mode="RGB")

    return wrapper


# ─── Паттерны для каждой породы ──────────────────────────────────────────────

def birch(size: int, seed: int = 1) -> Image.Image:
    """Берёза: белая кора с иконичными горизонтальными чёрными чертами."""
    bg = base_noise(size, (238, 232, 218), amp=10, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)

    # Горизонтальные «чечевички» — короткие, слегка изогнутые штрихи
    n_marks = int(size * 0.42)  # плотность
    for _ in range(n_marks):
        y = rng.randint(4, size - 4)
        length = rng.randint(6, 24)
        x = rng.randint(0, size - length)
        thickness = rng.choice([1, 1, 2])
        shade = rng.randint(25, 60)
        color = (shade, max(shade - 6, 10), max(shade - 10, 10))
        # небольшой вертикальный сдвиг в середине — делает штрих «живее»
        mid_x = x + length // 2
        mid_y_offset = rng.choice([-1, 0, 0, 1])
        if thickness == 1:
            draw.line([(x, y), (mid_x, y + mid_y_offset), (x + length, y)], fill=color, width=1)
        else:
            draw.line([(x, y), (mid_x, y + mid_y_offset), (x + length, y)], fill=color, width=2)

    # Редкие крупные тёмные "шрамы"
    n_scars = rng.randint(2, 5)
    for _ in range(n_scars):
        sx = rng.randint(8, size - 16)
        sy = rng.randint(8, size - 16)
        w = rng.randint(3, 6)
        h = rng.randint(1, 2)
        draw.ellipse([sx, sy, sx + w, sy + h], fill=(45, 30, 25))

    # Мягкое вертикальное затенение (будто извилины)
    arr = np.asarray(bg, dtype=np.int16)
    col_shade = np.sin(np.linspace(0, 4 * math.pi, size)) * 4
    arr += col_shade[None, :, None].astype(np.int16)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def pine(size: int, seed: int = 2) -> Image.Image:
    """Сосна: тёплый рыже-коричневый с длинными вертикальными трещинами."""
    bg = base_noise(size, (146, 88, 52), amp=14, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    rng = random.Random(seed)

    # Вертикальные борозды
    n_grooves = rng.randint(8, 12)
    for _ in range(n_grooves):
        x = rng.randint(0, size - 1)
        depth = rng.randint(22, 50)
        thickness = rng.choice([2, 2, 3, 4])
        # градиент между бороздой и фоном
        for dx in range(-thickness, thickness + 1):
            col = x + dx
            if 0 <= col < size:
                falloff = 1 - abs(dx) / (thickness + 0.5)
                arr[:, col, :] -= int(depth * falloff)

    # «Чешуи» сосновой коры — маленькие неровные пятна
    bg2 = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")
    draw = ImageDraw.Draw(bg2)
    n_plates = rng.randint(20, 35)
    for _ in range(n_plates):
        cx = rng.randint(0, size)
        cy = rng.randint(0, size)
        r = rng.randint(4, 10)
        tint = rng.randint(-14, 10)
        fill = (max(80 + tint, 0), max(55 + tint, 0), max(30 + tint, 0))
        # элементы полностью внутри tile (иначе шов), пропускаем слишком близкие к краю
        if cx - r < 0 or cx + r >= size or cy - r < 0 or cy + r >= size:
            continue
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    return bg2


def spruce(size: int, seed: int = 3) -> Image.Image:
    """Ель: тёмно-коричневый с мелкой чешуёй."""
    bg = base_noise(size, (62, 46, 28), amp=12, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)

    # Чешуйчатая структура — много мелких тёмных и светлых пятен
    n = int(size * size / 48)
    for _ in range(n):
        cx = rng.randint(0, size - 1)
        cy = rng.randint(0, size - 1)
        r = rng.randint(1, 3)
        shade = rng.choice([-22, -16, -10, 10, 16])
        fill = tuple(max(0, min(255, 62 + shade + rng.randint(-5, 5) + off)) for off in (0, -4, -10))
        if cx - r >= 0 and cx + r < size and cy - r >= 0 and cy + r < size:
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

    # Слабая горизонтальная полосатость
    arr = np.asarray(bg, dtype=np.int16)
    row_shade = np.sin(np.linspace(0, 10 * math.pi, size)) * 3
    arr += row_shade[:, None, None].astype(np.int16)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def fir(size: int, seed: int = 4) -> Image.Image:
    """Пихта: серо-голубоватый хвойный, более гладкий чем ель."""
    bg = base_noise(size, (86, 86, 78), amp=10, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    rng = random.Random(seed)

    # Длинные тонкие вертикальные полосы (пихтовая кора почти ровная)
    n_stripes = rng.randint(6, 10)
    for _ in range(n_stripes):
        x = rng.randint(0, size - 1)
        shade = rng.randint(-18, -10)
        thickness = rng.choice([1, 1, 2])
        for dx in range(thickness):
            col = (x + dx) % size
            arr[:, col, :] += shade
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def larch(size: int, seed: int = 5) -> Image.Image:
    """Лиственница: насыщенный рыже-красный с грубыми вертикальными трещинами."""
    bg = base_noise(size, (154, 70, 38), amp=16, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    rng = random.Random(seed)

    # Крупные вертикальные блоки тёмного цвета
    n_blocks = rng.randint(6, 10)
    for _ in range(n_blocks):
        x = rng.randint(5, size - 15)
        w = rng.randint(3, 6)
        y0 = rng.randint(0, size // 2)
        y1 = rng.randint(y0 + 20, size)
        for row in range(y0, y1):
            if 0 <= row < size:
                arr[row, x : x + w, :] -= rng.randint(30, 45)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def cedar(size: int, seed: int = 6) -> Image.Image:
    """Кедр: тёмно-бурый, плетёная структура."""
    bg = base_noise(size, (92, 58, 36), amp=12, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)

    # Перекрещивающиеся тёмные штрихи (плетёнка)
    draw = ImageDraw.Draw(Image.fromarray(arr.astype(np.uint8)))
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")
    d = ImageDraw.Draw(out)
    rng = random.Random(seed)
    for _ in range(40):
        cx = rng.randint(0, size - 1)
        cy = rng.randint(0, size - 1)
        length = rng.randint(8, 18)
        angle_choice = rng.choice([30, 150])  # два направления — плетёнка
        rad = math.radians(angle_choice)
        dx = int(length * math.cos(rad))
        dy = int(length * math.sin(rad))
        x1, y1 = cx, cy
        x2, y2 = cx + dx, cy + dy
        if 0 <= x2 < size and 0 <= y2 < size:
            d.line([(x1, y1), (x2, y2)], fill=(40, 24, 14), width=2)
    return out


def aspen(size: int, seed: int = 7) -> Image.Image:
    """Осина: серо-зелёный гладкий с мелкими тёмными точками."""
    bg = base_noise(size, (158, 164, 140), amp=10, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)
    for _ in range(int(size * 0.9)):
        x = rng.randint(3, size - 4)
        y = rng.randint(3, size - 4)
        r = rng.choice([1, 1, 1, 2])
        shade = rng.randint(30, 60)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(shade, shade + 5, shade - 5))
    return bg


def alder(size: int, seed: int = 8) -> Image.Image:
    """Ольха: серо-коричневый с тонкими вертикальными линиями."""
    bg = base_noise(size, (108, 88, 68), amp=12, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    rng = random.Random(seed)

    n_lines = rng.randint(18, 26)
    for _ in range(n_lines):
        x = rng.randint(0, size - 1)
        shade = rng.randint(-20, -10)
        arr[:, x, :] += shade
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def oak(size: int, seed: int = 9) -> Image.Image:
    """Дуб: глубокий тёмно-коричневый с грубой «кирпичной» корой."""
    bg = base_noise(size, (90, 60, 32), amp=14, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    rng = random.Random(seed)

    # Псевдо-кирпичная сетка: чередование смещённых рядов с тёмными швами
    brick_w, brick_h = 20, 11
    for row in range(0, size, brick_h):
        offset = (row // brick_h) % 2 * (brick_w // 2)
        for col_base in range(-brick_w, size + brick_w, brick_w):
            col = col_base + offset
            # рисуем 1-2px тёмный шов справа и снизу от каждого "кирпича"
            seam = rng.randint(25, 45)
            col_in = col + brick_w - 1
            if 0 <= col_in < size and 0 <= row < size:
                arr[row : row + brick_h, max(col_in - 1, 0) : col_in + 1, :] -= seam
            row_in = row + brick_h - 1
            if 0 <= row_in < size and 0 <= col < size:
                arr[max(row_in - 1, 0) : row_in + 1, max(col, 0) : col + brick_w, :] -= seam

    # Неровность границ: случайные тёмные пятна
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")
    draw = ImageDraw.Draw(out)
    for _ in range(rng.randint(40, 60)):
        cx = rng.randint(2, size - 3)
        cy = rng.randint(2, size - 3)
        r = rng.randint(1, 2)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(45, 24, 10))
    return out


def linden(size: int, seed: int = 10) -> Image.Image:
    """Липа: светло-бурый гладкий с тонкими линиями."""
    bg = base_noise(size, (164, 140, 114), amp=10, seed=seed)
    arr = np.asarray(bg, dtype=np.int16)
    row_shade = np.sin(np.linspace(0, 6 * math.pi, size)) * 6
    arr += row_shade[:, None, None].astype(np.int16)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def maple(size: int, seed: int = 11) -> Image.Image:
    """Клён: тёплый коричневый с ромбовидным рисунком."""
    bg = base_noise(size, (126, 86, 56), amp=12, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)

    # Диагональные линии в двух направлениях → ромбы
    step = 16
    for i in range(-size, size, step):
        draw.line([(i, 0), (i + size, size)], fill=(78, 48, 26), width=1)
        draw.line([(i, size), (i + size, 0)], fill=(78, 48, 26), width=1)
    return bg


def mixed_coniferous(size: int, seed: int = 12) -> Image.Image:
    """Смешанный хвойный: тёмно-бурый нейтральный."""
    bg = base_noise(size, (70, 58, 34), amp=12, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)
    for _ in range(30):
        cx = rng.randint(3, size - 4)
        cy = rng.randint(3, size - 4)
        r = rng.randint(1, 3)
        shade = rng.choice([-14, 10])
        fill = tuple(max(0, min(255, 70 + shade + off)) for off in (0, -6, -14))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    return bg


def mixed_broadleaved(size: int, seed: int = 13) -> Image.Image:
    """Смешанный лиственный: тёпло-бежевый."""
    bg = base_noise(size, (160, 132, 90), amp=12, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)
    for _ in range(int(size * 0.3)):
        x = rng.randint(3, size - 16)
        y = rng.randint(3, size - 4)
        length = rng.randint(6, 14)
        draw.line([(x, y), (x + length, y)], fill=(70, 48, 22), width=1)
    return bg


def mixed(size: int, seed: int = 14) -> Image.Image:
    """Смешанный: нейтральный лесной зелёный."""
    bg = base_noise(size, (96, 114, 68), amp=12, seed=seed)
    draw = ImageDraw.Draw(bg)
    rng = random.Random(seed)
    for _ in range(60):
        cx = rng.randint(3, size - 4)
        cy = rng.randint(3, size - 4)
        r = rng.randint(1, 2)
        shade = rng.choice([-12, 8])
        fill = tuple(max(0, min(255, 96 + shade + off)) for off in (-10, 0, -18))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    return bg


def unknown(size: int, seed: int = 15) -> Image.Image:
    """Неизвестный тип: нейтральный серо-зелёный, едва текстурированный."""
    return base_noise(size, (148, 152, 140), amp=8, seed=seed)


# ─── Диспетчер ────────────────────────────────────────────────────────────────

GENERATORS = {
    "pine": pine,
    "spruce": spruce,
    "larch": larch,
    "fir": fir,
    "cedar": cedar,
    "birch": birch,
    "aspen": aspen,
    "alder": alder,
    "oak": oak,
    "linden": linden,
    "maple": maple,
    "mixed_coniferous": mixed_coniferous,
    "mixed_broadleaved": mixed_broadleaved,
    "mixed": mixed,
    "unknown": unknown,
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE)
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = []
    for slug in SLUGS:
        gen = GENERATORS[slug]
        img = gen(args.size).convert("RGB")
        path = out_dir / f"{slug}.png"
        img.save(path, "PNG", optimize=True)
        manifest.append({"slug": slug, "file": f"{slug}.png", "size": args.size})
        print(f"  {slug:20s} -> {path.name} ({path.stat().st_size // 1024} KB)")

    (out_dir / "manifest.json").write_text(
        json.dumps({"size": args.size, "patterns": manifest}, indent=2),
        encoding="utf-8",
    )
    print(f"\nsaved {len(manifest)} textures to {out_dir}")


if __name__ == "__main__":
    main()
