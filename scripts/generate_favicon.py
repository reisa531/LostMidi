#!/usr/bin/env python3
"""生成 Lost MIDI Archive 的 favicon.ico。

采用站点页眉的砖红色软盘标识。

输出：frontend/src/app/favicon.ico
  16 / 32 / 48 / 64 / 128 / 256 六种尺寸；
  16 / 32 / 48 以 BMP 存储，64 / 128 / 256 以 PNG 存储（兼容性最佳实践）。

用法：python scripts/generate_favicon.py
"""

import io
import os
import struct

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "frontend", "src", "app", "favicon.ico")
PREVIEW_DIR = os.path.join(ROOT, "storage", "tmp", "favicon-preview")

SIZES = [16, 32, 48, 64, 128, 256]


def render(size: int) -> Image.Image:
    disk = Image.new("RGBA", (256, 256))
    draw = ImageDraw.Draw(disk)
    ink, label = "#b23a29", "#fcfaf5"
    draw.polygon([(8, 8), (211, 8), (248, 46), (248, 248), (8, 248)], fill=ink)
    draw.rectangle((52, 8, 178, 88), fill=label)
    draw.rectangle((156, 8, 178, 88), fill="#d4a79b")
    draw.rectangle((49, 137, 207, 217), fill=label)
    for y in (162, 188):
        draw.rectangle((49, y, 207, y + 7), fill=ink)
    return disk.resize((size, size), Image.Resampling.LANCZOS)


# ---------------------------------------------------------------------------
# ICO 组装（逐尺寸精确控制，而非由单一源图缩放）
# ---------------------------------------------------------------------------

def _bmp_entry(img: Image.Image) -> bytes:
    """32bpp BMP 图标条目（含 AND 掩码），自底向上。"""
    w, h = img.size
    src = img.convert("RGBA")
    xor = bytearray()
    mask = bytearray()
    bpr = ((w + 31) // 32) * 4  # 掩码每行字节数（补齐至 4 字节）
    for yy in range(h - 1, -1, -1):
        row = bytearray()
        mrow = bytearray(bpr)
        for xx in range(w):
            r, g, b, a = src.getpixel((xx, yy))
            row += bytes((b, g, r, a))
            if a < 128:
                mrow[xx // 8] |= 0x80 >> (xx % 8)
        xor += row
        mask += mrow
    header = struct.pack(
        "<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0
    )
    return bytes(header) + bytes(xor) + bytes(mask)


def _png_entry(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def save_ico(path: str, frames: list[tuple[int, Image.Image]]) -> None:
    blobs = []
    for size, im in frames:
        blobs.append(_bmp_entry(im) if size < 64 else _png_entry(im))

    count = len(frames)
    offset = 6 + 16 * count
    entries = b""
    for (size, _), blob in zip(frames, blobs):
        wh = 0 if size >= 256 else size  # 256 编码为 0
        entries += struct.pack("<BBBBHHII", wh, wh, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)

    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, count) + entries + b"".join(blobs))


# ---------------------------------------------------------------------------


def main() -> None:
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    frames = []
    for size in SIZES:
        im = render(size)
        frames.append((size, im))
        im.save(os.path.join(PREVIEW_DIR, f"favicon-{size}.png"))

    # 16px 最近邻放大 8 倍，便于肉眼检查
    frames[0][1].resize((128, 128), Image.NEAREST).save(
        os.path.join(PREVIEW_DIR, "favicon-16-x8.png")
    )

    save_ico(OUT, frames)
    print(f"已生成 {OUT}（{os.path.getsize(OUT)} 字节，尺寸 {SIZES}）")
    print(f"预览图位于 {PREVIEW_DIR}")


if __name__ == "__main__":
    main()
