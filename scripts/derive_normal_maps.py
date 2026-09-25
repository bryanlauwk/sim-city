"""Derive subtle tangent-space normals from the scene's painted surface maps.

Requires Pillow. Run from the repository root with
`python3 scripts/derive_normal_maps.py` after replacing an albedo image.
"""

from math import sqrt
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


TEXTURES = Path(__file__).resolve().parents[1] / "public" / "textures"
STRENGTHS = {
    "tapir-fur": 2.4,
    "hornbill-feather": 2.0,
    "durian-rind": 4.2,
    "whale-skin": 1.7,
    "kaiju-scales": 4.0,
    "wet-asphalt": 3.4,
    "heritage-plaster": 2.2,
    "kampung-wood": 2.8,
    "terracotta-roof": 2.7,
}


def derive(name: str, strength: float) -> None:
    source = Image.open(TEXTURES / f"{name}.webp").convert("L")
    source = source.resize((512, 512), Image.Resampling.LANCZOS)
    high_pass = ImageChops.subtract(
        source, source.filter(ImageFilter.GaussianBlur(radius=8)), offset=128
    )
    flatten = getattr(high_pass, "get_flattened_data", high_pass.getdata)
    heights = list(flatten())
    width, height = source.size
    pixels = bytearray(width * height * 3)

    for y in range(height):
        above = ((y - 1) % height) * width
        below = ((y + 1) % height) * width
        row = y * width
        for x in range(width):
            left = (x - 1) % width
            right = (x + 1) % width
            dx = (heights[row + right] - heights[row + left]) * strength / 255
            dy = (heights[below + x] - heights[above + x]) * strength / 255
            length = sqrt(dx * dx + dy * dy + 1)
            offset = (row + x) * 3
            pixels[offset] = round(127.5 * (1 - dx / length))
            pixels[offset + 1] = round(127.5 * (1 - dy / length))
            pixels[offset + 2] = round(127.5 * (1 + 1 / length))

    Image.frombytes("RGB", source.size, bytes(pixels)).save(
        TEXTURES / f"{name}.normal.webp", "WEBP", quality=93, method=6
    )


if __name__ == "__main__":
    for texture, strength in STRENGTHS.items():
        derive(texture, strength)
