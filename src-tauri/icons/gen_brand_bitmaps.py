"""Generate high-definition installer brand bitmaps.

Warm premium research-instrument panels rendered in the app's SYSU green,
warm ivory, and deep green ink identity.

To stay sharp on high-DPI displays despite NSIS's fixed small canvas sizes
(164x314 sidebar, 493x312 MSI dialog), every bitmap is drawn at 4x on a large
canvas and then downsampled with Lanczos, which produces clean anti-aliased
edges for the vector geometry and crisp text.

Outputs (written next to this script):
  - nsis-sidebar.bmp   164 x 314   NSIS welcome/finish page sidebar image
  - msi-dialog.bmp     493 x 312   WiX MSI welcome dialog image
  - icon.png           512 x 512   app icon (sharp on high-DPI taskbars)

Run with the project venv that already has Pillow installed:
  .venv\\Scripts\\python.exe src-tauri\\icons\\gen_brand_bitmaps.py
"""
from __future__ import annotations

import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError as exc:  # pragma: no cover - friendly message for CI/local
    raise SystemExit(
        "Pillow is required. Run: .venv\\Scripts\\python.exe -m pip install Pillow"
    ) from exc


# --- Brand tokens (mirrors frontend/tailwind.config.js) ---------------------
CREAM_50 = (250, 248, 241)      # app background
CREAM_100 = (243, 238, 226)
CREAM_200 = (232, 221, 200)
CREAM_300 = (216, 198, 166)     # app borders
CLAY_600 = (0, 79, 45)
CLAY_500 = (0, 106, 58)         # SYSU green
CLAY_400 = (46, 133, 86)
CLAY_300 = (115, 176, 141)
CLAY_50 = (234, 244, 238)
TEAL_500 = (46, 133, 86)        # restrained scientific green
TEAL_300 = (126, 170, 145)
INK_900 = (20, 36, 28)
INK_800 = (32, 54, 42)
INK_700 = (54, 83, 68)
INK_500 = (96, 116, 104)
INK_300 = (170, 183, 174)
WHITE = (255, 255, 255)

SUPERSAMPLE = 4  # draw at 4x then downsample with Lanczos


