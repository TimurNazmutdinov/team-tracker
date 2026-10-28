#!/usr/bin/env python3
"""Строит SVG-схемы для PDF в docs/diagrams/.

Graphviz на машине сборки нет, поэтому схемы рисуются вручную:
- схемы-блоки (context, containers, components, status, sprint-state) заданы координатами ниже;
- диаграммы последовательности берутся из блоков ```mermaid в docs/*.md:
  блок `sequenceDiagram`, за которым идёт строка `<!-- pdf: diagrams/имя.png -->`,
  превращается в docs/diagrams/имя.svg.

PNG для PDF получают из SVG скриптом scripts/svg_to_png.cjs (Chromium из Playwright).
"""
import html
import pathlib
import re
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "diagrams"
FONT = "Helvetica, Arial, 'Segoe UI', 'DejaVu Sans', sans-serif"
INK = "#1f2937"
COLORS = {
    "blue": ("#dbeafe", "#2563eb", "#1e3a8a"),
    "green": ("#dcfce7", "#16a34a", "#14532d"),
    "amber": ("#fef3c7", "#d97706", "#78350f"),
    "gray": ("#f3f4f6", "#6b7280", INK),
}
CHAR_W = 0.56  # средняя ширина символа в долях размера шрифта


def esc(s):
    return html.escape(s, quote=False)


class Svg:
    def __init__(self, w, h, title):
        self.w, self.h, self.title = w, h, title
        self.parts = []

    def box(self, x, y, w, h, title, lines=(), color="blue", dashed=False, strong=False, tsize=17, lsize=14):
        fill, stroke, ink = COLORS[color]
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        fill = "#ffffff" if dashed else fill
        sw = 2.5 if strong else 1.5
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>'
        )
        cx = x + w / 2
        total = tsize + 6 + len(lines) * (lsize + 6)
        ty = y + (h - total) / 2 + tsize
        self.parts.append(
            f'<text x="{cx}" y="{ty:.0f}" text-anchor="middle" font-size="{tsize}" font-weight="bold" fill="{ink}">{esc(title)}</text>'
        )
        for i, line in enumerate(lines):
            ly = ty + 8 + (i + 1) * (lsize + 6) - 2
            self.parts.append(
                f'<text x="{cx}" y="{ly:.0f}" text-anchor="middle" font-size="{lsize}" fill="{INK}">{esc(line)}</text>'
            )

    def frame(self, x, y, w, h, label):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>'
        )
        self.parts.append(f'<text x="{x + 16}" y="{y + 26}" font-size="15" font-weight="bold" fill="#475569">{esc(label)}</text>')

    def text(self, x, y, s, size=14, anchor="start", bold=False, fill=INK):
        b = ' font-weight="bold"' if bold else ""
        self.parts.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}"{b} fill="{fill}">{esc(s)}</text>')

    def line(self, x1, y1, x2, y2, color="#d1d5db", dashed=False, width=1.5):
        d = ' stroke-dasharray="8 6"' if dashed else ""
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"{d}/>')

    def arrow(self, pts, dashed=False, label=None, lpos=None, head=True, size=13, both=False):
        d = "M" + " L".join(f"{x} {y}" for x, y in pts)
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        mk = ' marker-end="url(#arr)"' if head else ""
        if both:
            mk += ' marker-start="url(#arr)"'
        self.parts.append(f'<path d="{d}" fill="none" stroke="#374151" stroke-width="2"{dash}{mk}/>')
        if label:
            if lpos is None:
                lpos = (
                    (pts[0][0] + pts[-1][0]) / 2,
                    (pts[0][1] + pts[-1][1]) / 2,
                )
            self.parts.append(
                f'<text x="{lpos[0]}" y="{lpos[1] + 5}" text-anchor="middle" font-size="{size}" fill="{INK}" '
                f'paint-order="stroke" stroke="#ffffff" stroke-width="6" stroke-linejoin="round">{esc(label)}</text>'
            )

    def render(self):
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" '
            f'font-family="{FONT}" role="img" aria-label="{esc(self.title)}">\n'
            f'<title>{esc(self.title)}</title>\n'
            '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            '<path d="M0 0 L10 5 L0 10 z" fill="#374151"/></marker></defs>\n'
            f'<rect width="{self.w}" height="{self.h}" fill="#ffffff"/>\n'
        )
        return head + "\n".join(self.parts) + "\n</svg>\n"


