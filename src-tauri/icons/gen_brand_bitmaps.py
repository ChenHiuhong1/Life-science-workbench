"""Generate NSIS / WiX installer brand bitmaps that match the app UI.

The desktop app uses a warm "cream" background with a clay (terracotta) brand
color. This script renders that same identity onto the bitmaps Tauri embeds into
the Windows installers so the installer UI is consistent with the running app.

Outputs (written next to this script):
  - nsis-sidebar.bmp   164 x 314   NSIS welcome/finish page sidebar image
  - nsis-header.bmp    150 x 57    NSIS header image (top of interior pages)
  - msi-dialog.bmp     493 x 312   WiX MSI welcome dialog image

Run with the project venv that already has Pillow installed:
  .venv\\Scripts\\python.exe src-tauri\\icons\\gen_brand_bitmaps.py
"""
from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover - friendly message for CI/local
    raise SystemExit(
        "Pillow is required. Run: .venv\\Scripts\\python.exe -m pip install Pillow"
    ) from exc


# --- Brand tokens (mirrors frontend/tailwind.config.js) ---------------------
CREAM_50 = (250, 249, 245)      # app background
CREAM_100 = (245, 244, 238)
CREAM_300 = (232, 230, 220)     # app borders
CLAY_500 = (217, 119, 87)       # primary brand color
CLAY_600 = (197, 99, 68)
CLAY_50 = (253, 244, 240)
INK_900 = (26, 26, 26)
INK_500 = (107, 107, 107)
INK_300 = (154, 154, 154)
WHITE = (255, 255, 255)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Resolve a serif-ish font, falling back to PIL defaults on any host."""
    candidates = [
        "C:\\Windows\\Fonts\\georgiab.ttf" if bold else "C:\\Windows\\Fonts\\georgia.ttf",
        "C:\\Windows\\Fonts\\timesbd.ttf" if bold else "C:\\Windows\\Fonts\\times.ttf",
        "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _draw_flask(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: int, color) -> None:
    """Draw a simple Erlenmeyer (conical) flask glyph centered on (cx, cy)."""
    s = scale
    # Flask body: triangle (cone) + rectangle (neck)
    neck_w = max(2, s // 4)
    neck_h = s
    body_top = cy - s // 2 + neck_h // 2
    pts = [
        (cx - s // 2, cy + s // 2),       # bottom-left
        (cx + s // 2, cy + s // 2),       # bottom-right
        (cx + neck_w // 2 + 1, body_top), # upper-right (shoulder)
        (cx + neck_w // 2 + 1, body_top - neck_h),  # neck-right top
        (cx - neck_w // 2 - 1, body_top - neck_h),  # neck-left top
        (cx - neck_w // 2 - 1, body_top), # upper-left (shoulder)
    ]
    draw.polygon(pts, outline=color, width=max(2, s // 16))


def _center_text(draw, text, font, cx, cy, color):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text((cx - w // 2, cy - h // 2 - bbox[1]), text, font=font, fill=color)


def _rounded_rect(draw, box, radius, **kw):
    draw.rounded_rectangle(box, radius=radius, **kw)


def render_sidebar(path: Path) -> None:
    """NSIS sidebar (welcome/finish page). 164 x 314."""
    w, h = 164, 314
    img = Image.new("RGB", (w, h), CREAM_50)
    draw = ImageDraw.Draw(img)

    # Right-side clay accent panel (keeps the welcome page from looking flat)
    panel_w = 28
    draw.rectangle([w - panel_w, 0, w, h], fill=CLAY_500)

    # Top brand block
    _rounded_rect(draw, [16, 20, w - panel_w - 16, 84], radius=12, fill=CLAY_50)
    _draw_flask(draw, 38, 52, 30, CLAY_600)
    _center_text(draw, "Science", _font(20, bold=True), 96, 42, INK_900)
    _center_text(draw, "Workbench", _font(13), 96, 64, CLAY_600)

    # Tagline
    _center_text(draw, "Local research", _font(12), (w - panel_w) // 2, 124, INK_500)
    _center_text(draw, "workspace", _font(12), (w - panel_w) // 2, 142, INK_500)

    # Feature dots
    bullets = ["Private & local", "Literature + analysis", "Protocol + review"]
    y = 188
    for b in bullets:
        draw.ellipse([20, y + 3, 28, y + 11], fill=CLAY_500)
        draw.text((36, y), b, font=_font(11), fill=INK_500)
        y += 26

    # Footer mark
    _center_text(draw, "v0.1.1", _font(11), (w - panel_w) // 2, h - 22, INK_300)

    img.save(path, "BMP")
    print(f"wrote {path} ({w}x{h})")


def render_header(path: Path) -> None:
    """NSIS header image (top of interior installer pages). 150 x 57."""
    w, h = 150, 57
    img = Image.new("RGB", (w, h), WHITE)
    draw = ImageDraw.Draw(img)

    # Left clay square (mirrors TopBar logo)
    _rounded_rect(draw, [10, 12, 45, 47], radius=8, fill=CLAY_500)
    _draw_flask(draw, 27, 29, 18, WHITE)

    # Brand text
    draw.text((54, 13), "Science Workbench", font=_font(16, bold=True), fill=INK_900)
    draw.text((54, 34), "Local research workspace", font=_font(10), fill=INK_500)

    # Right divider rule
    draw.line([(w - 1, 8), (w - 1, h - 8)], fill=CREAM_300, width=1)

    img.save(path, "BMP")
    print(f"wrote {path} ({w}x{h})")


def render_msi_dialog(path: Path) -> None:
    """WiX MSI welcome dialog image. 493 x 312."""
    w, h = 493, 312
    img = Image.new("RGB", (w, h), CREAM_50)
    draw = ImageDraw.Draw(img)

    # Left brand panel
    panel_w = 188
    draw.rectangle([0, 0, panel_w, h], fill=CLAY_50)
    draw.line([(panel_w, 0), (panel_w, h)], fill=CREAM_300, width=1)

    _draw_flask(draw, panel_w // 2, 96, 56, CLAY_600)
    _center_text(draw, "Science", _font(34, bold=True), panel_w // 2, 168, INK_900)
    _center_text(draw, "Workbench", _font(22), panel_w // 2, 200, CLAY_600)
    _center_text(draw, "v0.1.1", _font(13), panel_w // 2, 246, INK_300)

    # Right copy
    rx = panel_w + 36
    draw.text((rx, 76), "Welcome", font=_font(28, bold=True), fill=INK_900)
    draw.text((rx, 124), "A local-first desktop AI workbench", font=_font(15), fill=INK_500)
    draw.text((rx, 146), "for research workflows.", font=_font(15), fill=INK_500)

    lines = [
        "Private: all data stays on this machine.",
        "One app for chat, literature, analysis,",
        "protocols, review, modules, and HPC.",
    ]
    y = 196
    for ln in lines:
        draw.text((rx, y), ln, font=_font(12), fill=INK_500)
        y += 22

    img.save(path, "BMP")
    print(f"wrote {path} ({w}x{h})")


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    render_sidebar(out_dir / "nsis-sidebar.bmp")
    render_header(out_dir / "nsis-header.bmp")
    render_msi_dialog(out_dir / "msi-dialog.bmp")


if __name__ == "__main__":
    main()
