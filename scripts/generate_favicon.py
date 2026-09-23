#!/usr/bin/env python3
"""生成 Lost MIDI Archive 的 favicon.ico。

品牌要素（与站点页眉 / 管理后台标识一脉相承）：
- 深绿 #203d31 圆角方块（管理后台侧栏色）
- 米白 #f7f6f0 的 ♮ 还原记号（站点页眉同款衬线符号）

输出：frontend/src/app/favicon.ico
  16 / 32 / 48 / 64 / 128 / 256 六种尺寸；
  小尺寸使用加粗变体，保证 16px 下清晰可读；
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

BG = (32, 61, 49, 255)     # #203d31 深绿
FG = (247, 246, 240, 255)  # #f7f6f0 米白

DESIGN = 1024   # 设计网格
RADIUS = 230    # 背景圆角半径（设计网格单位，约 22.5%）
SIZES = [16, 32, 48, 64, 128, 256]
BOLD_BELOW = 32  # 小于等于该尺寸使用加粗变体


def natural_sign(d: ImageDraw.ImageDraw, s: float, bold: bool = False) -> None:
    """在 1024 设计网格上绘制 ♮（还原记号）。s 为目标画布相对设计网格的缩放。

    结构：两根等长竖干（左干整体偏下、右干整体偏上），
    两根平行四边形横杆自左下向右上倾斜，与竖干外缘平齐。
    """
    sw = 150 if bold else 118   # 笔画宽
    ext = 132 if bold else 118  # 竖干伸出横杆的长度
    xl, xr = 372, 652           # 左右竖干中心 x
    rise = 72                   # 横杆右上倾高度
    y_up_l, y_up_r = 420, 420 - rise   # 上横杆中心线（位于左右干处）
    y_lo_l, y_lo_r = 706, 706 - rise   # 下横杆中心线
    t = sw / 2 * 1.04                  # 横杆垂直半厚
    m = -rise / (xr - xl)              # 中心线斜率（屏幕 y 向下为正）

    def X(v: float) -> float:
        return v * s

    def Y(v: float) -> float:
        return (v - 12) * s  # 光学居中微调

    # 左竖干：上端与上杆平齐，下端伸出下杆
    d.rectangle([X(xl - sw / 2), Y(y_up_l - t), X(xl + sw / 2), Y(y_lo_l + t + ext)], fill=FG)
    # 右竖干：上端伸出上杆，下端与下杆平齐
    d.rectangle([X(xr - sw / 2), Y(y_up_r - t - ext), X(xr + sw / 2), Y(y_lo_r + t)], fill=FG)

    def bar(yl: float, yr: float) -> None:
        """横杆：平行四边形，左右端与竖干外缘平齐。"""
        c_l = yl - m * sw / 2  # 左外缘处中心线 y
        c_r = yr + m * sw / 2  # 右外缘处中心线 y
        pts = [
            (X(xl - sw / 2), Y(c_l - t)),
            (X(xr + sw / 2), Y(c_r - t)),
            (X(xr + sw / 2), Y(c_r + t)),
            (X(xl - sw / 2), Y(c_l + t)),
        ]
        d.polygon(pts, fill=FG)

    bar(y_up_l, y_up_r)
    bar(y_lo_l, y_lo_r)


def render(size: int, bold: bool = False) -> Image.Image:
    """以 4x 超采样绘制后经 LANCZOS 缩小到目标尺寸。"""
    ss = 4
    w = size * ss
    s = w / DESIGN
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, w - 1], radius=round(RADIUS * s), fill=BG)
    natural_sign(d, s, bold)
    return img.resize((size, size), Image.LANCZOS)


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
        im = render(size, bold=size <= BOLD_BELOW)
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