# ---------------------------------------------------------------- схемы-блоки


def context():
    s = Svg(900, 420, "Контекст: пользователи, трекер, GitHub, будущий сервер")
    people = [
        ("Разработчик", False),
        ("Продакт", False),
        ("Тимлид / scrum-мастер", False),
        ("Администратор (позже)", True),
    ]
    for i, (name, later) in enumerate(people):
        y = 40 + i * 80
        s.box(30, y, 210, 56, name, color="gray", dashed=later, tsize=15)
        s.line(240, y + 28, 260, y + 28, "#374151", width=2)
    s.line(260, 68, 260, 308, "#374151", width=2)
    s.arrow([(260, 210), (360, 210)], label="браузер")
    s.box(360, 140, 220, 140, "team-tracker", ["веб-приложение", "(SPA в браузере)"], strong=True, tsize=19)
    s.box(660, 30, 210, 90, "GitHub", ["репозиторий, pull request", "CI, демо на Pages"], color="amber")
    s.arrow([(240, 50), (660, 50)], label="код, pull request")
    s.arrow([(765, 120), (765, 200), (580, 200)], label="демо на Pages", lpos=(672, 200))
    s.box(660, 300, 210, 90, "Будущий сервер", ["API + PostgreSQL", "свой сервер или облако"], color="green", dashed=True)
    s.arrow([(580, 250), (765, 250), (765, 300)], dashed=True, label="позже: HTTPS, JSON", lpos=(672, 250))
    return s


def containers():
    s = Svg(900, 560, "Контейнеры: SPA, API, PostgreSQL, CI/CD, демо")
    s.box(30, 40, 220, 110, "Браузер: SPA", ["React + TypeScript", "логика и модуль хранения"])
    s.box(350, 40, 220, 110, "API (позже)", ["Node.js + Fastify", "проверка данных: Zod"], color="green", dashed=True)
    s.box(670, 40, 220, 110, "PostgreSQL (позже)", ["Drizzle: схема и миграции", "резервные копии"], color="green", dashed=True)
    s.arrow([(250, 95), (350, 95)], dashed=True, label="HTTPS, JSON", lpos=(300, 78), size=12)
    s.arrow([(570, 95), (670, 95)], dashed=True, label="SQL", lpos=(620, 78), size=12)
    s.box(30, 210, 220, 80, "Сейчас", ["seed.json + хранилище браузера"], color="green", lsize=13)
    s.arrow([(140, 150), (140, 210)], label="адаптер SeedLocal", lpos=(225, 180))
    s.line(30, 345, 870, 345)
    s.text(30, 372, "Разработка и доставка", 15, bold=True, fill="#475569")
    xs = [20, 240, 460, 680]
    s.box(xs[0], 400, 180, 90, "GitHub", ["репозиторий,", "pull request"], color="amber")
    s.box(xs[1], 400, 180, 90, "GitHub Actions", ["lint, typecheck,", "тесты, сборка"], color="amber")
    s.box(xs[2], 400, 180, 90, "Демо", ["GitHub Pages:", "SPA как статика"], color="amber")
    s.box(xs[3], 400, 180, 90, "Рабочий сервер", ["Docker: веб-сервер,", "Node, PostgreSQL"], color="green", dashed=True, lsize=13)
    s.arrow([(200, 445), (240, 445)])
    s.arrow([(420, 445), (460, 445)])
    s.arrow([(330, 490), (330, 525), (770, 525), (770, 490)], dashed=True, label="деплой (позже)", lpos=(550, 525))
    return s


