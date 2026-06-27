"""Generate a 1200x630 OG image for ManishaPay using PIL.
Renders directly from PIL primitives (no SVG conversion needed)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

OUT = r"C:\xampp\htdocs\manisha\frontend\public\og-image.png"
W, H = 1200, 630

# ── Colors ───────────────────────────────────────────────────────
BG_TOP = (2, 6, 23)
BG_BOT = (11, 18, 32)
BRAND_LIGHT = (52, 211, 153)
BRAND = (16, 185, 129)
TEXT = (241, 245, 249)
MUTED = (148, 163, 184)
DIM = (100, 116, 139)
GRID = (30, 41, 59)


def find_font(*names, size=32, bold=False):
    """Return an ImageFont, trying common Windows font paths."""
    candidates = []
    for n in names:
        candidates += [
            rf"C:\Windows\Fonts\{n}.ttf",
            rf"C:\Windows\Fonts\{n}.TTF",
        ]
    if bold:
        candidates += [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\segoeuib.ttf"]
    else:
        candidates += [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\segoeui.ttf"]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


# ── Canvas ───────────────────────────────────────────────────────
img = Image.new('RGB', (W, H), BG_TOP)
draw = ImageDraw.Draw(img)

# Vertical gradient background
for y in range(H):
    t = y / H
    r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
    g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
    b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Top-right brand glow (radial)
glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
cx, cy = int(W * 0.85), int(H * 0.15)
for r in range(420, 30, -10):
    alpha = int(60 * (1 - (r - 30) / 390))
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*BRAND, alpha))
glow = glow.filter(ImageFilter.GaussianBlur(50))
img.paste(glow, (0, 0), glow)

# Subtle grid
for y in (100, 200, 300, 400, 500):
    draw.line([(0, y), (W, y)], fill=GRID, width=1)
for x in (200, 400, 600, 800, 1000):
    draw.line([(x, 0), (x, H)], fill=GRID, width=1)

# Floating tech glyphs (faint hexagon + circles)
def hexagon(draw, cx, cy, r, color, width=2):
    import math
    pts = [(cx + r * math.cos(math.pi / 3 * i + math.pi / 2),
            cy + r * math.sin(math.pi / 3 * i + math.pi / 2)) for i in range(6)]
    draw.polygon(pts, outline=color, width=width)

# Tinted decorations
hex_color = (*BRAND, 60)
overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
hexagon(od, 130, 515, 35, hex_color, width=2)
od.ellipse([1040, 80, 1120, 160], outline=hex_color, width=2)
od.ellipse([1058, 98, 1102, 142], outline=hex_color, width=1)
hexagon(od, 1085, 540, 35, hex_color, width=2)
img.paste(overlay, (0, 0), overlay)

# ── Logo block ───────────────────────────────────────────────────
# Faithful render of public/logo.svg — stylised "M" with forward arrow,
# white on emerald gradient, rounded square. Geometry matches the SVG
# (viewBox 0..64) scaled into a 96px box.
LX, LY = 80, 80
LW = 96
SCALE = LW / 64.0  # SVG viewBox is 64; we render at LW px

# 1) Rounded square with diagonal brand gradient (top-left light → bottom-right brand)
def lerp(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))

logo_rgb = Image.new('RGB', (LW, LW))
ld = ImageDraw.Draw(logo_rgb)
for y in range(LW):
    for x in range(LW):
        # Diagonal gradient: t goes from 0 (top-left) to 1 (bottom-right)
        t = (x + y) / (2 * LW)
        ld.point((x, y), fill=lerp(BRAND_LIGHT, (4, 120, 87), t))  # emerald-500 → emerald-700

# Round-corner mask (matches SVG rx=14 → 21 at 96px scale)
mask = Image.new('L', (LW, LW), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, LW, LW], radius=int(14 * SCALE), fill=255)

# Paint the rounded gradient onto an alpha-supporting layer, then onto img
logo_layer = Image.new('RGBA', (LW, LW), (0, 0, 0, 0))
logo_layer.paste(logo_rgb, (0, 0), mask)

# 2) White stylised "M" path — points lifted from logo.svg, scaled
m_path = [
    (14, 46), (14, 18), (20, 18), (28, 32), (36, 18), (42, 18),
    (42, 46), (36, 46), (36, 28), (28, 42), (20, 28), (20, 46),
]
m_scaled = [(x * SCALE, y * SCALE) for x, y in m_path]
ld2 = ImageDraw.Draw(logo_layer)
ld2.polygon(m_scaled, fill=(255, 255, 255, 245))

# 3) Forward-arrow detail to the right of the M (also from the SVG)
ax = lambda v: v * SCALE
ld2.line([(ax(44), ax(32)), (ax(50), ax(32))], fill=(255, 255, 255, 230), width=max(2, int(2.5 * SCALE)))
ld2.line([(ax(50), ax(32)), (ax(47), ax(28))], fill=(255, 255, 255, 230), width=max(2, int(2.5 * SCALE)))
ld2.line([(ax(50), ax(32)), (ax(47), ax(36))], fill=(255, 255, 255, 230), width=max(2, int(2.5 * SCALE)))

img.paste(logo_layer, (LX, LY), logo_layer)

# 4) Wordmark next to the logo. Larger, tighter spacing — the icon already
# carries "M", so the wordmark reads as a unit with it.
brand_font = find_font('arialbd', 'segoeuib', size=44, bold=True)
draw.text((LX + LW + 22, LY + 22), "ManishaPay", fill=TEXT, font=brand_font)

# ── Headline ─────────────────────────────────────────────────────
h_font = find_font('arialbd', 'segoeuib', size=64, bold=True)
draw.text((80, 250), "PayNow Zimbabwe", fill=TEXT, font=h_font)
# Second line: "middleware, done right." with brand color on "middleware"
draw.text((80, 325), "middleware", fill=BRAND_LIGHT, font=h_font)
mw = draw.textlength("middleware", font=h_font)
draw.text((80 + mw, 325), ", done right.", fill=TEXT, font=h_font)

# ── Subhead ──────────────────────────────────────────────────────
sub_font = find_font('arial', 'segoeui', size=26)
draw.text((80, 425), "Hash mismatches. Decimal bugs. Mobile OTP. Broken webhooks.", fill=MUTED, font=sub_font)
draw.text((80, 462), "Solved once at the integration layer.", fill=MUTED, font=sub_font)

# ── Footer band ──────────────────────────────────────────────────
draw.line([(80, 540), (1120, 540)], fill=GRID, width=1)
foot_font = find_font('arial', 'segoeui', size=22)
draw.text((80, 575), "pay.aizim.co.zw", fill=DIM, font=foot_font)
right_text = "Built by Noby Tebulo · nobie.netlify.app"
right_w = draw.textlength(right_text, font=foot_font)
draw.text((1120 - right_w, 575), right_text, fill=DIM, font=foot_font)

# ── Save ─────────────────────────────────────────────────────────
img.save(OUT, "PNG", optimize=True)
print(f"PNG saved: {OUT}  ({os.path.getsize(OUT) // 1024} KB)")
