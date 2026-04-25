#!/usr/bin/env python3
"""Convert rosie_emoji.jpg into a transparent-background PNG emoji.

Strategy:
  1. Flood-fill from the four image corners to detect the near-white
     background (handles JPEG fringing with a tolerance).
  2. Mask those pixels to alpha=0.
  3. Slightly feather the edge with a tiny blur so the cutout isn't jagged.
  4. Crop to the content bounding box and export square sizes suitable for
     emoji / avatar use (512, 256, 128, 64).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path("/home/lanhammer/.openclaw/workspace/rosie_emoji.jpg")
OUT_DIR = Path("/home/lanhammer/.openclaw/workspace/avatars")
OUT_DIR.mkdir(parents=True, exist_ok=True)

TOLERANCE = 28  # how close to white counts as background


def flood_background(img: Image.Image, tol: int = TOLERANCE) -> Image.Image:
    """Return an L-mode alpha mask: 0 = background, 255 = subject."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    bg = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    seeds: list[tuple[int, int]] = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for sx, sy in seeds:
        r, g, b = px[sx, sy]
        if r >= 255 - tol and g >= 255 - tol and b >= 255 - tol:
            q.append((sx, sy))
            bg[sx][sy] = True

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[nx][ny]:
                r, g, b = px[nx, ny]
                # "Near-white" test: high minimum + low channel spread.
                if min(r, g, b) >= 255 - tol and max(r, g, b) - min(r, g, b) <= tol:
                    bg[nx][ny] = True
                    q.append((nx, ny))

    mask = Image.new("L", (w, h), 255)
    mpx = mask.load()
    for x in range(w):
        col = bg[x]
        for y in range(h):
            if col[y]:
                mpx[x, y] = 0
    return mask


def square_canvas(img: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    """Crop to content, then paste onto a square transparent canvas with padding."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas_side = side + pad * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(img, ((canvas_side - w) // 2, (canvas_side - h) // 2), img)
    return canvas


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    mask = flood_background(src)
    # Feather the edge a touch to soften JPEG fringing.
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.8))
    src.putalpha(mask)

    squared = square_canvas(src)

    full = OUT_DIR / "rosie.png"
    squared.save(full, optimize=True)
    print(f"wrote {full} ({squared.size[0]}x{squared.size[1]})")

    for size in (512, 256, 128, 64):
        resized = squared.resize((size, size), Image.LANCZOS)
        out = OUT_DIR / f"rosie_{size}.png"
        resized.save(out, optimize=True)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