def components():
    s = Svg(900, 690, "Компоненты фронтенда")
    s.frame(15, 20, 870, 150, "Страницы и модули  (маршруты вида /projects/:key/…)")
    mods = [
        ("Бэклог", "…/backlog"),
        ("Доска", "…/board"),
        ("Спринты", "…/sprints/:id"),
        ("Задача", "…/issues/:n"),
        ("Отчёты", "…/reports"),
        ("Люди", "…/people"),
    ]
    for i, (t, r) in enumerate(mods):
        s.box(30 + i * 143, 62, 130, 90, t, [r], tsize=16, lsize=12)
    s.box(30, 210, 400, 80, "UI-кит", ["компоненты, темы, горячие клавиши"], color="gray", lsize=13)
    s.box(470, 210, 400, 80, "Состояние", ["TanStack Query: данные; Zustand: интерфейс"], color="gray", lsize=13)
    s.arrow([(230, 170), (230, 210)])
    s.arrow([(670, 170), (670, 210)])
    s.box(
        15, 340, 870, 100, "Логика (доменная, чистый TypeScript без UI)",
        ["статусы и переходы · спринты · story points и итоги", "burndown и velocity · история изменений"],
        strong=True, tsize=17,
    )
    s.arrow([(670, 290), (670, 340)], label="запросы и команды", lpos=(760, 315))
    s.box(15, 490, 870, 60, "Интерфейс хранения (Storage)", ["типизированные методы, единственный доступ к данным"], strong=True, tsize=16, lsize=13)
    s.arrow([(450, 440), (450, 490)])
    s.box(120, 600, 320, 70, "Адаптер SeedLocal", ["сейчас: seed.json + браузер"], color="green")
    s.box(460, 600, 320, 70, "Адаптер Api", ["потом: Fastify + PostgreSQL"], color="green", dashed=True)
    s.arrow([(280, 550), (280, 600)])
    s.arrow([(620, 550), (620, 600)], dashed=True)
    return s


def status():
    s = Svg(900, 250, "Статусы задачи: допустим любой переход")
    names = ["Backlog", "To Do", "In Progress", "Review", "Done"]
    colors = ["gray", "blue", "blue", "blue", "green"]
    xs = [15 + 185 * i for i in range(5)]
    for x, n, c in zip(xs, names, colors):
        s.box(x, 70, 130, 60, n, color=c, tsize=16)
    for i in range(4):
        s.arrow([(xs[i] + 130, 100), (xs[i + 1], 100)], both=True)
    s.arrow([(xs[0] + 65, 130), (xs[0] + 65, 190), (xs[4] + 65, 190), (xs[4] + 65, 130)], both=True,
            label="допустим любой переход, в том числе пропуск и возврат", lpos=(450, 190))
    s.text(15, 30, "Обычный путь слева направо; каждая смена статуса пишется в историю", 14, fill="#475569")
    return s


def sprint_state():
    s = Svg(900, 170, "Состояния спринта")
    s.box(40, 50, 200, 70, "planned", ["запланирован"], color="gray")
    s.box(350, 50, 200, 70, "active", ["идёт"], color="blue")
    s.box(660, 50, 200, 70, "closed", ["закрыт, только чтение"], color="green", lsize=13)
    s.arrow([(240, 85), (350, 85)], label="запуск", lpos=(295, 66))
    s.arrow([(550, 85), (660, 85)], label="закрытие", lpos=(605, 66))
    s.text(450, 150, "Один активный спринт на проект; при закрытии незавершённое переносится", 14, anchor="middle", fill="#475569")
    return s


MANUAL = {
    "context": context,
    "containers": containers,
    "components": components,
    "status": status,
    "sprint-state": sprint_state,
}

# ------------------------------------------------- диаграммы последовательности


def wrap(s, width):
    return textwrap.wrap(s, max(width, 12)) or [""]


