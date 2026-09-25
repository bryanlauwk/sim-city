"""Paint Maple Hollow's surface textures: red brick, clapboard siding and
asphalt shingles, as seamless 512x512 tiles in public/textures.

Requires Pillow. Run `python3 scripts/paint_town_textures.py`. The building
shader lays them out in world space (see scene/facade.ts).
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public" / "textures"
S = 512


def jitter(c, r, amount):
    return tuple(max(0, min(255, v + r.randint(-amount, amount))) for v in c)


def speckle(img, r, amount=10, count=9000):
    px = img.load()
    for _ in range(count):
        x, y = r.randrange(S), r.randrange(S)
        px[x, y] = jitter(px[x, y], r, amount)
    return img


def brick():
    r = random.Random(3)
    img = Image.new("RGB", (S, S), (176, 170, 160))  # mortar
    d = ImageDraw.Draw(img)
    rows, bw = 16, 64
    bh = S // rows
    for row in range(rows):
        off = (bw // 2) * (row % 2)
        for k in range(-1, S // bw + 1):
            x0 = k * bw + off + 2
            y0 = row * bh + 2
            base = r.choice([(150, 62, 48), (162, 70, 52), (138, 56, 44), (170, 84, 60), (128, 52, 42)])
            d.rectangle([x0, y0, x0 + bw - 5, y0 + bh - 5], fill=jitter(base, r, 10))
    return speckle(img, r, 14, 20000).filter(ImageFilter.GaussianBlur(0.6))


def clapboard():
    r = random.Random(5)
    img = Image.new("RGB", (S, S), (236, 234, 228))
    d = ImageDraw.Draw(img)
    boards = 16
    bh = S // boards
    for b in range(boards):
        y0 = b * bh
        tone = r.randint(-6, 6)
        d.rectangle([0, y0, S, y0 + bh], fill=(236 + tone, 234 + tone, 228 + tone))
        # Shadow under each board's lip.
        d.rectangle([0, y0 + bh - 5, S, y0 + bh], fill=(170, 168, 162))
        d.line([0, y0 + bh - 6, S, y0 + bh - 6], fill=(205, 203, 196), width=1)
        # Faint grain.
        for _ in range(6):
            gy = y0 + r.randint(2, bh - 8)
            d.line([0, gy, S, gy], fill=(226 + tone, 224 + tone, 218 + tone), width=1)
    return speckle(img, r, 6, 6000)


def shingles():
    r = random.Random(7)
    img = Image.new("RGB", (S, S), (70, 68, 66))
    d = ImageDraw.Draw(img)
    rows, sw = 16, 42
    sh = S // rows
    for row in range(rows):
        off = (sw // 2) * (row % 2)
        for k in range(-1, S // sw + 2):
            x0 = k * sw + off
            y0 = row * sh
            base = r.choice([(92, 88, 84), (84, 80, 78), (100, 96, 90), (76, 74, 72)])
            d.rectangle([x0 + 1, y0, x0 + sw - 2, y0 + sh - 3], fill=jitter(base, r, 8))
        d.line([0, row * sh + sh - 2, S, row * sh + sh - 2], fill=(44, 42, 40), width=2)
    return speckle(img, r, 22, 40000)


if __name__ == "__main__":
    for name, fn in [("red-brick", brick), ("clapboard", clapboard), ("shingles", shingles)]:
        fn().save(OUT / f"{name}.webp", quality=88)
        print("painted", name)
