#!/usr/bin/env python3
"""Собирает файлы логотипа Logo/<гамма>/ и значки в public/ (ADR-013).

Геометрия знака задана один раз (viewBox 0 0 64 64); цвета — по гаммам ниже.
PNG (512, 192, 32 px) делает scripts/build_logo_png.cjs (Chromium из Playwright).
Запуск: python3 scripts/build_logo.py
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "Logo"
PUBLIC = ROOT / "public"

FONT = "'Source Sans 3', 'Myriad Pro', 'Segoe UI', Arial, sans-serif"

# Цвета: круг со стрелкой / галочка («Tracker» — цветом галочки, «Team» — цветом круга).
PALETTES = {
    "blue": {
        "light": {"ring": "#2B4ACB", "check": "#F08C00"},
        "dark": {"ring": "#7B93FF", "check": "#F08C00"},
        "plate": "#EEF2FF",
    },
    "beige": {
        "light": {"ring": "#484039", "check": "#95816C"},
        "dark": {"ring": "#EEEEE5", "check": "#C5BFAF"},
        "plate": "#EEEEE5",
    },
}


def mark(ring, check, stroke=6):
    """Знак: круг со стрелкой и галочка. Толщина линий 6; для 16–32 px — 7–8."""
    return (
        f'<path d="M52.78 20 A24 24 0 1 1 35.34 8.23" fill="none" stroke="{ring}" '
        f'stroke-width="{stroke}" stroke-linecap="round"/>'
        f'<polygon points="45.24,9.62 36.31,1.30 34.37,15.16" fill="{ring}" stroke="{ring}" '
        f'stroke-width="2" stroke-linejoin="round"/>'
        f'<polyline points="23,33 29.5,39.5 41,27" fill="none" stroke="{check}" '
        f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def svg(width, height, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{title}">\n'
        f"  <title>{title}</title>\n  {body}\n</svg>\n"
    )


def wordmark(colors):
    # «Team» — цветом круга (цвет текста), «Tracker» — цветом галочки
    return (
        f'<text x="78" y="45" font-family="{FONT}" font-size="38" font-weight="700">'
        f'<tspan fill="{colors["ring"]}">Team </tspan><tspan fill="{colors["check"]}">Tracker</tspan></text>'
    )


# Границы знака в его системе координат (с учётом толщины линий и наконечника стрелки)
BBOX = (5.0, 0.3, 59.0, 59.0)


def plate_icon(p, fraction, stroke, rx=16):
    """Знак на плашке 64×64: большая сторона знака занимает долю fraction плашки, поля одинаковые."""
    x0, y0, x1, y1 = BBOX
    scale = round(fraction * 64 / max(x1 - x0, y1 - y0), 4)
    tx = round(32 - scale * (x0 + x1) / 2, 3)
    ty = round(32 - scale * (y0 + y1) / 2, 3)
    c = p["light"]
    return (
        f'<rect width="64" height="64" rx="{rx}" fill="{p["plate"]}"/>'
        f'<g transform="translate({tx} {ty}) scale({scale})">{mark(c["ring"], c["check"], stroke)}</g>'
    )


def build():
    for name, p in PALETTES.items():
        d = LOGO / name
        d.mkdir(parents=True, exist_ok=True)
        light, dark = p["light"], p["dark"]
        files = {
            "mark.svg": svg(64, 64, mark(light["ring"], light["check"]), "Team Tracker — знак"),
            "logo-light.svg": svg(
                340, 64, mark(light["ring"], light["check"]) + wordmark(light), "Team Tracker (для светлого фона)"
            ),
            "logo-dark.svg": svg(
                340, 64, mark(dark["ring"], dark["check"]) + wordmark(dark), "Team Tracker (для тёмного фона)"
            ),
            "app-icon.svg": svg(64, 64, plate_icon(p, 0.65, 7), "Team Tracker — значок приложения"),
            # для 16–32 px линии толще (эффективно ≈ 7)
            "favicon.svg": svg(64, 64, plate_icon(p, 0.72, 9), "Team Tracker — favicon"),
        }
        for fname, content in files.items():
            (d / fname).write_text(content, encoding="utf-8")
            print("svg", f"Logo/{name}/{fname}")
        # значки для вкладки браузера: основной — бежевая гамма (по умолчанию)
        (PUBLIC / f"favicon-{name}.svg").write_text(files["favicon.svg"], encoding="utf-8")
    (PUBLIC / "favicon.svg").write_text((LOGO / "beige" / "favicon.svg").read_text(encoding="utf-8"), encoding="utf-8")


if __name__ == "__main__":
    build()