def sequence(src, title):
    W, margin = 900, 20
    parts, order = {}, []
    events = []
    for raw in src.splitlines():
        line = raw.strip()
        m = re.match(r"participant\s+(\w+)(?:\s+as\s+(.*))?$", line)
        if m:
            parts[m.group(1)] = (m.group(2) or m.group(1)).replace("<br/>", " ")
            order.append(m.group(1))
            continue
        m = re.match(r"(\w+)\s*(-->>|->>)\s*(\w+)\s*:\s*(.*)$", line)
        if m:
            events.append(("msg", m.group(1), m.group(3), m.group(4).replace("<br/>", " "), m.group(2) == "-->>"))
            continue
        m = re.match(r"Note over (\w+)(?:\s*,\s*(\w+))?\s*:\s*(.*)$", line)
        if m:
            events.append(("note", m.group(1), m.group(2) or m.group(1), m.group(3).replace("<br/>", " "), False))
    n = len(order)
    step = (W - 2 * margin) / n
    cx = {p: margin + step * (i + 0.5) for i, p in enumerate(order)}
    s = Svg(W, 0, title)
    bw = min(step - 16, 190)
    for p in order:
        s.box(round(cx[p] - bw / 2), 15, round(bw), 46, "", color="blue")
        lines = wrap(parts[p], int(bw / (15 * CHAR_W)))
        for k, t in enumerate(lines):
            s.text(round(cx[p]), 15 + 23 + (k - (len(lines) - 1) / 2) * 17 + 5, t, 14, "middle", True, "#1e3a8a")
    y = 85
    body = []
    for kind, a, b, text, dashed in events:
        if kind == "note":
            x1, x2 = sorted((cx[a], cx[b]))
            w = max(x2 - x1 + 150, 300)
            x = (x1 + x2) / 2 - w / 2
            x = max(8, min(x, W - 8 - w))
            lines = wrap(text, int((w - 20) / (13 * CHAR_W)))
            h = len(lines) * 17 + 14
            body.append(("note", x, y, w, h, lines))
            y += h + 18
        elif a == b:
            right = W - cx[a] > 260
            avail = (W - cx[a] - 70) if right else (cx[a] - 70)
            lines = wrap(text, int(avail / (13 * CHAR_W)))
            h = max(len(lines) * 17, 30)
            body.append(("self", cx[a], y, right, lines, dashed))
            y += h + 22
        else:
            span = abs(cx[b] - cx[a])
            lines = wrap(text, int((span - 24) / (13 * CHAR_W)))
            y += len(lines) * 17 + 4
            body.append(("msg", cx[a], cx[b], y, lines, dashed))
            y += 24
    H = int(y + 10)
    s.h = H
    lifelines = []
    for p in order:
        lifelines.append(
            f'<line x1="{cx[p]:.1f}" y1="61" x2="{cx[p]:.1f}" y2="{H - 8}" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="4 5"/>'
        )
    s.parts = lifelines + s.parts  # линии жизни под блоками участников
    for item in body:
        if item[0] == "note":
            _, x, ny, w, h, lines = item
            s.parts.append(
                f'<rect x="{x:.1f}" y="{ny}" width="{w:.1f}" height="{h}" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>'
            )
            for k, t in enumerate(lines):
                s.text(round(x + w / 2), ny + 20 + k * 17, t, 13, "middle")
        elif item[0] == "self":
            _, x, sy, right, lines, dashed = item
            d = 1 if right else -1
            dash = ' stroke-dasharray="8 6"' if dashed else ""
            s.parts.append(
                f'<path d="M{x:.1f} {sy} L{x + 40 * d:.1f} {sy} L{x + 40 * d:.1f} {sy + 24} L{x + 2 * d:.1f} {sy + 24}" '
                f'fill="none" stroke="#374151" stroke-width="2"{dash} marker-end="url(#arr)"/>'
            )
            for k, t in enumerate(lines):
                s.parts.append(
                    f'<text x="{round(x + 50 * d)}" y="{sy + 5 + k * 17}" text-anchor="{"start" if right else "end"}" font-size="13" fill="{INK}" '
                    f'paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round">{esc(t)}</text>'
                )
        else:
            _, x1, x2, my, lines, dashed = item
            dash = ' stroke-dasharray="8 6"' if dashed else ""
            ex = x2 - (2 if x2 > x1 else -2)
            s.parts.append(
                f'<line x1="{x1:.1f}" y1="{my}" x2="{ex:.1f}" y2="{my}" stroke="#374151" stroke-width="2"{dash} marker-end="url(#arr)"/>'
            )
            mid = (x1 + x2) / 2
            for k, t in enumerate(lines):
                ly = my - 7 - (len(lines) - 1 - k) * 17
                s.parts.append(
                    f'<text x="{mid:.1f}" y="{ly}" text-anchor="middle" font-size="13" fill="{INK}" '
                    f'paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round">{esc(t)}</text>'
                )
    return s


def sequences_from_docs():
    found = {}
    pat = re.compile(r"```mermaid\n(sequenceDiagram.*?)```\s*<!-- pdf: diagrams/([\w-]+)\.png -->", re.S)
    for md in sorted(DOCS.glob("*.md")):
        for m in pat.finditer(md.read_text(encoding="utf-8")):
            found[m.group(2)] = m.group(1)
    return found


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in MANUAL.items():
        (OUT / f"{name}.svg").write_text(fn().render(), encoding="utf-8")
        print("svg", name)
    for name, src in sequences_from_docs().items():
        (OUT / f"{name}.svg").write_text(sequence(src, name).render(), encoding="utf-8")
        print("svg", name, "(sequence)")


if __name__ == "__main__":
    main()
