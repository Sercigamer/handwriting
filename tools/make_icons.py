"""Erzeugt die App-Icons (eine handgeschriebene Schleife auf dunklem Grund)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 2048  # gross zeichnen, dann verkleinern

img = Image.new("RGBA", (S, S), (21, 21, 21, 255))
d = ImageDraw.Draw(img)
# Linie wie im Heft
d.line([(S * 0.14, S * 0.66), (S * 0.86, S * 0.66)], fill=(95, 134, 184, 255), width=int(S * 0.018))
# Schreibschrift-Schleife: "l"-artige Bögen
pts = []
# Gestreckte Zykloide = Schreibschrift-Schleifen ("ellell")
for i in range(1200):
    th = -0.3 + (3 * 2 * math.pi + 0.9) * i / 1199
    x = 0.042 * th - 0.075 * math.sin(th)
    y = 0.16 * (1 + math.cos(th)) / 2
    pts.append((S * (0.17 + x * 0.83), S * (0.64 - y * 2.0)))
w0 = S * 0.045
for i in range(len(pts) - 1):
    t = i / len(pts)
    w = w0 * (0.55 + 0.6 * math.sin(math.pi * t))
    d.line([pts[i], pts[i + 1]], fill=(242, 242, 242, 255), width=int(w))
    r = w / 2
    d.ellipse([pts[i][0] - r, pts[i][1] - r, pts[i][0] + r, pts[i][1] + r], fill=(242, 242, 242, 255))

OUT.mkdir(exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")
img.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png")
img.convert("RGB").resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")
print("ok")