def _font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    """Resolve a precise UI font, falling back to PIL defaults on any host."""
    size = max(8, int(size))
    if mono:
        candidates = [
            "C:\\Windows\\Fonts\\CascadiaMono.ttf",
            "C:\\Windows\\Fonts\\CascadiaCode.ttf",
            "C:\\Windows\\Fonts\\consola.ttf",
            "/System/Library/Fonts/Monaco.ttf",
        ]
    else:
        candidates = [
            "C:\\Windows\\Fonts\\aptos-bold.ttf" if bold else "C:\\Windows\\Fonts\\aptos.ttf",
            "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
            "C:\\Windows\\Fonts\\arialbd.ttf" if bold else "C:\\Windows\\Fonts\\arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
            else "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _canvas(w: int, h: int, bg) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    """Create a supersampled canvas. Returns (image, draw, scale)."""
    img = Image.new("RGB", (w * SUPERSAMPLE, h * SUPERSAMPLE), bg)
    draw = ImageDraw.Draw(img, "RGBA")
    return img, draw, SUPERSAMPLE


def _finalize(img: Image.Image, w: int, h: int) -> Image.Image:
    """Downsample the supersampled canvas to the target size with Lanczos."""
    return img.resize((w, h), Image.LANCZOS)


def _alpha(color: tuple, a: int) -> tuple:
    """Add an alpha channel to an RGB color."""
    return (color[0], color[1], color[2], a)


# --------------------------------------------------------------------------
# Life-science vector motifs
# --------------------------------------------------------------------------

def draw_dna_helix(draw, x0, y0, x1, y1, color_a, color_b, turns=6, radius=22, rungs=11):
    """Draw a vertical DNA double helix between (x0,y0) and (x1,y1)."""
    cx = (x0 + x1) // 2
    height = y1 - y0
    if height <= 0:
        return
    amp = max(8, radius)
    steps = 240

    def strand_x(phase):
        pts = []
        for i in range(steps + 1):
            t = i / steps
            y = y0 + t * height
            x = cx + math.sin(t * turns * 2 * math.pi + phase) * amp
            pts.append((x, y))
        return pts

    strand1 = strand_x(0.0)
    strand2 = strand_x(math.pi)

    # Base-pair rungs (drawn behind the strands): connect strand1 to strand2 at intervals.
    for k in range(rungs + 1):
        t = k / rungs
        idx = int(t * steps)
        if 0 <= idx <= steps:
            ax, ay = strand1[idx]
            bx, by = strand2[idx]
            # depth cue: rungs look fainter near the crossing point
            depth = abs(ax - bx) / (2 * amp)
            a = int(70 + 120 * depth)
            draw.line([(ax, ay), (bx, by)], fill=_alpha(color_a, a), width=5)

    # Strand backbones (drawn on top of rungs).
    draw.line(strand1, fill=color_b, width=10, joint="curve")
    draw.line(strand2, fill=color_b, width=10, joint="curve")

    # Nucleotide nodes along each strand.
    for pts, col in ((strand1, color_a), (strand2, color_a)):
        for k in range(0, len(pts), max(1, len(pts) // (rungs + 1))):
            x, y = pts[k]
            draw.ellipse([x - 11, y - 11, x + 11, y + 11], fill=col, outline=WHITE, width=3)


def draw_molecule_network(draw, cx, cy, radius, node_color, line_color, n=9, seed=7):
    """Draw an abstract molecular node-and-edge network centered on (cx, cy)."""
    import random
    rng = random.Random(seed)
    nodes = []
    for i in range(n):
        ang = (i / n) * 2 * math.pi + rng.uniform(-0.25, 0.25)
        r = radius * rng.uniform(0.45, 1.0)
        x = cx + math.cos(ang) * r
        y = cy + math.sin(ang) * r
        nodes.append((x, y))

    # Edges: each node connects to its 2-3 nearest neighbors.
    for i, (ax, ay) in enumerate(nodes):
        dists = sorted(
            (math.hypot(ax - bx, ay - by), j)
            for j, (bx, by) in enumerate(nodes) if j != i
        )
        for _, j in dists[:3]:
            if j > i:
                bx, by = nodes[j]
                draw.line([(ax, ay), (bx, by)], fill=_alpha(line_color, 140), width=4)

    for x, y in nodes:
        draw.ellipse([x - 14, y - 14, x + 14, y + 14], fill=node_color, outline=WHITE, width=4)


def draw_cell(draw, cx, cy, r, membrane_color, fill_color):
    """Draw a stylized cell: outer membrane + nucleus."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill_color, outline=membrane_color, width=6)
    nr = r // 3
    draw.ellipse([cx - nr, cy - nr, cx + nr, cy + nr], fill=membrane_color)


def draw_flask_glyph(draw, cx, cy, scale, color):
    """Legacy Erlenmeyer flask glyph (kept for reference; no longer the logo)."""
    s = scale
    neck_w = max(2, s // 4)
    neck_h = s
    body_top = cy - s // 2 + neck_h // 2
    pts = [
        (cx - s // 2, cy + s // 2),
        (cx + s // 2, cy + s // 2),
        (cx + neck_w // 2 + 1, body_top),
        (cx + neck_w // 2 + 1, body_top - neck_h),
        (cx - neck_w // 2 - 1, body_top - neck_h),
        (cx - neck_w // 2 - 1, body_top),
    ]
    draw.polygon(pts, outline=color, width=max(4, s // 10))


def draw_brand_helix(draw, cx, cy, size, color, width):
    """Draw the compact DNA double-helix brand glyph (matches the in-app logo).

    One full period so the strands cross at the top, middle, and bottom, with a
    base-pair rung across each bulge — the exact motif used by BrandGlyph in the
    frontend and the SVG favicon.
    """
    h = size
    amp = size * 0.30
    top = cy - h / 2
    steps = 200

    def strand(phase):
        return [
            (cx + math.sin((i / steps) * 2 * math.pi + phase) * amp, top + (i / steps) * h)
            for i in range(steps + 1)
        ]

    s1 = strand(0.0)
    s2 = strand(math.pi)

    rung_w = max(2, width - 2)
    for t in (0.25, 0.75):
        idx = int(t * steps)
        draw.line([s1[idx], s2[idx]], fill=color, width=rung_w)

    draw.line(s1, fill=color, width=width, joint="curve")
    draw.line(s2, fill=color, width=width, joint="curve")


def draw_brand_tile(draw, cx, cy, size, tile_color, glyph_color, radius_frac=0.28):
    """Draw the app's green rounded-tile logo with a white DNA helix inside."""
    half = size // 2
    box = [cx - half, cy - half, cx + half, cy + half]
    draw.rounded_rectangle(box, radius=int(size * radius_frac), fill=tile_color)
    draw_brand_helix(draw, cx, cy, int(size * 0.60), glyph_color, max(3, size // 11))


def _rounded_rect_path(draw, box, radius, **kw):
    draw.rounded_rectangle(box, radius=radius, **kw)


def _center_text(draw, text, font, cx, cy, color):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text((cx - w // 2, cy - h // 2 - bbox[1]), text, font=font, fill=color)


def _version_text():
    """Read the version from tauri.conf.json so the bitmap stays in sync."""
    try:
        import json
        p = Path(__file__).resolve().parent.parent / "tauri.conf.json"
        conf = json.load(open(p, encoding="utf-8"))
        return "v" + str(conf.get("version", ""))
    except Exception:
        return "v0.1.2"


# --------------------------------------------------------------------------
# Compositions
# --------------------------------------------------------------------------

def render_sidebar(path: Path) -> None:
    """NSIS sidebar (welcome/finish page). 164 x 314."""
    W, H = 164, 314
    img, draw, sc = _canvas(W, H, INK_900)

    draw.rectangle([0, 0, W * sc, 4 * sc], fill=CLAY_500)
    draw.rounded_rectangle(
        [14 * sc, 18 * sc, 150 * sc, 98 * sc],
        radius=10 * sc,
        fill=INK_800,
        outline=_alpha(CLAY_400, 180),
        width=1 * sc,
    )
    draw_brand_tile(draw, int(42 * sc), int(58 * sc), int(44 * sc), CLAY_500, WHITE)
    draw.text((72 * sc, 38 * sc), "Science", font=_font(18 * sc, bold=True), fill=CREAM_50)
    draw.text((72 * sc, 62 * sc), "Workbench", font=_font(13 * sc), fill=CREAM_300)

    # Precision lanes: thin instrument-like readouts instead of decorative art.
    lanes = [
        ("PRIVATE", "local data"),
        ("AGENTS", "modules"),
        ("OUTPUT", "artifacts"),
    ]
    y = 128
    for label, value in lanes:
        draw.rounded_rectangle(
            [18 * sc, y * sc, 146 * sc, (y + 34) * sc],
            radius=7 * sc,
            fill=INK_800,
            outline=_alpha(CREAM_300, 72),
            width=1 * sc,
        )
        draw.ellipse([28 * sc, (y + 12) * sc, 36 * sc, (y + 20) * sc], fill=CLAY_400)
        draw.text((46 * sc, (y + 8) * sc), label, font=_font(9 * sc, bold=True, mono=True), fill=CLAY_300)
        draw.text((46 * sc, (y + 20) * sc), value, font=_font(10 * sc), fill=CREAM_200)
        y += 42

    for yy in (266, 274, 282):
        draw.line([(20 * sc, yy * sc), (112 * sc, yy * sc)], fill=_alpha(CREAM_300, 58), width=1 * sc)
    _center_text(draw, _version_text(), _font(12 * sc, mono=True), int(82 * sc), int(298 * sc), CREAM_300)

    _finalize(img, W, H).save(path, "BMP")
    print(f"wrote {path} ({W}x{H})")


def render_msi_dialog(path: Path) -> None:
    """WiX MSI welcome dialog image. 493 x 312."""
    W, H = 493, 312
    img, draw, sc = _canvas(W, H, CREAM_50)

    panel_w = 184
    draw.rectangle([0, 0, panel_w * sc, H * sc], fill=INK_900)
    draw.rectangle([0, 0, W * sc, 5 * sc], fill=CLAY_500)
    draw.line([(panel_w * sc, 0), (panel_w * sc, H * sc)], fill=CLAY_500, width=1 * sc)

    draw_brand_tile(draw, int(58 * sc), int(58 * sc), int(66 * sc), CLAY_500, WHITE)
    draw.text((28 * sc, 110 * sc), "Science", font=_font(30 * sc, bold=True), fill=CREAM_50)
    draw.text((28 * sc, 146 * sc), "Workbench", font=_font(20 * sc), fill=CREAM_300)
    draw.text((28 * sc, 184 * sc), "LOCAL-FIRST", font=_font(10 * sc, bold=True, mono=True), fill=CLAY_300)
    draw.text((28 * sc, 202 * sc), "research system", font=_font(14 * sc), fill=CREAM_200)

    for yy in (244, 256, 268):
        draw.line([(28 * sc, yy * sc), (142 * sc, yy * sc)], fill=_alpha(CREAM_300, 58), width=1 * sc)
    draw.text((28 * sc, 284 * sc), _version_text(), font=_font(12 * sc, mono=True), fill=CREAM_300)

    rx = (panel_w + 34) * sc
    draw.rounded_rectangle(
        [rx, 34 * sc, (W - 34) * sc, 106 * sc],
        radius=11 * sc,
        fill=WHITE,
        outline=CREAM_300,
        width=1 * sc,
    )
    draw.text((rx + 18 * sc, 52 * sc), "Install Science Workbench", font=_font(19 * sc, bold=True), fill=INK_900)
    draw.text((rx + 18 * sc, 78 * sc), "Private desktop AI for scientific work.", font=_font(12 * sc), fill=INK_500)

    rows = [
        ("PRIVATE DATA", "Projects stay on this machine."),
        ("AGENT MODULES", "Chat, design, omics, protocol, review, HPC."),
        ("TRACEABLE OUTPUTS", "Figures, tables, scripts, documents."),
    ]
    y = 134
    for label, body in rows:
        draw.rounded_rectangle(
            [rx, y * sc, (W - 34) * sc, (y + 42) * sc],
            radius=9 * sc,
            fill=CLAY_50,
            outline=CREAM_300,
            width=1 * sc,
        )
        draw.ellipse([int(rx + 14 * sc), (y + 15) * sc, int(rx + 24 * sc), (y + 25) * sc], fill=TEAL_500)
        draw.text((int(rx + 36 * sc), (y + 8) * sc), label, font=_font(10 * sc, bold=True, mono=True), fill=CLAY_600)
        draw.text((int(rx + 36 * sc), (y + 23) * sc), body, font=_font(11 * sc), fill=INK_700)
        y += 50

    _finalize(img, W, H).save(path, "BMP")
    print(f"wrote {path} ({W}x{H})")


def render_icon(path: Path) -> None:
    """App icon at 512x512 (down from supersampled). Sharp on high-DPI."""
    W, H = 512, 512
    img, draw, sc = _canvas(W, H, (0, 0, 0))  # RGBA later

    # Rebuild as RGBA so the icon has a transparent background for taskbar use.
    img = Image.new("RGBA", (W * sc, H * sc), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    # Rounded-square SYSU green background (matches the in-app BrandLogo).
    pad = 24 * sc
    _rounded_rect_path(
        draw,
        [pad, pad, W * sc - pad, H * sc - pad],
        radius=112 * sc,
        fill=CLAY_500,
    )

    # White DNA double-helix brand glyph, centered.
    draw_brand_helix(draw, W * sc // 2, H * sc // 2, int(300 * sc), WHITE, int(30 * sc))

    final = img.resize((W, H), Image.LANCZOS)
    final.save(path, "PNG")
    print(f"wrote {path} ({W}x{H})")


def render_icon_ico(png_path: Path, ico_path: Path) -> None:
    """Build a multi-resolution .ico from the high-res PNG."""
    im = Image.open(png_path).convert("RGBA")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    im.save(ico_path, format="ICO", sizes=sizes)
    print(f"wrote {ico_path} (sizes={[s[0] for s in sizes]})")


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    frontend_public = out_dir.parent.parent / "frontend" / "public"
    render_sidebar(out_dir / "nsis-sidebar.bmp")
    render_msi_dialog(out_dir / "msi-dialog.bmp")
    render_icon(out_dir / "icon.png")
    render_icon(frontend_public / "icon.png")
    render_icon_ico(out_dir / "icon.png", out_dir / "icon.ico")
    # NOTE: no NSIS headerImage is produced. We removed it because NSIS extracts
    # the header bitmap into %TEMP% at install time and AV/Defender can lock it,
    # causing "Error opening file for writing: ...\\modern-header.bmp". The
    # sidebar image + installer icon carry the brand without that conflict.


if __name__ == "__main__":
    main()
