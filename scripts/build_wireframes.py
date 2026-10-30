#!/usr/bin/env python3
"""Рисует макеты экранов (SVG) в docs/diagrams/wf-*.svg.

Содержимое (задачи, люди, спринты, суммы, burndown) берётся из data/seed.json,
поэтому макеты совпадают с демо-данными. PNG для PDF делает scripts/svg_to_png.cjs.
"""
import datetime
import html
import json
import pathlib
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "diagrams"
SEED = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))
FONT = "Helvetica, Arial, 'Segoe UI', 'DejaVu Sans', sans-serif"
W = 900
KEY = SEED["projects"][0]["key"]
PEOPLE = {p["id"]: p for p in SEED["people"]}
BY_NUM = {i["number"]: i for i in SEED["issues"]}
BY_ID = {i["id"]: i for i in SEED["issues"]}
SPRINTS = {s["id"]: s for s in SEED["sprints"]}
STATUSES = ["Backlog", "To Do", "In Progress", "Review", "Done"]

LIGHT = dict(
    name="light", bg="#ffffff", panel="#f3f4f6", line="#cbd5e1", ink="#1f2937", muted="#6b7280",
    accent="#2563eb", accent_ink="#ffffff", accent_bg="#dbeafe", card="#ffffff", warn="#b91c1c",
    status={"Backlog": "#e5e7eb", "To Do": "#e0e7ff", "In Progress": "#dbeafe", "Review": "#fef3c7", "Done": "#dcfce7"},
)
BEIGE = dict(
    name="beige", bg="#faf9f5", panel="#ffffff", line="#d6cfbf", ink="#2b2520", muted="#5e5348",
    accent="#6a5440", accent_ink="#ffffff", accent_bg="#f1ebdf", card="#ffffff", warn="#9b2c2c",
    status={"Backlog": "#efece4", "To Do": "#f3eee2", "In Progress": "#e6eeea", "Review": "#f7ebcf", "Done": "#e8efdf"},
)
DARK = dict(
    name="dark", bg="#111827", panel="#1f2937", line="#4b5563", ink="#f3f4f6", muted="#9ca3af",
    accent="#60a5fa", accent_ink="#111827", accent_bg="#1e3a8a", card="#273244", warn="#fca5a5",
    status={"Backlog": "#374151", "To Do": "#3730a3", "In Progress": "#1e40af", "Review": "#92400e", "Done": "#166534"},
)


def esc(s):
    return html.escape(str(s), quote=False)


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} {one}"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} {few}"
    return f"{n} {many}"


def initials(name):
    a = name.split()
    return a[0][0] + a[1][0]


def fdt(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%d.%m.%Y %H:%M")


def fd(s):
    return datetime.date.fromisoformat(s).strftime("%d.%m")


def fdy(s):
    return datetime.date.fromisoformat(s).strftime("%d.%m.%Y")


def tkey(i):
    return f"{KEY}-{i['number']}"


class WF:
    def __init__(self, h, title, theme=LIGHT):
        self.h, self.title, self.t = h, title, theme
        self.p = []

    # --- примитивы
    def est(self, s, size, bold=False):
        return len(s) * size * (0.6 if bold else 0.56)

    def fit(self, s, width, size, bold=False):
        if self.est(s, size, bold) <= width:
            return s
        n = max(int(width / (size * (0.6 if bold else 0.56))) - 1, 1)
        return s[:n].rstrip() + "…"

    def rect(self, x, y, w, h, fill=None, stroke=None, r=6, dash=False, sw=1.2, opacity=None):
        t = self.t
        fill = t["bg"] if fill is None else fill
        d = ' stroke-dasharray="6 4"' if dash else ""
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        op = f' fill-opacity="{opacity}"' if opacity is not None else ""
        self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{op}{st}{d}/>')

    def text(self, x, y, s, size=14, anchor="start", bold=False, fill=None):
        fill = fill or self.t["ink"]
        b = ' font-weight="bold"' if bold else ""
        self.p.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}"{b} fill="{fill}">{esc(s)}</text>')

    def line(self, x1, y1, x2, y2, color=None, dash=False, sw=1.2):
        color = color or self.t["line"]
        d = ' stroke-dasharray="6 4"' if dash else ""
        self.p.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{d}/>')

    def poly(self, pts, color, dash=False, sw=2.5):
        d = ' stroke-dasharray="7 5"' if dash else ""
        self.p.append(
            f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="{sw}"{d}/>'
        )

    def chip(self, x, y, label, size=12, fill=None, stroke=True, h=22, bold=False, ink=None):
        w = self.est(label, size, bold) + 16
        self.rect(x, y, w, h, fill=fill or self.t["panel"], stroke=self.t["line"] if stroke else None, r=h / 2)
        self.text(x + w / 2, y + h / 2 + size * 0.36, label, size, "middle", bold, ink)
        return w

    def button(self, x, y, w, h, label, primary=False, size=14):
        t = self.t
        if primary:
            self.rect(x, y, w, h, fill=t["accent"], stroke=t["accent"], r=6)
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size, "middle", True, t["accent_ink"])
        else:
            self.rect(x, y, w, h, fill=t["bg"], stroke=t["line"], r=6)
            self.text(x + w / 2, y + h / 2 + size * 0.36, label, size, "middle")

    def avatar(self, cx, cy, name, r=13):
        self.p.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{self.t["panel"]}" stroke="{self.t["line"]}" stroke-width="1.2"/>')
        self.text(cx, cy + 4, initials(name), 11, "middle", True)

    def points(self, cx, cy, n):
        if n is None:
            return
        self.p.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{self.t["panel"]}" stroke="{self.t["muted"]}" stroke-width="1.2"/>')
        self.text(cx, cy + 4.5, n, 12, "middle", True)

    def callout(self, n, x, y):
        self.p.append(f'<circle cx="{x}" cy="{y}" r="11" fill="{self.t["warn"]}"/>')
        self.text(x, y + 5, n, 13, "middle", True, "#ffffff")

    def field(self, x, y, w, label, value="", h=34, placeholder=False, error=None, dropdown=False, area=False):
        t = self.t
        self.text(x, y, label, 12, fill=t["muted"])
        y += 6
        stroke = t["warn"] if error else t["line"]
        self.rect(x, y, w, h, fill=t["bg"], stroke=stroke, r=6, sw=1.8 if error else 1.2)
        if value:
            self.text(x + 10, y + 22 if not area else y + 22, self.fit(value, w - 36, 14), 14, fill=t["muted"] if placeholder else t["ink"])
        if dropdown:
            self.text(x + w - 18, y + h / 2 + 5, "▾", 14, "middle", fill=t["muted"])
        if error:
            self.text(x, y + h + 16, error, 12, fill=t["warn"])

    def icon(self, x, y, typ, size=18):
        letter = {"Epic": "E", "Story": "S", "Task": "T", "Bug": "B", "Sub-task": "s"}[typ]
        self.rect(x, y, size, size, fill=self.t["panel"], stroke=self.t["muted"], r=4)
        self.text(x + size / 2, y + size - 5, letter, 12, "middle", True)

    def status_chip(self, x, y, status, size=12):
        return self.chip(x, y, status, size, fill=self.t["status"][status])

    def prio_chip(self, x, y, prio, size=12):
        mark = {"Highest": "▲▲", "High": "▲", "Medium": "■", "Low": "▼"}[prio]
        hot = prio in ("Highest", "High")
        return self.chip(x, y, f"{mark} {prio}", size, stroke=True, bold=hot, ink=self.t["warn"] if hot else None, fill=self.t["bg"])

    # --- каркас приложения
    def shell(self, url, active=None, tabs=True):
        t = self.t
        self.rect(0.6, 0.6, W - 1.2, self.h - 1.2, fill=t["bg"], stroke=t["line"], r=10, sw=1.4)
        self.rect(0.6, 0.6, W - 1.2, 34, fill=t["panel"], stroke=t["line"], r=10, sw=1.4)
        self.rect(1, 20, W - 2, 15, fill=t["panel"], r=0)
        for k in range(3):
            self.p.append(f'<circle cx="{18 + 18 * k}" cy="17" r="5" fill="{t["line"]}"/>')
        self.rect(84, 6, W - 168, 23, fill=t["bg"], stroke=t["line"], r=11.5)
        self.text(98, 22, url, 12, fill=t["muted"])
        self.line(1, 86, W - 1, 86)
        # логотип (ADR-013): знак и надпись «Team Tracker»; на макетах — цвета «Стандартной» гаммы
        ring, check = {"light": ("#2B4ACB", "#F08C00"), "beige": ("#484039", "#95816C")}.get(t["name"], ("#7B93FF", "#F08C00"))
        self.p.append(
            f'<g transform="translate(18 47) scale(0.4375)">'
            f'<path d="M52.78 20 A24 24 0 1 1 35.34 8.23" fill="none" stroke="{ring}" stroke-width="7" stroke-linecap="round"/>'
            f'<polygon points="45.24,9.62 36.31,1.30 34.37,15.16" fill="{ring}" stroke="{ring}" stroke-width="2" stroke-linejoin="round"/>'
            f'<polyline points="23,33 29.5,39.5 41,27" fill="none" stroke="{check}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
            f"</g>"
        )
        self.text(52, 66, "Team", 15, bold=True, fill=ring)
        self.text(94, 66, "Tracker", 15, bold=True, fill=check)
        if tabs:
            self.chip(158, 52, f"{KEY} ▾", 13, h=26)
            x = 230
            for name in ("Бэклог", "Доска", "Спринты", "Отчёты", "Люди", "Настройки"):
                w = self.est(name, 14, name == active) + 8
                self.text(x, 67, name, 14, bold=(name == active), fill=t["accent"] if name == active else t["ink"])
                if name == active:
                    self.rect(x - 2, 80, w, 4, fill=t["accent"], r=2)
                x += w + 10
        self.rect(W - 260, 50, 130, 30, fill=t["bg"], stroke=t["line"], r=6)
        self.text(W - 250, 70, "Поиск", 13, fill=t["muted"])
        self.rect(W - 160, 55, 24, 20, fill=t["panel"], stroke=t["line"], r=4)
        self.text(W - 148, 70, "/", 13, "middle", True)
        self.avatar(W - 56, 65, "Анна Ковалёва", 15)
        self.text(W - 34, 70, "▾", 13, "middle", fill=t["muted"])
        return 86

    def overlay(self):
        self.rect(1, 35, W - 2, self.h - 36, fill="#000000", r=0, opacity=0.45)

    def render(self):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{self.h}" viewBox="0 0 {W} {self.h}" '
            f'font-family="{FONT}" role="img" aria-label="{esc(self.title)}">\n<title>{esc(self.title)}</title>\n'
            '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0 0 L10 5 L0 10 z" fill="#2563eb"/></marker></defs>\n'
            f'<rect width="{W}" height="{self.h}" fill="#ffffff"/>\n' + "\n".join(self.p) + "\n</svg>\n"
        )


# ----------------------------------------------------------- общие блоки


def issue_row(wf, y, iss, x0=20, w=860, indent=0, badge=None):
    t = wf.t
    wf.rect(x0, y, w, 34, fill=t["bg"], stroke=t["line"], r=4)
    wf.text(x0 + 10, y + 22, "⋮⋮", 14, fill=t["muted"])
    wf.icon(x0 + 34 + indent, y + 8, iss["type"])
    wf.text(x0 + 62 + indent, y + 22, tkey(iss), 13, bold=True, fill=t["accent"])
    tx = x0 + 135 + indent
    title = wf.fit(iss["title"], w * 0.37 - indent, 14)
    wf.text(tx, y + 22, title, 14)
    if badge:
        wf.chip(tx + wf.est(title, 14) + 8, y + 6, badge, 11, h=20)
    wf.prio_chip(x0 + w * 0.57, y + 6, iss["priority"])
    wf.status_chip(x0 + w * 0.70, y + 6, iss["status"])
    wf.points(x0 + w * 0.865, y + 17, iss["points"])
    if iss["assigneeId"]:
        wf.avatar(x0 + w * 0.93, y + 17, PEOPLE[iss["assigneeId"]]["name"])
    else:
        wf.text(x0 + w * 0.93, y + 22, "—", 14, "middle", fill=t["muted"])


def sprint_issues(sid):
    return sorted([i for i in SEED["issues"] if i["sprintId"] == sid], key=lambda i: i["order"])


def status_at(iss, t=None):
    st = "Backlog"
    for h in SEED["history"]:
        if h["issueId"] == iss["id"] and h["field"] == "status" and (t is None or h["at"] <= t):
            st = h["to"]
    return st


def scope(sid):
    """Задачи спринта и их статус: у закрытого спринта — состав и статусы на момент closedAt (по истории)."""
    s = SPRINTS[sid]
    if s["state"] == "closed":
        ids = list(dict.fromkeys(h["issueId"] for h in SEED["history"] if h["field"] == "sprintId" and h["to"] == sid))
        items = sorted((BY_ID[x] for x in ids), key=lambda i: i["order"])
        return [(i, status_at(i, s["closedAt"])) for i in items]
    return [(i, i["status"]) for i in sprint_issues(sid)]


def sums(sid):
    rows = {}
    for i, st in scope(sid):
        r = rows.setdefault(i["assigneeId"], dict(n=0, pts=0, done=0))
        r["n"] += 1
        r["pts"] += i["points"] or 0
        if st == "Done":
            r["done"] += i["points"] or 0
    return rows


def pts_by_status(sid):
    d = {s: 0 for s in STATUSES}
    for i, st in scope(sid):
        d[st] += i["points"] or 0
    return d


def people_table(wf, x, y, sid, w=860):
    t = wf.t
    cols = [("Исполнитель", 0), ("Задач", w * 0.5), ("sp", w * 0.65), ("Из них в Done", w * 0.8)]
    wf.rect(x, y, w, 30, fill=t["panel"], stroke=t["line"], r=4)
    for name, dx in cols:
        wf.text(x + 12 + dx, y + 20, name, 13, bold=True)
    rows = sums(sid)
    y += 30
    tot = dict(n=0, pts=0, done=0)
    for pid, r in sorted(rows.items(), key=lambda kv: -kv[1]["pts"]):
        name = PEOPLE[pid]["name"] if pid else "Не назначено"
        wf.rect(x, y, w, 32, fill=t["bg"], stroke=t["line"], r=4)
        if pid:
            wf.avatar(x + 24, y + 16, name, 12)
        wf.text(x + 46, y + 21, name, 14)
        wf.text(x + 12 + w * 0.5, y + 21, r["n"], 14)
        wf.text(x + 12 + w * 0.65, y + 21, r["pts"], 14)
        wf.text(x + 12 + w * 0.8, y + 21, r["done"], 14)
        for k in tot:
            tot[k] += r[k]
        y += 32
    wf.rect(x, y, w, 32, fill=t["panel"], stroke=t["line"], r=4)
    wf.text(x + 12, y + 21, "Итого", 14, bold=True)
    wf.text(x + 12 + w * 0.5, y + 21, tot["n"], 14, bold=True)
    wf.text(x + 12 + w * 0.65, y + 21, tot["pts"], 14, bold=True)
    wf.text(x + 12 + w * 0.8, y + 21, tot["done"], 14, bold=True)
    return y + 32


# ------------------------------------------------------------------ экраны


def screen_map():
    wf = WF(560, "Карта экранов и адресов")
    t = wf.t

    def box(x, y, w, h, title, sub, dash=False, strong=False):
        wf.rect(x, y, w, h, fill=t["accent_bg"] if strong else t["panel"], stroke=t["accent"] if strong else t["muted"], r=8, dash=dash, sw=1.8)
        wf.text(x + w / 2, y + 24, title, 15, "middle", True)
        for k, s in enumerate(sub):
            wf.text(x + w / 2, y + 44 + k * 17, s, 12, "middle", fill=t["muted"])

    def arrow(x1, y1, x2, y2, dash=False):
        wf.line(x1, y1, x2, y2, t["ink"], dash=dash, sw=1.8)
        wf.p.append(f'<circle cx="{x2}" cy="{y2}" r="3.5" fill="{t["ink"]}"/>')

    box(20, 20, 200, 64, "Проекты", ["/ и /projects", "один проект — сразу бэклог"], strong=True)
    box(310, 20, 270, 64, "Проект", ["/projects/:key → бэклог"])
    arrow(220, 52, 310, 52)
    tabs = [
        ("Бэклог", "/backlog"),
        ("Доска", "/board"),
        ("Спринты", "/sprints"),
        ("Отчёты", "/reports"),
        ("Люди", "/people"),
        ("Настройки", "/settings"),
    ]
    xs = [20 + k * 146 for k in range(6)]
    for x, (n, u) in zip(xs, tabs):
        box(x, 150, 134, 64, n, ["…" + u])
        arrow(445, 84, x + 67, 150)
    box(20, 300, 250, 74, "Спринт", ["/projects/:key/sprints/:id", "цель, состав, итоги"])
    box(325, 300, 250, 74, "Задача", ["/projects/:key/issues/:n", "карточка, связи, история"])
    arrow(100, 214, 145, 300)
    arrow(276, 214, 400, 300)
    arrow(100, 214, 400, 300)
    arrow(452, 214, 450, 300)
    arrow(630, 214, 450, 300, dash=True)
    wf.text(640, 316, "Из бэклога, доски, спринта", 12, fill=t["muted"])
    wf.text(640, 334, "и поиска открывается карточка", 12, fill=t["muted"])
    wf.text(20, 420, "Окна поверх экрана (свой адрес не нужен):", 13, bold=True)
    for k, (n, s) in enumerate(
        [("Создать задачу", "C или кнопка"), ("Закрыть спринт", "кнопка в спринте"), ("Новый проект", "кнопка на «Проекты»"), ("Поиск и клавиши", "/ и ?")]
    ):
        box(20 + k * 220, 440, 205, 64, n, [s], dash=True)
    wf.text(20, 540, "Стрелка — переход. Пунктир — окно или редкий переход.", 12, fill=t["muted"])
    return wf


def screen_projects():
    wf = WF(500, "Экран «Проекты»")
    t = wf.t
    wf.shell("team-tracker.app/", tabs=False)
    wf.text(20, 130, "Проекты", 24, bold=True)
    wf.button(W - 190, 108, 170, 36, "+ Новый проект", True)
    wf.callout(1, W - 200, 108)
    wf.rect(20, 160, 270, 130, fill=t["bg"], stroke=t["line"], r=8, sw=1.6)
    wf.text(36, 190, SEED["projects"][0]["name"], 17, bold=True)
    wf.chip(36, 202, KEY, 12, bold=True)
    wf.text(36, 246, f"{len(SEED['issues'])} задач · {len(SEED['sprints'])} спринта · {len(SEED['people'])} человека", 13, fill=t["muted"])
    act = next(s for s in SEED["sprints"] if s["state"] == "active")
    wf.text(36, 268, f"{act['name']} идёт до {fdy(act['end'])}", 13, fill=t["muted"])
    wf.callout(2, 290, 160)
    wf.rect(310, 160, 270, 130, fill=t["bg"], stroke=t["muted"], r=8, dash=True)
    wf.text(445, 232, "+ Новый проект", 15, "middle", fill=t["muted"])
    wf.line(20, 320, W - 20, 320)
    wf.text(20, 350, "Новый проект", 17, bold=True)
    wf.field(20, 385, 160, "Ключ задач *", "demo", error="2–10 заглавных латинских букв, например DEMO")
    wf.field(200, 385, 380, "Название *", "Демо-проект")
    wf.button(20, 450, 120, 36, "Создать", True)
    wf.button(150, 450, 100, 36, "Отмена")
    wf.callout(3, 6, 385)
    return wf


def screen_backlog():
    sp = SPRINTS["s2"]
    items = sprint_issues("s2")
    top = [i for i in items if i["type"] != "Sub-task"]
    backlog = sorted([i for i in SEED["issues"] if i["sprintId"] is None and i["type"] not in ("Epic",)], key=lambda i: i["order"])
    h = 86 + 190 + len(top) * 38 + 70 + 70 + len(backlog) * 38 + 40
    wf = WF(h, "Экран «Бэклог»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 128, "Бэклог", 24, bold=True)
    wf.button(W - 200, 106, 180, 36, "+ Создать задачу", True)
    wf.callout(1, W - 208, 106)
    wf.rect(20, 154, 260, 32, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(30, 175, "Найти по номеру или названию", 13, fill=t["muted"])
    x = 296
    for name in ("Исполнитель ▾", "Тип ▾", "Приоритет ▾", "Метка ▾"):
        x += wf.chip(x, 158, name, 13, h=26) + 8
    wf.callout(2, 290, 154)
    y = 204
    wf.rect(20, y, 860, 52, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, y + 22, f"▾ {sp['name']}", 15, bold=True)
    wf.chip(150, y + 7, "идёт", 12, fill=t["status"]["In Progress"])
    wf.text(212, y + 22, f"{fd(sp['start'])} – {fd(sp['end'])}", 13, fill=t["muted"])
    wf.text(34, y + 42, "Цель: " + sp["goal"], 13, fill=t["muted"])
    wf.text(W - 40, y + 22, f"{sum(i['points'] or 0 for i in items)} sp", 14, "end", True)
    wf.callout(3, 14, y)
    y += 58
    for i in top:
        kids = [k for k in items if k["parentId"] == i["id"] and k["type"] == "Sub-task"]
        issue_row(wf, y, i, badge=f"↳ {len(kids)}" if kids else None)
        y += 38
    wf.callout(4, 20, 204 + 58)
    wf.callout(5, 36, 204 + 58 + 38 * 2 + 17)
    y += 6
    wf.rect(20, y, 860, 40, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, y + 25, "▾ Спринт 3", 15, bold=True)
    wf.chip(150, y + 9, "запланирован", 12)
    y += 46
    wf.rect(20, y, 860, 40, fill=t["bg"], stroke=t["muted"], r=6, dash=True)
    wf.text(450, y + 25, "Перетащите задачи сюда", 13, "middle", fill=t["muted"])
    wf.callout(6, 14, y)
    y += 54
    wf.rect(20, y, 860, 40, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, y + 25, "▾ Бэклог", 15, bold=True)
    wf.text(120, y + 25, plural(len(backlog), "задача", "задачи", "задач"), 13, fill=t["muted"])
    y += 46
    for i in backlog:
        issue_row(wf, y, i)
        y += 38
    return wf


def board(theme, title, url, with_callouts=True):
    sid = "s2"
    items = sprint_issues(sid)
    cols = ["To Do", "In Progress", "Review", "Done"]
    cw, gap = 206, 12
    cx = [20 + k * (cw + gap) for k in range(4)]
    card_h = 90
    lanes = []
    for pid in ["u2", "u3", "u1"]:
        cells = {c: [i for i in items if i["assigneeId"] == pid and i["status"] == c] for c in cols}
        lanes.append((pid, cells, max(1, max(len(v) for v in cells.values()))))
    h = 86 + 70 + 36 + sum(34 + n * (card_h + 8) + 6 for _, _, n in lanes) + 20
    wf = WF(h, title, theme)
    t = wf.t
    wf.shell(url, "Доска")
    y = 98
    wf.chip(20, y + 6, "Спринт 2 ▾", 14, h=30)
    wf.chip(130, y + 6, "Группировать: Исполнитель ▾", 14, h=30, fill=t["accent_bg"])
    wf.chip(358, y + 6, "Тип ▾", 14, h=30)
    wf.chip(420, y + 6, "Приоритет ▾", 14, h=30)
    wf.text(W - 20, y + 27, "Свернуть группы", 13, "end", fill=t["muted"])
    if with_callouts:
        wf.callout(1, 124, y + 6)
    y = 142
    st = pts_by_status(sid)
    for k, c in enumerate(cols):
        n = len([i for i in items if i["status"] == c])
        wf.rect(cx[k], y, cw, 30, fill=t["status"][c], stroke=t["line"], r=6)
        wf.text(cx[k] + 10, y + 20, c, 14, bold=True)
        wf.text(cx[k] + cw - 10, y + 20, f"{n} · {st[c]} sp", 12, "end", fill=t["muted"])
    if with_callouts:
        wf.callout(2, cx[0] + cw, y)
    y += 36
    for lane_no, (pid, cells, n) in enumerate(lanes):
        lane_items = [i for i in items if i["assigneeId"] == pid]
        name = PEOPLE[pid]["name"]
        wf.rect(20, y, 860, 30, fill=t["panel"], stroke=t["line"], r=6)
        wf.text(30, y + 20, "▾", 13)
        wf.avatar(58, y + 15, name, 11)
        wf.text(78, y + 20, name, 14, bold=True)
        wf.text(W - 30, y + 20, f"{plural(len(lane_items), 'задача', 'задачи', 'задач')} · {sum(i['points'] or 0 for i in lane_items)} sp", 12, "end", fill=t["muted"])
        if with_callouts and lane_no == 0:
            wf.callout(3, 20, y)
        y += 34
        lane_h = n * (card_h + 8) + 6
        for k, c in enumerate(cols):
            wf.rect(cx[k], y, cw, lane_h, fill=t["panel"], stroke=t["line"], r=6, opacity=0.55 if theme is LIGHT else None)
            for r, i in enumerate(cells[c]):
                card(wf, cx[k] + 8, y + 6 + r * (card_h + 8), cw - 16, card_h, i)
            if not cells[c] and c == "Done" and lane_no == 0:
                wf.text(cx[k] + cw / 2, y + 40, "Перетащите сюда", 12, "middle", fill=t["muted"])
        if with_callouts and lane_no == 0:
            wf.callout(4, cx[1] + cw - 14, y + 6)
        y += lane_h + 6
    return wf


def card(wf, x, y, w, h, i):
    t = wf.t
    wf.rect(x, y, w, h, fill=t["card"], stroke=t["muted"], r=6)
    wf.icon(x + 8, y + 7, i["type"], 16)
    wf.text(x + 30, y + 20, tkey(i), 12, bold=True, fill=t["accent"])
    if i["type"] == "Sub-task" and i["parentId"]:
        label = "↑ " + tkey(BY_ID[i["parentId"]])
        wf.chip(x + w - wf.est(label, 10.5) - 24, y + 5, label, 10.5, h=19)
    lines = textwrap.wrap(i["title"], 24)[:2]
    if len(textwrap.wrap(i["title"], 24)) > 2:
        lines[1] = lines[1][:-1] + "…"
    for k, s in enumerate(lines):
        wf.text(x + 8, y + 38 + k * 15, s, 12.5)
    wf.prio_chip(x + 8, y + h - 27, i["priority"], 10.5)
    wf.points(x + w - 18, y + h - 16, i["points"])


def screen_sprints():
    h = 780
    wf = WF(h, "Экран «Спринты»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/sprints/s2", "Спринты")
    wf.text(20, 128, "Спринты", 24, bold=True)
    wf.rect(20, 150, 250, 560, fill=t["panel"], stroke=t["line"], r=8)
    y = 164
    for sid, label, fill in (
        ("s2", "идёт", t["status"]["In Progress"]),
        ("s3", "запланирован", t["panel"]),
        ("s1", "закрыт", t["status"]["Done"]),
    ):
        s = SPRINTS[sid]
        sel = sid == "s2"
        wf.rect(30, y, 230, 64, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=6, sw=1.8 if sel else 1.2)
        wf.text(42, y + 24, s["name"], 15, bold=True)
        wf.chip(250 - wf.est(label, 12) - 26, y + 8, label, 12, fill=fill)
        wf.text(42, y + 46, f"{fd(s['start'])} – {fd(s['end'])}", 12, fill=t["muted"])
        y += 72
    wf.button(30, y + 4, 230, 34, "+ Новый спринт")
    wf.callout(1, 24, 164)
    s = SPRINTS["s2"]
    x0 = 290
    wf.text(x0, 176, s["name"], 22, bold=True)
    wf.chip(x0 + 130, 158, "идёт", 13, fill=t["status"]["In Progress"], h=26)
    wf.button(W - 190, 154, 170, 34, "Закрыть спринт", True)
    wf.callout(2, W - 198, 154)
    wf.text(x0, 204, f"{fdy(s['start'])} – {fdy(s['end'])}", 13, fill=t["muted"])
    wf.text(x0, 228, "Цель: " + s["goal"], 14)
    wf.text(W - 40, 228, "✎", 14, "end", fill=t["muted"])
    wf.callout(3, x0 - 17, 214)
    st = pts_by_status("s2")
    total = sum(st.values())
    wf.text(x0, 268, f"Прогресс: {st['Done']} из {total} sp в Done", 14, bold=True)
    bx, bw = x0, 590
    for c in ("Done", "Review", "In Progress", "To Do"):
        if st[c]:
            w = bw * st[c] / total
            wf.rect(bx, 280, w, 24, fill=t["status"][c], stroke=t["line"], r=0)
            if w > 70:
                wf.text(bx + w / 2, 297, f"{c} {st[c]}", 11, "middle")
            bx += w
    wf.callout(4, x0 - 17, 292)
    wf.text(x0, 340, "Итоги по людям", 16, bold=True)
    people_table(wf, x0, 352, "s2", 590)
    wf.callout(5, x0 - 17, 352)
    wf.text(x0, 548, "Состав спринта", 16, bold=True)
    yy = 562
    for i in sprint_issues("s2")[:3]:
        issue_row(wf, yy, i, x0=x0, w=590)
        yy += 38
    wf.text(x0, yy + 20, "…ещё 4 задачи", 13, fill=t["muted"])
    return wf


def screen_close():
    wf = screen_sprints_skeleton()
    t = wf.t
    wf.overlay()
    mx, my, mw, mh = 190, 130, 520, 470
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 40, "Закрыть «Спринт 2»?", 20, bold=True)
    st = pts_by_status("s2")
    items = sprint_issues("s2")
    done = [i for i in items if i["status"] == "Done"]
    left = [i for i in items if i["status"] != "Done"]
    wf.text(mx + 24, my + 76, f"Выполнено: {plural(len(done), 'задача', 'задачи', 'задач')} · {st['Done']} sp", 14)
    wf.text(mx + 24, my + 98, f"Не завершено: {plural(len(left), 'задача', 'задачи', 'задач')} · {sum(i['points'] or 0 for i in left)} sp", 14, bold=True)
    wf.callout(1, mx + 6, my + 76)
    yy = my + 112
    for i in left[:3]:
        wf.icon(mx + 24, yy + 3, i["type"], 16)
        wf.text(mx + 50, yy + 16, tkey(i), 12, bold=True, fill=t["accent"])
        wf.text(mx + 120, yy + 16, wf.fit(i["title"], 330, 13), 13)
        yy += 26
    wf.text(mx + 50, yy + 14, f"…ещё {plural(len(left) - 3, 'задача', 'задачи', 'задач')}", 12, fill=t["muted"])
    wf.text(mx + 24, my + 250, "Куда перенести незавершённое:", 14, bold=True)
    for k, (label, on) in enumerate((("В «Спринт 3» (запланирован)", True), ("Обратно в бэклог", False))):
        cy = my + 284 + k * 34
        wf.p.append(f'<circle cx="{mx + 34}" cy="{cy}" r="8" fill="{t["bg"]}" stroke="{t["accent"]}" stroke-width="1.8"/>')
        if on:
            wf.p.append(f'<circle cx="{mx + 34}" cy="{cy}" r="4.5" fill="{t["accent"]}"/>')
        wf.text(mx + 54, cy + 5, label, 14)
    wf.callout(2, mx + 6, my + 284)
    wf.text(mx + 24, my + 372, f"Velocity спринта: {st['Done']} sp — сумма points задач в Done на момент закрытия.", 12, fill=t["muted"])
    wf.text(mx + 24, my + 392, "После закрытия спринт доступен только для чтения.", 12, fill=t["muted"])
    wf.callout(3, mx + 6, my + 372)
    wf.button(mx + mw - 270, my + mh - 56, 160, 38, "Закрыть спринт", True)
    wf.button(mx + mw - 100, my + mh - 56, 84, 38, "Отмена")
    return wf


def screen_sprints_skeleton():
    wf = WF(700, "Закрытие спринта")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/sprints/s2", "Спринты")
    wf.text(20, 128, "Спринты", 24, bold=True)
    wf.rect(20, 150, 250, 480, fill=t["panel"], stroke=t["line"], r=8)
    wf.rect(290, 150, 590, 480, fill=t["bg"], stroke=t["line"], r=8)
    wf.text(310, 190, "Спринт 2", 22, bold=True)
    return wf


def screen_issue(num, tab, title):
    i = BY_NUM[num]
    parent = BY_ID.get(i["parentId"]) if i["parentId"] else None
    kids = [k for k in SEED["issues"] if k["parentId"] == i["id"]]
    links = [l for l in SEED["links"] if i["id"] in (l["fromId"], l["toId"])]
    comments = [c for c in SEED["comments"] if c["issueId"] == i["id"]]
    hist = [x for x in SEED["history"] if x["issueId"] == i["id"]]
    h = 820 if tab == "comments" else 800 + 36 * max(0, len(hist) - 4) + 40
    wf = WF(h, title)
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/issues/{i['number']}", None)
    crumbs = f"{KEY}"
    if parent:
        crumbs += f"  ›  {tkey(parent)}"
    crumbs += f"  ›  {tkey(i)}"
    wf.text(34, 112, crumbs, 13, fill=t["muted"])
    wf.callout(1, 14, 106)
    wf.icon(34, 128, i["type"], 26)
    wf.text(70, 150, wf.fit(i["title"], 600, 24, True), 24, bold=True)
    wf.text(W - 20, 150, "✎", 16, "end", fill=t["muted"])
    # левая колонка
    x0, lw = 34, 576
    y = 188
    wf.text(x0, y, "Описание", 15, bold=True)
    y += 10
    for s in textwrap.wrap(i["description"], 72):
        y += 20
        wf.text(x0, y, s, 14)
    y += 30
    wf.text(x0, y, "Критерии приёмки", 15, bold=True)
    for s in textwrap.wrap(i["acceptance"], 72):
        y += 22
        wf.text(x0, y, "☐ " + s, 14)
    y += 34
    wf.text(x0, y, f"Подзадачи ({len(kids)})", 15, bold=True)
    wf.callout(2, x0 - 12, y - 5)
    y += 10
    for k in kids:
        wf.rect(x0, y, lw, 30, fill=t["bg"], stroke=t["line"], r=4)
        wf.icon(x0 + 8, y + 6, k["type"], 18)
        wf.text(x0 + 36, y + 20, tkey(k), 12, bold=True, fill=t["accent"])
        wf.text(x0 + 106, y + 20, wf.fit(k["title"], 320, 13), 13)
        wf.status_chip(x0 + lw - 110, y + 4, k["status"], 11)
        y += 34
    if not kids:
        wf.text(x0, y + 18, "Подзадач нет", 13, fill=t["muted"])
        y += 28
    y += 18
    wf.text(x0, y, "Связи", 15, bold=True)
    wf.callout(3, x0 - 12, y - 5)
    y += 10
    names = {"blocks": ("блокирует", "заблокирована"), "relates": ("связана с", "связана с"), "duplicates": ("дубликат", "оригинал")}
    for l in links:
        outgoing = l["fromId"] == i["id"]
        other = BY_ID[l["toId"] if outgoing else l["fromId"]]
        wf.rect(x0, y, lw, 30, fill=t["bg"], stroke=t["line"], r=4)
        wf.text(x0 + 10, y + 20, names[l["type"]][0 if outgoing else 1], 13, fill=t["muted"])
        wf.text(x0 + 130, y + 20, tkey(other), 13, bold=True, fill=t["accent"])
        wf.text(x0 + 200, y + 20, wf.fit(other["title"], 270, 13), 13)
        wf.status_chip(x0 + lw - 110, y + 4, other["status"], 11)
        y += 34
    if not links:
        wf.text(x0, y + 18, "Связей нет", 13, fill=t["muted"])
        y += 28
    wf.text(x0, y + 20, "+ Добавить связь", 13, fill=t["accent"])
    y += 46
    # вкладки
    wf.line(x0, y + 28, x0 + lw, y + 28)
    for k, (key, label) in enumerate((("comments", f"Комментарии ({len(comments)})"), ("history", f"История ({len(hist)})"))):
        tx = x0 + k * 170
        on = tab == key
        wf.text(tx, y + 20, label, 14, bold=on, fill=t["accent"] if on else t["ink"])
        if on:
            wf.rect(tx - 2, y + 26, wf.est(label, 14, True) + 6, 3, fill=t["accent"], r=1)
    wf.callout(4, x0 - 12, y + 14)
    y += 44
    if tab == "comments":
        for c in comments:
            a = PEOPLE[c["authorId"]]["name"]
            wf.avatar(x0 + 14, y + 14, a)
            wf.text(x0 + 38, y + 14, a, 14, bold=True)
            wf.text(x0 + 38 + wf.est(a, 14, True) + 12, y + 14, fdt(c["createdAt"]), 12, fill=t["muted"])
            for r, s in enumerate(textwrap.wrap(c["text"], 70)):
                wf.text(x0 + 38, y + 36 + r * 18, s, 14)
            y += 36 + 18 * len(textwrap.wrap(c["text"], 70)) + 14
        wf.rect(x0, y, lw, 64, fill=t["bg"], stroke=t["line"], r=6)
        wf.text(x0 + 12, y + 24, "Написать комментарий…", 14, fill=t["muted"])
        wf.text(x0 + lw - 12, y + 54, "Ctrl+Enter — отправить", 12, "end", fill=t["muted"])
        y += 70
    else:
        for x in hist:
            a = PEOPLE[x["authorId"]]["name"]
            wf.rect(x0, y, lw, 32, fill=t["bg"], stroke=t["line"], r=4)
            wf.text(x0 + 10, y + 21, fdt(x["at"]), 12, fill=t["muted"])
            wf.text(x0 + 140, y + 21, a, 13, bold=True)
            sp = lambda v: SPRINTS[v]["name"] if v else "—"
            if x["field"] == "created":
                wf.text(x0 + 290, y + 21, "создана:", 13, fill=t["muted"])
                wf.status_chip(x0 + 360, y + 5, x["to"], 11)
            elif x["field"] == "sprintId":
                wf.text(x0 + 290, y + 21, "спринт:", 13, fill=t["muted"])
                wf.text(x0 + 350, y + 21, f"{sp(x['from'])} → {sp(x['to'])}", 13)
            else:
                wf.text(x0 + 290, y + 21, "статус:", 13, fill=t["muted"])
                xx = x0 + 345
                xx += wf.status_chip(xx, y + 5, x["from"], 11) + 6
                wf.text(xx, y + 21, "→", 13)
                wf.status_chip(xx + 20, y + 5, x["to"], 11)
            y += 36
        wf.text(x0, y + 18, "Записи только добавляются; править и удалять их нельзя.", 12, fill=t["muted"])
        y += 30
    # правая колонка
    rx, rw = 640, 240
    wf.rect(rx, 178, rw, 548, fill=t["panel"], stroke=t["line"], r=8)
    wf.callout(5, rx, 178)
    yy = 206
    spr = SPRINTS.get(i["sprintId"])
    rows = [("Статус", None), ("Исполнитель", None), ("Автор", None), ("Приоритет", None), ("Story points", None),
            ("Спринт", spr["name"] if spr else "Бэклог"), ("Родитель", tkey(parent) if parent else "—"),
            ("Метки", None), ("Срок", fdy(i["dueDate"]) if i["dueDate"] else "—"),
            ("Создана", fdt(i["createdAt"])), ("Обновлена", fdt(i["updatedAt"]))]
    for label, val in rows:
        wf.text(rx + 14, yy, label, 12, fill=t["muted"])
        vy = yy + 20
        if label == "Статус":
            wf.status_chip(rx + 14, vy - 14, i["status"], 13)
            wf.text(rx + rw - 18, vy + 1, "▾", 13, "middle")
        elif label in ("Исполнитель", "Автор"):
            pid = i["assigneeId"] if label == "Исполнитель" else i["reporterId"]
            if pid:
                wf.avatar(rx + 26, vy - 5, PEOPLE[pid]["name"], 11)
                wf.text(rx + 46, vy, PEOPLE[pid]["name"], 13)
            else:
                wf.text(rx + 14, vy, "Не назначен", 13, fill=t["muted"])
        elif label == "Приоритет":
            wf.prio_chip(rx + 14, vy - 15, i["priority"], 12)
        elif label == "Story points":
            if i["points"] is None:
                wf.text(rx + 14, vy, "— (для этого типа не ставятся)", 12, fill=t["muted"])
            else:
                wf.points(rx + 26, vy - 5, i["points"])
        elif label == "Метки":
            xx = rx + 14
            for lb in i["labels"][:3]:
                xx += wf.chip(xx, vy - 15, lb, 11, h=20) + 4
        else:
            wf.text(rx + 14, vy, val, 13)
        yy += 46
    return wf


def screen_create():
    wf = screen_backlog_skeleton()
    t = wf.t
    wf.overlay()
    mx, my, mw, mh = 130, 108, 640, 660
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 38, "Создать задачу", 20, bold=True)
    wf.text(mx + mw - 24, my + 38, "Esc", 12, "end", fill=t["muted"])
    f1 = mx + 24
    wf.field(f1, my + 76, 190, "Тип *", "Task", dropdown=True)
    wf.field(f1 + 210, my + 76, 380, "Родитель (Epic)", f"{tkey(BY_NUM[1])} {BY_NUM[1]['title']}", dropdown=True)
    wf.callout(1, f1 - 14, my + 76)
    wf.field(f1, my + 146, mw - 48, "Название *", "", error="Введите название (до 200 символов)")
    wf.callout(2, f1 - 14, my + 146)
    wf.field(f1, my + 232, mw - 48, "Описание", "", h=70, area=True)
    wf.field(f1, my + 330, mw - 48, "Критерии приёмки", "", h=56, area=True)
    wf.field(f1, my + 416, 190, "Приоритет", "Medium", dropdown=True)
    wf.field(f1 + 210, my + 416, 170, "Story points", "3")
    wf.text(f1 + 210, my + 478, "Story, Task и Bug", 11, fill=t["muted"])
    wf.callout(3, f1 + 196, my + 416)
    wf.field(f1 + 400, my + 416, 190, "Исполнитель", "Мария Орлова", dropdown=True)
    wf.field(f1, my + 496, 190, "Метки", "заказы, бэкенд")
    wf.field(f1 + 210, my + 496, 170, "Срок", "05.11.2026")
    wf.field(f1 + 400, my + 496, 190, "Спринт", "Спринт 2", dropdown=True)
    wf.button(mx + mw - 330, my + mh - 58, 200, 38, "Создать  (Ctrl+Enter)", True, 13)
    wf.button(mx + mw - 114, my + mh - 58, 90, 38, "Отмена")
    wf.callout(4, mx + mw - 338, my + mh - 58)
    return wf


def screen_backlog_skeleton():
    wf = WF(800, "Создание задачи")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 128, "Бэклог", 24, bold=True)
    for k, i in enumerate(sprint_issues("s2")[:6]):
        issue_row(wf, 160 + k * 38, i)
    return wf


def screen_reports():
    wf = WF(800, "Экран «Отчёты»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/reports", "Отчёты")
    wf.text(20, 128, "Отчёты", 24, bold=True)
    wf.chip(150, 108, "Спринт 1 ▾", 14, h=30)
    wf.callout(1, 144, 108)
    s1 = SPRINTS["s1"]
    start = datetime.date.fromisoformat(s1["start"])
    end = datetime.date.fromisoformat(s1["end"])
    days = (end - start).days + 1

    def values_at(issue, t, strict_sprint):
        """Спринт, статус и points задачи на момент t — откат событий истории (как в domain/totals.ts)."""
        sprint_id, status, points = issue["sprintId"], issue["status"], issue["points"]
        events = [h for h in SEED["history"] if h["issueId"] == issue["id"]]
        for h in reversed(sorted(events, key=lambda h: h["at"])):
            if h["field"] == "sprintId" and (h["at"] >= t if strict_sprint else h["at"] > t):
                sprint_id = h["from"]
            if h["at"] > t and h["field"] == "status":
                status = h["from"]
            if h["at"] > t and h["field"] == "points":
                points = None if h["from"] is None else int(h["from"])
        return sprint_id, status, points

    scopes, rem = [], []
    for d in range(days):
        day = start + datetime.timedelta(days=d)
        t_end = f"{day.isoformat()}T23:59:59Z"
        frozen = t_end >= s1["closedAt"]
        at = s1["closedAt"] if frozen else t_end
        sc = dn = 0
        for i in SEED["issues"]:
            sprint_id, status, points = values_at(i, at, frozen)
            if sprint_id == "s1":
                sc += points or 0
                dn += (points or 0) if status == "Done" else 0
        scopes.append(sc)
        rem.append(sc - dn)
    total = max(scopes)
    top = max(4, -(-total // 4) * 4)
    initial = scopes[0]
    # burndown
    gx, gy, gw, gh = 60, 214, 470, 220
    wf.text(34, 180, "Burndown: остаток sp по дням", 16, bold=True)
    wf.callout(2, 14, 174)
    for k in range(5):
        v = top * k // 4
        yy = gy + gh - gh * v / top
        wf.line(gx, yy, gx + gw, yy, dash=True)
        wf.text(gx - 8, yy + 4, v, 12, "end", fill=t["muted"])
    ideal = [(gx + gw * d / (days - 1), gy + gh - gh * initial * (1 - d / (days - 1)) / top) for d in range(days)]
    actual = [(gx + gw * d / (days - 1), gy + gh - gh * rem[d] / top) for d in range(days)]
    wf.poly(ideal, t["muted"], dash=True, sw=2)
    wf.poly(actual, t["accent"], sw=3)
    for d in range(0, days, 2):
        wf.text(gx + gw * d / (days - 1), gy + gh + 20, fd((start + datetime.timedelta(days=d)).isoformat()), 11, "middle", fill=t["muted"])
    wf.line(gx, gy + gh, gx + gw, gy + gh, t["muted"])
    wf.line(gx, gy, gx, gy + gh, t["muted"])
    wf.line(gx + 20, gy + gh + 46, gx + 60, gy + gh + 46, t["accent"], sw=3)
    wf.text(gx + 68, gy + gh + 50, "факт", 12)
    wf.line(gx + 130, gy + gh + 46, gx + 170, gy + gh + 46, t["muted"], dash=True, sw=2)
    wf.text(gx + 178, gy + gh + 50, "идеал", 12)
    wf.text(gx + 250, gy + gh + 50, "Таблица данных ▸", 12, fill=t["accent"])
    # velocity
    vx, vw = 580, 300
    wf.text(vx, 180, "Velocity: sp в Done по спринтам", 16, bold=True)
    wf.callout(3, vx - 17, 174)
    base = gy + gh
    wf.line(vx, base, vx + vw, base, t["muted"])
    vel = sum(i["points"] or 0 for i, st in scope("s1") if st == "Done")
    vtop = max(4, -(-max(vel, 21) // 4) * 4)
    bh = gh * vel / vtop
    wf.rect(vx + 40, base - bh, 80, bh, fill=t["accent"], r=3)
    wf.text(vx + 80, base - bh - 8, vel, 14, "middle", True)
    wf.text(vx + 80, base + 20, "Спринт 1", 12, "middle")
    wf.text(vx + 80, base + 36, "из 18 sp", 11, "middle", fill=t["muted"])
    wf.line(vx, base - bh, vx + vw, base - bh, t["muted"], dash=True, sw=2)
    wf.text(vx + vw, base - bh - 6, f"средняя {vel}", 11, "end", fill=t["muted"])
    wf.rect(vx + 170, base - 3, 80, 3, fill=t["muted"], r=0)
    wf.text(vx + 210, base - 12, "0", 12, "middle", fill=t["muted"])
    wf.text(vx + 210, base + 20, "Спринт 2", 12, "middle")
    wf.text(vx + 210, base + 36, "в процессе", 11, "middle", fill=t["muted"])
    wf.text(34, 546, f"Итоги по людям — {s1['name']}", 16, bold=True)
    wf.callout(4, 14, 540)
    people_table(wf, 20, 560, "s1")
    wf.text(20, 770, "Графики построены по демо-данным (календарные дни); под каждым графиком есть таблица данных.", 12, fill=t["muted"])
    return wf


def screen_people():
    wf = WF(770, "Экран «Люди»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/people", "Люди")
    wf.text(20, 128, "Люди", 24, bold=True)
    wf.chip(110, 108, "Спринт 2 ▾", 14, h=30)
    cols = [("Имя", 54), ("Роль", 300), ("Задач", 520), ("Points", 620), ("Done", 740)]
    wf.rect(20, 150, 860, 30, fill=t["panel"], stroke=t["line"], r=4)
    for n, dx in cols:
        wf.text(20 + dx, 170, n, 13, bold=True)
    rows = sums("s2")
    y = 180
    for p in SEED["people"]:
        r = rows.get(p["id"], dict(n=0, pts=0, done=0))
        sel = p["id"] == "u3"
        wf.rect(20, y, 860, 36, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=4)
        wf.avatar(44, y + 18, p["name"], 12)
        wf.text(74, y + 23, p["name"], 14, bold=sel)
        wf.text(320, y + 23, p["role"], 14)
        wf.text(540, y + 23, r["n"], 14)
        wf.text(640, y + 23, r["pts"], 14)
        wf.text(760, y + 23, r["done"], 14)
        y += 38
    wf.callout(1, 14, 180)
    y += 24
    p = PEOPLE["u3"]
    wf.text(34, y, f"Задачи: {p['name']}", 16, bold=True)
    wf.callout(2, 14, y - 6)
    y += 12
    for i in [i for i in sprint_issues("s2") if i["assigneeId"] == "u3"]:
        issue_row(wf, y, i)
        y += 38
    # Учётки и роли: только при работе с сервером (ADR-010)
    y += 34
    wf.text(34, y, "Учётки и роли", 18, bold=True)
    wf.callout(3, 14, y - 18)
    y += 14
    wf.rect(20, y, 860, 30, fill=t["panel"], stroke=t["line"], r=4)
    for n, dx in (("Имя", 20), ("Почта", 300), ("Роль", 600)):
        wf.text(20 + dx, y + 20, n, 13, bold=True)
    y += 30
    for name, mail, role in (
        ("Анна Ковалёва", "anna@example.com", "Администратор"),
        ("Игорь Смирнов", "igor@example.com", "Разработчик"),
        ("Мария Орлова", "maria@example.com", "Тимлид / scrum-мастер"),
    ):
        wf.rect(20, y, 860, 38, fill=t["bg"], stroke=t["line"], r=4)
        wf.text(40, y + 24, name, 14)
        wf.text(320, y + 24, mail, 14, fill=t["muted"])
        wf.rect(620, y + 5, 240, 28, fill=t["bg"], stroke=t["line"], r=6)
        wf.text(632, y + 24, role, 14)
        wf.text(846, y + 24, "▾", 14, "middle", fill=t["muted"])
        y += 38
    wf.text(20, y + 22, "Роль меняет только администратор; у остальных роль показана текстом, почты не видны.", 12, fill=t["muted"])
    return wf


def screen_login():
    wf = WF(470, "Экран входа")
    t = wf.t
    wf.rect(0.6, 0.6, W - 1.2, wf.h - 1.2, fill=t["bg"], stroke=t["line"], r=10, sw=1.4)
    wf.rect(0.6, 0.6, W - 1.2, 34, fill=t["panel"], stroke=t["line"], r=10, sw=1.4)
    wf.rect(1, 20, W - 2, 15, fill=t["panel"], r=0)
    for k in range(3):
        wf.p.append(f'<circle cx="{18 + 18 * k}" cy="17" r="5" fill="{t["line"]}"/>')
    wf.rect(84, 6, W - 168, 23, fill=t["bg"], stroke=t["line"], r=11.5)
    wf.text(98, 22, "team-tracker.app/", 12, fill=t["muted"])
    x = (W - 400) // 2
    wf.text(x, 100, "team-tracker", 26, bold=True)
    wf.text(x, 152, "Вход", 15, bold=True, fill=t["accent"])
    wf.rect(x, 158, 52, 3, fill=t["accent"], r=1)
    wf.line(x, 161, x + 400, 161)
    wf.callout(1, x - 30, 134)
    wf.field(x, 190, 400, "Почта *", "anna@example.com")
    wf.field(x, 252, 400, "Пароль *", "••••••••••")
    wf.callout(2, x - 30, 196)
    wf.button(x, 322, 120, 38, "Войти", True)
    wf.text(x, 392, "Учётки создаёт администратор. Нет доступа — обратитесь к нему.", 12, fill=t["muted"])
    wf.text(x, 410, "Вкладка «Регистрация» появляется, только если регистрация разрешена.", 12, fill=t["muted"])
    wf.callout(3, x - 30, 378)
    return wf


def screen_settings():
    wf = WF(560, "Экран «Настройки проекта»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    pr = SEED["projects"][0]
    wf.text(20, 128, "Настройки проекта", 24, bold=True)
    wf.text(20, 176, "Спринты", 18, bold=True)
    wf.text(20, 200, "Значения подставляются в форму нового спринта; названия и даты каждого спринта можно изменить на экране «Спринты».", 13, fill=t["muted"])
    wf.field(20, 236, 400, "Длительность по умолчанию, дней", str(pr["sprintDurationDays"]))
    wf.text(20, 292, "От 1 до 90; конец = старт + длительность − 1 день", 11, fill=t["muted"])
    wf.callout(1, 6, 236)
    wf.field(450, 236, 400, "Название: префикс", pr["sprintPrefix"])
    wf.text(450, 292, "Например, «Спринт» или «Итерация»", 11, fill=t["muted"])
    wf.callout(2, 436, 236)
    wf.field(20, 322, 400, "Номер следующего спринта", str(pr["nextSprintNumber"]))
    wf.text(20, 378, "Растёт сам, когда создаётся спринт с предложенным названием", 11, fill=t["muted"])
    wf.callout(3, 6, 322)
    wf.field(450, 322, 400, "Дата старта следующего спринта", "", placeholder=True)
    wf.text(450, 378, "Если пусто — на следующий день после конца последнего спринта", 11, fill=t["muted"])
    wf.callout(4, 436, 322)
    last = max(s["end"] for s in SEED["sprints"])
    start = (datetime.date.fromisoformat(last) + datetime.timedelta(days=1))
    end = start + datetime.timedelta(days=pr["sprintDurationDays"] - 1)
    wf.rect(20, 410, 830, 44, fill=t["accent_bg"], stroke=t["accent"], r=6)
    wf.text(36, 438, f"Следующий спринт: «{pr['sprintPrefix']} {pr['nextSprintNumber']}», {start.strftime('%d.%m.%Y')} – {end.strftime('%d.%m.%Y')}", 15, bold=True)
    wf.callout(5, 14, 410)
    wf.button(20, 480, 140, 38, "Сохранить", True)
    return wf


def screen_backups():
    wf = WF(815, "Блок «Резервные копии» на экране «Настройки» (только администратор)")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    # предупреждение при ошибке: видно администратору на любом экране
    wf.rect(0, 87, W, 40, fill="#fee2e2", stroke=t["warn"], r=0)
    wf.text(20, 112, "⚠ Резервная копия за 28.10.2026 18:00 не создана: нет места на диске. Откройте «Настройки → Резервные копии».", 13, bold=True, fill=t["warn"])
    wf.callout(1, 884, 107)
    wf.text(20, 168, "Настройки проекта", 24, bold=True)
    wf.text(20, 202, "Спринты: …", 14, fill=t["muted"])
    wf.line(20, 218, 880, 218)
    wf.text(20, 252, "Резервные копии", 18, bold=True)
    wf.text(210, 252, "только администратор", 12, fill=t["muted"])
    # состояние
    wf.rect(20, 270, 860, 70, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(36, 298, "Последняя копия:  29.10.2026 18:00", 15, bold=True)
    wf.chip(360, 282, "✓ проверена", 13, fill="#dcfce7", h=24)
    wf.text(36, 324, "Следующая:  сегодня в 18:00, каждый день (BACKUP_TIME)", 14)
    wf.callout(2, 12, 282)
    # папка копий: выбор места хранения
    wf.text(20, 366, "Папка для копий", 12, fill=t["muted"])
    wf.rect(20, 374, 590, 34, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(30, 396, "D:\\Dropbox\\tracker-backups", 14)
    wf.button(622, 374, 120, 34, "Обзор…")
    wf.button(752, 374, 128, 34, "Сохранить", True)
    wf.text(20, 426, "Полный путь; папка проверяется, после сохранения сразу делается первая копия.", 11, fill=t["muted"])
    wf.callout(3, 12, 390)
    # кнопки
    wf.button(20, 444, 220, 38, "Сделать копию сейчас", True)
    wf.button(256, 444, 180, 38, "Скачать Excel")
    wf.text(452, 468, "tracker.xlsx из копии от 29.10.2026 18:00", 12, fill=t["muted"])
    wf.callout(4, 12, 458)
    # список копий
    wf.text(20, 518, "Последние копии", 15, bold=True)
    wf.rect(20, 530, 860, 30, fill=t["panel"], stroke=t["line"], r=4)
    for n, dx in (("Дата", 14), ("Причина", 190), ("Результат", 380), ("Состав", 540)):
        wf.text(20 + dx, 550, n, 13, bold=True)
    rows = [
        ("29.10.2026 18:00", "по расписанию", "✓ проверена", "задач 16, спринтов 3, людей 5"),
        ("29.10.2026 09:12", "при запуске", "✓ проверена", "задач 16, спринтов 3, людей 5"),
        ("28.10.2026 18:00", "по расписанию", "✗ ошибка: нет места", "—"),
        ("27.10.2026 18:00", "вручную", "✓ проверена", "задач 15, спринтов 3, людей 4"),
    ]
    y = 560
    for d, why, res, content in rows:
        bad = res.startswith("✗")
        wf.rect(20, y, 860, 34, fill=t["bg"], stroke=t["warn"] if bad else t["line"], r=4)
        wf.text(34, y + 22, d, 13)
        wf.text(210, y + 22, why, 13)
        wf.text(400, y + 22, res, 13, bold=bad, fill=t["warn"] if bad else None)
        wf.text(560, y + 22, content, 13, fill=t["muted"])
        y += 34
    wf.callout(5, 12, 576)
    wf.text(20, y + 30, "Хранятся 30 последних ежедневных и 12 ежемесячных копий (BACKUP_KEEP_DAILY, BACKUP_KEEP_MONTHLY).", 12, fill=t["muted"])
    wf.text(20, y + 50, "В каждой копии: tracker.xlsx (для чтения), tracker.json (для восстановления), копия базы.", 12, fill=t["muted"])
    wf.text(20, y + 70, "Восстановление — только из командной строки: npm run restore <папка копии>.", 12, fill=t["muted"])
    wf.callout(6, 12, y + 28)
    return wf


def screen_about():
    wf = WF(700, "Экран «О программе»: версия, копии, диагностика, журнал ошибок")
    t = wf.t
    wf.shell(f"team-tracker.app/about", "Настройки")
    wf.text(20, 130, "О программе", 24, bold=True)
    wf.text(190, 130, "из меню профиля → «О программе»", 12, fill=t["muted"])
    # версия: видят все роли
    wf.rect(20, 150, 860, 112, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(36, 180, "Team Tracker  0.3.0", 18, bold=True)
    rows = [("Сборка", "29.10.2026 11:30 (клиент и сервер одной версии)"), ("Режим", "сервер · встроенная база PGlite"), ("Окружение", "Node 22 · Windows")]
    for n, (a, b) in enumerate(rows):
        wf.text(36, 206 + n * 20, a, 13, fill=t["muted"])
        wf.text(150, 206 + n * 20, b, 13)
    wf.callout(1, 12, 160)
    # резервные копии: только администратор
    wf.text(20, 296, "Резервные копии", 16, bold=True)
    wf.text(190, 296, "только администратор", 12, fill=t["muted"])
    wf.rect(20, 306, 860, 56, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(36, 330, "Последняя копия: 29.10.2026 18:00", 14, bold=True)
    wf.chip(330, 314, "✓ проверена", 13, fill=t["status"]["Done"], h=24)
    wf.text(36, 351, "Следующая — сегодня в 18:00.", 13, fill=t["muted"])
    wf.text(880 - 14, 330, "Настройки → Резервные копии ›", 13, "end", fill=t["accent"])
    wf.callout(2, 12, 316)
    # диагностика
    wf.text(20, 396, "Диагностика", 16, bold=True)
    wf.text(150, 396, "только администратор", 12, fill=t["muted"])
    wf.button(20, 408, 230, 38, "Собрать диагностику", True)
    wf.text(266, 432, "diagnostics-2026-10-29.zip — скачивается на этот компьютер", 13, fill=t["muted"])
    wf.text(20, 466, "В архиве: версия и сборка, настройки без секретов (пароли и строка подключения не", 12, fill=t["muted"])
    wf.text(20, 484, "включаются), последние записи журнала ошибок, состояние копий. Данные задач и людей — нет.", 12, fill=t["muted"])
    wf.callout(3, 12, 420)
    # журнал ошибок
    wf.text(20, 520, "Журнал ошибок", 16, bold=True)
    wf.text(180, 520, "последние записи · только администратор", 12, fill=t["muted"])
    wf.rect(20, 530, 860, 120, fill=t["panel"], stroke=t["line"], r=8)
    log = [("29.10 10:12", "клиент", "TypeError: Cannot read properties of undefined (экран «Доска»)"), ("29.10 09:40", "сервер", "500 POST /api/commit: нарушена целостность данных"), ("28.10 18:00", "сервер", "копия не создана: нет места на диске")]
    for n, (d, src, msg) in enumerate(log):
        y = 556 + n * 28
        wf.text(36, y, d, 12, fill=t["muted"])
        wf.chip(120, y - 15, src, 11, h=20)
        wf.text(190, y, wf.fit(msg, 680, 12.5), 12.5)
    wf.text(880 - 14, 520, "Файлы: DATA_DIR/logs (ротация: до 5 × 1 МБ)", 12, "end", fill=t["muted"])
    wf.callout(4, 12, 540)
    wf.text(20, 680, "Обычный участник видит только блок «Версия». Макет, не готовый экран.", 12, fill=t["muted"])
    return wf



# ---------------------------------------------------------------- проекты и портфель (часть 3)

def proj_card(wf, x, y, w, h, key, num, typ, title, prio, pts, who, tag=True):
    """Карточка на доске нескольких проектов: те же поля плюс метка проекта."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["card"], stroke=t["muted"], r=6)
    wf.icon(x + 6, y + 6, typ, 15)
    wf.text(x + 26, y + 18, f"{key}-{num}", 11, bold=True, fill=t["accent"])
    if tag:
        cw = wf.chip(x + w - wf.est(key, 10, True) - 22, y + 4, key, 10, h=18, fill=t["accent_bg"], bold=True)
    lines = textwrap.wrap(title, max(int((w - 12) / 6.1), 6))[:2]
    for n, line in enumerate(lines):
        wf.text(x + 6, y + 38 + n * 13, line, 11)
    hot = prio in ("Highest", "High")
    wf.text(x + 14, y + h - 9, PRIO_MARK[prio], 11, "middle", hot, t["warn"] if hot else t["muted"])
    if pts is not None:
        wf.points(x + w - 44, y + h - 14, pts)
    if who:
        wf.avatar(x + w - 16, y + h - 14, who, 10)


def project_filter_popover(wf, x, y, w=300):
    """Окно выбора проектов: наборы «Мои / Все / Выбрать» и список проектов с владельцами."""
    t = wf.t
    wf.rect(x + 3, y + 4, w, 262, fill="#000000", r=8, opacity=0.14)
    wf.rect(x, y, w, 262, fill=t["bg"], stroke=t["accent"], r=8, sw=1.6)
    wf.text(x + 14, y + 24, "Проекты", 14, bold=True)
    for n, (label, on) in enumerate((("Мои проекты", False), ("Все проекты", False), ("Выбрать", True))):
        cx = x + 16 + n * 96
        wf.p.append(f'<circle cx="{cx}" cy="{y + 48}" r="6" fill="{t["accent"] if on else t["bg"]}" stroke="{t["accent"]}" stroke-width="1.6"/>')
        wf.text(cx + 11, y + 52, label, 11.5)
    wf.line(x + 10, y + 64, x + w - 10, y + 64)
    rows = (("DEMO", "Демо-проект", "АК", True, True), ("SHOP", "Интернет-магазин", "ИС", True, True), ("CRM", "Клиентская база", "МО", False, False), ("API", "Публичный API", "АК", False, False))
    for n, (k_, name, who, mine, on) in enumerate(rows):
        yy = y + 78 + n * 32
        wf.rect(x + 14, yy, 14, 14, fill=t["accent"] if on else t["bg"], stroke=t["accent"], r=3, sw=1.4)
        if on:
            wf.text(x + 21, yy + 11, "✓", 11, "middle", True, t["accent_ink"])
        wf.text(x + 38, yy + 12, k_, 12.5, bold=True)
        wf.text(x + 84, yy + 12, wf.fit(name, 120, 12), 12)
        if mine:
            wf.chip(x + w - 76, yy - 3, "мой", 10, h=18, fill=t["accent_bg"])
        wf.avatar(x + w - 22, yy + 7, {"АК": "Анна Ковалёва", "ИС": "Игорь Смирнов", "МО": "Мария Орлова"}[who], 9)
    wf.line(x + 10, y + 212, x + w - 10, y + 212)
    wf.text(x + 14, y + 234, "Выбор запоминается для вас и виден в адресе", 11, fill=t["muted"])
    wf.text(x + 14, y + 250, "страницы: ?projects=DEMO,SHOP", 11, fill=t["muted"])


def screen_board_projects():
    wf = WF(780, "Доска нескольких проектов: фильтр по проектам и дорожки-проекты")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board?projects=DEMO,SHOP", "Доска")
    nav_pills(wf, 96)
    # панель: фильтр проектов + остальные
    fx = 20
    wf.rect(fx, 134, 188, 30, fill=t["accent_bg"], stroke=t["accent"], r=15, sw=1.6)
    wf.text(fx + 14, 154, "Проекты: Мои (2) ▾", 13, bold=True)
    wf.callout(1, 14, 134)
    wf.chip(222, 136, "Группировка: по проектам", 12.5, h=28, fill=t["panel"], ink=t["muted"])
    wf.chip(426, 136, "Тип ▾", 12.5, h=28)
    wf.chip(480, 136, "Приоритет ▾", 12.5, h=28)
    wf.callout(2, 216, 134)
    cols = ["To Do", "In Progress", "Review", "Done"]
    gap, cx0, y0 = 12, 20, 182
    cw = (W - 40 - 3 * gap) / 4
    for n, c in enumerate(cols):
        x = cx0 + n * (cw + gap)
        wf.rect(x, y0, cw, 34, fill=t["status"][c], stroke=t["line"], r=6)
        wf.text(x + 10, y0 + 22, c, 13, bold=True)
    lanes = [
        ("DEMO", "Демо-проект", "Спринт 3", "09.11 – 20.11", "2 задачи · 8 sp",
         {"To Do": [(22, "Story", "Детали заказа", "High", 3, "Игорь Смирнов")], "In Progress": [(19, "Task", "Фильтр заказов по дате", "High", 5, "Игорь Смирнов")], "Review": [], "Done": []}),
        ("SHOP", "Интернет-магазин", "Спринт 5", "02.11 – 13.11", "3 задачи · 9 sp",
         {"To Do": [(41, "Bug", "Ошибка округления в корзине", "Highest", 2, "Мария Орлова")], "In Progress": [], "Review": [(37, "Story", "Промокоды", "Medium", 5, "Анна Ковалёва")], "Done": [(33, "Task", "Баннер на главной", "Low", 2, "Игорь Смирнов")]}),
    ]
    y = y0 + 42
    for key_, name, sp, dates, stat, cards in lanes:
        wf.rect(cx0, y, W - 40, 30, fill=t["panel"], stroke=t["line"], r=5)
        wf.text(cx0 + 10, y + 20, "▾", 12)
        wf.chip(cx0 + 28, y + 4, key_, 11.5, h=22, fill=t["accent_bg"], bold=True)
        wf.text(cx0 + 74, y + 20, name, 13, bold=True)
        wf.text(cx0 + 220, y + 20, f"{sp} · {dates}", 12.5, fill=t["muted"])
        wf.text(W - 28, y + 20, stat, 12, "end", fill=t["muted"])
        y += 36
        for n, c in enumerate(cols):
            x = cx0 + n * (cw + gap)
            wf.rect(x, y, cw, 112, fill=t["panel"], stroke=t["line"], r=6, opacity=0.55)
            for card in cards[c][:1]:
                proj_card(wf, x + 8, y + 8, cw - 16, 96, key_, *card)
        y += 120
    wf.text(20, y + 14, "Колонки статусов общие; у каждой дорожки — свой активный спринт со своими датами.", 12, fill=t["muted"])
    wf.text(20, y + 32, "Перетаскивать карточку можно только по колонкам своего проекта. Макет, не готовый экран.", 12, fill=t["muted"])
    # открытое окно выбора проектов
    project_filter_popover(wf, 20, 170)
    wf.callout(3, 336, y0 + 56)
    wf.callout(4, 330, y0 + 100)
    wf.callout(5, 14, 180)
    wf.h = max(wf.h, y + 54)
    return wf


def portfolio_card(wf, x, y, w, d):
    t = wf.t
    h = 424
    risk = d["risk"]
    wf.rect(x, y, w, h, fill=t["panel"], stroke=t["warn"] if risk else t["line"], r=8, sw=1.8 if risk else 1.2)
    wf.chip(x + 14, y + 12, d["key"], 12.5, h=24, fill=t["accent_bg"], bold=True)
    wf.text(x + 72, y + 30, d["name"], 15, bold=True)
    wf.avatar(x + w - 24, y + 24, d["owner"], 12)
    if risk:
        wf.text(x + w - 46, y + 29, f"⚠ {risk}", 12, "end", True, t["warn"])
    # спринт
    wf.text(x + 14, y + 58, f"{d['sprint']} · {d['dates']}", 12.5, bold=True)
    wf.text(x + w - 14, y + 58, d["left"], 12.5, "end", fill=t["muted"])
    wf.text(x + 14, y + 76, wf.fit("Цель: " + d["goal"], w - 28, 12), 12, fill=t["muted"])
    # выполнено
    pct = d["done"] / d["scope"]
    wf.text(x + 14, y + 102, f"Выполнено {d['done']} из {d['scope']} sp · {round(pct * 100)} %", 12.5)
    wf.rect(x + 14, y + 110, 200, 8, fill=t["bg"], stroke=t["muted"], r=4)
    wf.rect(x + 14, y + 110, 200 * pct, 8, fill=t["accent"], r=4, sw=0)
    # мини-burndown
    bx, by, bw, bh = x + w - 150, y + 90, 136, 48
    wf.rect(bx, by, bw, bh, fill=t["bg"], stroke=t["line"], r=4)
    n = len(d["burn"])
    ideal = [(bx + 6 + i * (bw - 12) / (n - 1), by + 6 + i * (bh - 12) / (n - 1)) for i in range(n)]
    top = max(d["burn"])
    real = [(bx + 6 + i * (bw - 12) / (n - 1), by + 6 + (bh - 12) * (1 - v / top)) for i, v in enumerate(d["burn"])]
    wf.poly(ideal, t["muted"], dash=True, sw=1.4)
    wf.poly(real, t["accent"], sw=2)
    wf.text(bx + bw / 2, by + bh + 13, "burndown", 10, "middle", fill=t["muted"])
    # задачи по статусам: сегменты
    sx = x + 14
    total = sum(d["status"].values()) or 1
    segw = w - 28
    cx = sx
    for st_, cnt in d["status"].items():
        ww = segw * cnt / total
        if ww > 0:
            wf.rect(cx, y + 158, ww, 14, fill=t["status"][st_], stroke=t["line"], r=2, sw=1)
            cx += ww
    wf.text(sx, y + 190, "  ·  ".join(f"{k_} {v}" for k_, v in d["status"].items()), 11.5, fill=t["muted"])
    # заполнение ёмкости
    over = d["fill"] > d["cap"]
    wf.text(x + 14, y + 216, f"Заполнение {d['fill']} / {d['cap']} sp · {round(d['fill'] / d['cap'] * 100)} %", 12.5)
    wf.rect(x + 14, y + 224, 200, 8, fill=t["bg"], stroke=t["muted"], r=4)
    wf.rect(x + 14, y + 224, min(200, 200 * d["fill"] / d["cap"] / 1.25), 8, fill=t["warn"] if over else t["accent"], r=4, sw=0)
    if over:
        wf.text(x + 226, y + 232, f"⚠ перегруз на {d['fill'] - d['cap']} sp", 12, bold=True, fill=t["warn"])
    # просрочено и заблокировано
    yy = y + 256
    wf.chip(x + 14, yy, f"Просрочено: {d['overdue']}", 12, h=24, fill=t["bg"], bold=bool(d["overdue"]), ink=t["warn"] if d["overdue"] else None)
    wf.chip(x + 140, yy, f"Заблокировано: {d['blocked']}", 12, h=24, fill=t["bg"], bold=bool(d["blocked"]), ink=t["warn"] if d["blocked"] else None)
    for i, line in enumerate(d["lines"][:2]):
        wf.text(x + 14, yy + 42 + i * 16, wf.fit(line, w - 28, 11.5), 11.5, fill=t["muted"])
    # эпики
    ey = y + 348
    for i, (title, pc) in enumerate(d["epics"][:2]):
        wf.text(x + 14, ey + i * 20 + 10, wf.fit(title, 150, 11.5), 11.5)
        wf.rect(x + 170, ey + i * 20 + 2, 110, 8, fill=t["bg"], stroke=t["muted"], r=4)
        wf.rect(x + 170, ey + i * 20 + 2, 110 * pc / 100, 8, fill=t["accent"], r=4, sw=0)
        wf.text(x + 290, ey + i * 20 + 10, f"{pc} %", 11.5, fill=t["muted"])
    wf.text(x + w - 14, y + h - 14, "Доска →   Планирование →", 12.5, "end", fill=t["accent"], bold=True)


def screen_portfolio():
    wf = WF(1120, "Экран «Портфель»: проекты продакта одним охватом")
    t = wf.t
    wf.shell("team-tracker.app/portfolio", "Портфель")
    wf.text(20, 130, "Портфель", 24, bold=True)
    wf.text(190, 130, "активные спринты ваших проектов", 13, fill=t["muted"])
    wf.rect(20, 148, 188, 30, fill=t["accent_bg"], stroke=t["accent"], r=15, sw=1.6)
    wf.text(34, 168, "Проекты: Мои (4) ▾", 13, bold=True)
    wf.callout(1, 14, 148)
    wf.chip(222, 150, "Сортировка: по риску ▾", 12.5, h=28)
    wf.chip(396, 150, "☐ Только с риском", 12.5, h=28)
    wf.callout(2, 216, 148)
    data = [
        dict(key="DEMO", name="Демо-проект", owner="Анна Ковалёва", risk="перегруз", sprint="Спринт 3", dates="09.11 – 20.11", left="осталось 8 дн.", goal="заказы: просмотр, фильтр, экспорт", done=13, scope=21, burn=[21, 21, 19, 17, 17, 15, 13, 11], status={"To Do": 2, "In Progress": 1, "Review": 1, "Done": 1}, fill=21, cap=17, overdue=2, blocked=1, lines=["DEMO-19 срок 05.11 · DEMO-20 срок 06.11", "DEMO-22 заблокирована задачей DEMO-19"], epics=[("Личный кабинет клиента", 40), ("Заказы", 25)]),
        dict(key="SHOP", name="Интернет-магазин", owner="Игорь Смирнов", risk="", sprint="Спринт 5", dates="02.11 – 13.11", left="осталось 4 дн.", goal="корзина и промокоды", done=14, scope=20, burn=[20, 19, 16, 14, 11, 9, 7, 6], status={"To Do": 1, "In Progress": 2, "Review": 1, "Done": 4}, fill=20, cap=22, overdue=0, blocked=0, lines=["Просроченных и заблокированных задач нет"], epics=[("Оплата", 70), ("Каталог", 55)]),
        dict(key="CRM", name="Клиентская база", owner="Мария Орлова", risk="блокировки", sprint="Спринт 2", dates="26.10 – 06.11", left="спринт закончился 2 дн. назад", goal="импорт контактов", done=8, scope=19, burn=[19, 19, 18, 18, 17, 15, 13, 11], status={"To Do": 3, "In Progress": 2, "Review": 0, "Done": 2}, fill=19, cap=20, overdue=1, blocked=3, lines=["CRM-12 срок 03.11", "CRM-15, CRM-16, CRM-18 ждут CRM-9"], epics=[("Импорт", 35), ("Поиск дублей", 10)]),
        dict(key="API", name="Публичный API", owner="Анна Ковалёва", risk="", sprint="Спринт 7", dates="09.11 – 20.11", left="осталось 8 дн.", goal="версия 2: ключи доступа", done=5, scope=16, burn=[16, 16, 15, 14, 13, 12, 11, 11], status={"To Do": 3, "In Progress": 2, "Review": 1, "Done": 2}, fill=16, cap=18, overdue=0, blocked=0, lines=["Просроченных и заблокированных задач нет"], epics=[("Версия 2", 31)]),
    ]
    for n, d in enumerate(data):
        portfolio_card(wf, 20 + (n % 2) * 440, 196 + (n // 2) * 438, 420, d)
    wf.callout(3, 14, 206)
    wf.callout(4, 14 + 440, 206)
    wf.callout(5, 20 + 380, 196 + 70)
    wf.callout(6, 20 + 396, 196 + 300)
    wf.text(20, 1098, "Клик по проекту — на его доску или планирование. Риск: перегруз, просрочки, блокировки. Макет, не готовый экран.", 12, fill=t["muted"])
    return wf


def screen_members():
    wf = WF(700, "Настройки проекта: владелец и участники")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    wf.text(20, 130, "Настройки проекта", 24, bold=True)
    wf.text(20, 176, "Участники проекта", 18, bold=True)
    wf.text(220, 176, "владелец и администратор", 12, fill=t["muted"])
    wf.text(20, 206, "Владелец продукта", 12, fill=t["muted"])
    wf.rect(20, 212, 300, 34, fill=t["bg"], stroke=t["line"], r=6)
    wf.avatar(40, 229, "Анна Ковалёва", 10)
    wf.text(58, 234, "Анна Ковалёва", 14)
    wf.text(300, 234, "▾", 14, "middle", fill=t["muted"])
    wf.text(336, 234, "меняет только администратор", 12, fill=t["muted"])
    wf.callout(1, 12, 226)
    wf.rect(20, 268, 860, 30, fill=t["panel"], stroke=t["line"], r=4)
    for name, dx in (("Участник", 14), ("Роль в проекте", 340), ("", 640)):
        wf.text(20 + dx, 288, name, 13, bold=True)
    rows = [("Игорь Смирнов", "Разработчик"), ("Мария Орлова", "Разработчик"), ("Дмитрий Васильев", "Тимлид")]
    y = 298
    for who, role in rows:
        wf.rect(20, y, 860, 38, fill=t["bg"], stroke=t["line"], r=4)
        wf.avatar(40, y + 19, who, 10)
        wf.text(58, y + 24, who, 14)
        wf.rect(350, y + 5, 200, 28, fill=t["bg"], stroke=t["line"], r=6)
        wf.text(362, y + 24, role, 13)
        wf.text(536, y + 24, "▾", 13, "middle", fill=t["muted"])
        wf.button(760, y + 5, 108, 28, "Убрать", size=13)
        y += 38
    wf.callout(2, 12, 312)
    y += 14
    wf.rect(20, y, 860, 46, fill=t["panel"], stroke=t["line"], r=6, dash=True)
    wf.rect(34, y + 8, 290, 30, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(46, y + 28, "Выберите человека", 13, fill=t["muted"])
    wf.text(310, y + 28, "▾", 13, "middle", fill=t["muted"])
    wf.rect(340, y + 8, 210, 30, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(352, y + 28, "Разработчик", 13)
    wf.text(536, y + 28, "▾", 13, "middle", fill=t["muted"])
    wf.button(760, y + 8, 108, 30, "+ Добавить", True, size=13)
    wf.callout(3, 12, y + 22)
    y += 76
    notes = [
        "«Мои проекты» — те, где вы владелец или участник; администратор может выбрать «Все проекты».",
        "Продакт меняет состав и порядок задач, приоритеты и спринты только в своих проектах (владелец или участник).",
        "Тимлид, администратор и разработчик (статусы своих задач) работают, как раньше.",
        "Владельца и участников меняют администратор и владелец проекта. Макет, не готовый экран.",
    ]
    for n, line in enumerate(notes):
        wf.text(30, y + n * 20, line, 12.5, fill=t["muted"])
    wf.callout(4, 10, y - 5)
    return wf



# ---------------------------------------------------------------- скорость работы (часть 4)

def screen_quick():
    wf = WF(700, "Командная палитра Ctrl+K")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    wf.text(20, 130, "Доска", 24, bold=True)
    wf.overlay()
    mx, my, mw = 140, 110, 620
    wf.rect(mx + 3, my + 4, mw, 500, fill="#000000", r=10, opacity=0.18)
    wf.rect(mx, my, mw, 500, fill=t["bg"], stroke=t["accent"], r=10, sw=1.8)
    wf.rect(mx + 14, my + 14, mw - 28, 40, fill=t["bg"], stroke=t["accent"], r=6, sw=1.6)
    wf.text(mx + 28, my + 40, "DEMO-1", 16)
    wf.text(mx + mw - 30, my + 40, "Ctrl+K", 12, "end", fill=t["muted"])
    wf.callout(1, mx + 8, my + 14)
    y = my + 80
    wf.text(mx + 20, y, "Задачи · проекты: Мои (2)", 12, fill=t["muted"])
    y += 10
    rows = [(1, True), (10, False), (11, False), (12, False)]
    for num, sel in rows:
        i = BY_NUM[num] if num in BY_NUM else S3["To Do"][0]
        wf.rect(mx + 10, y, mw - 20, 34, fill=t["accent_bg"] if sel else t["bg"], r=4)
        wf.icon(mx + 20, y + 8, i["type"], 18)
        wf.text(mx + 50, y + 22, tkey(i), 12.5, bold=True, fill=t["accent"])
        wf.text(mx + 130, y + 22, wf.fit(i["title"], 360, 13), 13)
        wf.chip(mx + mw - 70, y + 6, KEY, 11, h=22, fill=t["accent_bg"], bold=True)
        y += 36
    wf.callout(2, mx + 4, my + 100)
    y += 12
    wf.text(mx + 20, y, "Экраны", 12, fill=t["muted"])
    y += 10
    for label, hint in (("Портфель", "G P"), ("Планирование будущих спринтов", "G B")):
        wf.rect(mx + 10, y, mw - 20, 32, fill=t["bg"], r=4)
        wf.text(mx + 24, y + 21, "→  " + label, 13)
        wf.text(mx + mw - 24, y + 21, hint, 12, "end", fill=t["muted"])
        y += 34
    wf.callout(3, mx + 4, my + 292)
    y += 12
    wf.text(mx + 20, y, "Действия", 12, fill=t["muted"])
    y += 10
    for label, hint in (("＋  Создать задачу", "C"), ("▾  Проекты: показать все", "")):
        wf.rect(mx + 10, y, mw - 20, 32, fill=t["bg"], r=4)
        wf.text(mx + 24, y + 21, label, 13)
        if hint:
            wf.text(mx + mw - 24, y + 21, hint, 12, "end", fill=t["muted"])
        y += 34
    wf.callout(4, mx + 4, my + 380)
    wf.text(mx + 20, my + 482, "↑↓ выбор · Enter открыть · Esc закрыть · поиск по ключу и тексту", 12, fill=t["muted"])
    wf.callout(5, mx + mw - 10, my + 480)
    return wf


def screen_bulk():
    wf = WF(760, "Массовые действия на доске и WIP-лимит")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    nav_pills(wf, 96)
    retro_toolbar(wf, 132, x0=20)
    # панель массовых действий
    wf.rect(20, 176, 860, 44, fill=t["accent_bg"], stroke=t["accent"], r=6)
    wf.text(32, 203, "☑ Выбрано 3 · 9 sp", 13, bold=True)
    x = 196
    for label in ("Статус ▾", "Исполнитель ▾", "Приоритет ▾", "Спринт ▾", "＋ Метка"):
        x += wf.chip(x, 183, label, 12, h=28, fill=t["bg"]) + 8
    wf.button(x + 4, 183, 100, 28, "Применить", True, 12.5)
    wf.button(x + 112, 183, 100, 28, "Снять", size=12.5)
    wf.callout(1, 14, 176)
    cols = ["To Do", "In Progress", "Review", "Done"]
    gap, y0 = 12, 236
    cw = (W - 40 - 3 * gap) / 4
    heads = {"To Do": ("2 · 11 sp", False), "In Progress": ("4 из 3 · 14 sp", True), "Review": ("1 · 3 sp", False), "Done": ("1 · 2 sp", False)}
    for n, c in enumerate(cols):
        x = 20 + n * (cw + gap)
        sub, over = heads[c]
        wf.rect(x, y0, cw, 40, fill=t["status"][c], stroke=t["warn"] if over else t["line"], r=6, sw=2 if over else 1.2)
        wf.text(x + 10, y0 + 17, c, 13, bold=True)
        wf.text(x + 10, y0 + 32, ("⚠ WIP " if over else "") + sub, 11.5, bold=over, fill=t["warn"] if over else t["muted"])
    wf.callout(2, 20 + (cw + gap) + 6, y0 - 4)
    todo = S3["To Do"][:1]
    prog = (S3["In Progress"] + S3["Review"] + S3["Done"] + S3["To Do"][1:])[:3]
    items = {"To Do": [(i, True) for i in todo], "In Progress": [(prog[0], True), (prog[1], True), (prog[2], False)], "Review": [], "Done": []}
    for n, c in enumerate(cols):
        x = 20 + n * (cw + gap)
        wf.rect(x, y0 + 48, cw, 400, fill=t["panel"], stroke=t["line"], r=6, opacity=0.55)
        yy = y0 + 56
        for i, sel in items[c]:
            compact_card(wf, x + 8, yy, cw - 16, 86, i)
            wf.rect(x + cw - 34, yy + 4, 16, 16, fill=t["accent"] if sel else t["bg"], stroke=t["accent"], r=3, sw=1.4)
            if sel:
                wf.text(x + cw - 26, yy + 16, "✓", 11, "middle", True, t["accent_ink"])
            yy += 94
    wf.callout(3, 14, y0 + 62)
    wf.text(20, y0 + 470, "WIP-лимит включается в настройках проекта (по умолчанию выключен). При превышении — предупреждение на колонке", 12, fill=t["muted"])
    wf.text(20, y0 + 488, "и при переносе карточки, перенос не запрещается. Массовое действие меняет каждую задачу и пишет запись в историю каждой.", 12, fill=t["muted"])
    wf.callout(4, 14, y0 + 470)
    return wf


def screen_markdown():
    wf = WF(780, "Markdown в описании и комментариях, чек-листы критериев приёмки")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/issues/{S3['To Do'][0]['number']}", "Бэклог")
    i = S3["To Do"][0]
    wf.text(20, 128, f"{tkey(i)}  {i['title']}", 22, bold=True)
    # критерии приёмки: чек-лист
    wf.text(20, 170, "Критерии приёмки", 15, bold=True)
    wf.chip(190, 154, "2 из 3", 12, h=24, fill=t["status"]["Done"], bold=True)
    for n, (done, text) in enumerate(((True, "Страница заказа открывается по ссылке"), (True, "Видны состав, сумма и статус доставки"), (False, "Адрес доставки можно скопировать"))):
        yy = 190 + n * 28
        wf.rect(24, yy, 18, 18, fill=t["accent"] if done else t["bg"], stroke=t["accent"], r=3, sw=1.5)
        if done:
            wf.text(33, yy + 14, "✓", 12, "middle", True, t["accent_ink"])
        wf.text(52, yy + 14, text, 14, fill=t["muted"] if done else None)
    wf.callout(1, 14, 192)
    wf.text(520, 204, "отметка сохраняется сразу и пишется в историю", 12, fill=t["muted"])
    # описание: результат
    wf.text(20, 300, "Описание", 15, bold=True)
    wf.rect(20, 310, 410, 210, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, 338, "Контекст", 16, bold=True)
    wf.text(34, 362, "Клиент хочет открыть ", 13)
    wf.text(34 + wf.est("Клиент хочет открыть ", 13), 362, "заказ", 13, bold=True)
    wf.text(34 + wf.est("Клиент хочет открыть ", 13) + wf.est("заказ", 13, True), 362, " целиком", 13)
    wf.text(34, 384, "•  состав и стоимость", 13)
    wf.text(34, 404, "•  статус доставки (код: shipped)", 13)
    wf.text(34, 428, "Ссылка на макет: figma.com/…", 13, fill=t["accent"])
    wf.text(34, 452, "> Важно: не показывать закупочную цену", 13, fill=t["muted"])
    wf.text(34, 500, "HTML в тексте не выполняется — показывается как есть", 11.5, fill=t["muted"])
    wf.callout(2, 14, 312)
    # редактор: правка / предпросмотр
    wf.text(450, 300, "Правка описания", 15, bold=True)
    wf.chip(450, 312, "Правка", 12, h=26, fill=t["accent_bg"], bold=True)
    wf.chip(512, 312, "Предпросмотр", 12, h=26)
    wf.rect(450, 346, 430, 174, fill=t["bg"], stroke=t["accent"], r=6, sw=1.6)
    for n, line in enumerate(("## Контекст", "Клиент хочет открыть **заказ** целиком", "- состав и стоимость", "- статус доставки (`shipped`)", "", "> Важно: не показывать закупочную цену", "- [ ] проверить на мобильном")):
        wf.text(462, 370 + n * 20, line, 13, fill=t["muted"] if line.startswith(">") else None)
    wf.callout(3, 444, 348)
    wf.text(450, 540, "Заголовки, **жирный**, *курсив*, `код`, списки, цитаты, ссылки,", 12, fill=t["muted"])
    wf.text(450, 558, "чек-листы «- [ ]» / «- [x]». Работает в описании, критериях и комментариях.", 12, fill=t["muted"])
    wf.callout(4, 444, 540)
    # комментарий
    wf.text(20, 600, "Комментарий", 15, bold=True)
    wf.rect(20, 610, 860, 62, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(32, 636, "Сделал первую часть, см. `OrderPage` и [PR](https://example.com)", 13, fill=t["muted"])
    wf.chip(32, 676, "Правка", 11.5, h=24, fill=t["accent_bg"], bold=True)
    wf.chip(94, 676, "Предпросмотр", 11.5, h=24)
    wf.button(770, 676, 110, 30, "Отправить", True, 13)
    wf.h = 730
    return wf


def screen_templates():
    wf = WF(860, "Настройки проекта: шаблоны задач и WIP-лимиты")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    wf.text(20, 130, "Настройки проекта", 24, bold=True)
    wf.text(20, 176, "Шаблоны задач", 18, bold=True)
    wf.text(190, 176, "тимлид и администратор", 12, fill=t["muted"])
    # список шаблонов
    names = (("Баг", "Bug", True), ("Story", "Story", False), ("Задача", "Task", False))
    for n, (name, typ, sel) in enumerate(names):
        yy = 192 + n * 44
        wf.rect(20, yy, 230, 38, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=6, sw=1.6 if sel else 1.2)
        wf.icon(32, yy + 10, typ, 18)
        wf.text(58, yy + 25, name, 14, bold=sel)
    wf.button(20, 330, 230, 32, "+ Новый шаблон", size=13)
    wf.callout(1, 14, 196)
    # редактор
    wf.field(272, 200, 250, "Название", "Баг")
    wf.field(540, 200, 160, "Тип задачи", "Bug", dropdown=True)
    wf.callout(2, 266, 200)
    wf.text(272, 268, "Описание (Markdown)", 12, fill=t["muted"])
    wf.rect(272, 274, 608, 110, fill=t["bg"], stroke=t["line"], r=6)
    for n, line in enumerate(("## Шаги воспроизведения", "1. …", "## Ожидалось", "## Получилось", "## Окружение  (браузер, версия, роль)")):
        wf.text(284, 298 + n * 18, line, 13, fill=t["muted"])
    wf.callout(3, 266, 274)
    wf.button(272, 396, 120, 32, "Сохранить", True, 13)
    wf.button(402, 396, 120, 32, "Удалить", size=13)
    wf.text(540, 418, "Story: контекст, цель, критерии · Задача: коротко", 12, fill=t["muted"])
    # WIP
    wf.line(20, 450, 880, 450)
    wf.text(20, 484, "WIP-лимиты", 18, bold=True)
    wf.text(150, 484, "тимлид и администратор", 12, fill=t["muted"])
    wf.rect(20, 500, 40, 22, fill=t["bg"], stroke=t["muted"], r=11, sw=1.4)
    wf.p.append(f'<circle cx="31" cy="511" r="8" fill="{t["muted"]}"/>')
    wf.text(70, 516, "Выключены (по умолчанию)", 14, bold=True)
    wf.callout(4, 14, 502)
    for n, (col, val) in enumerate((("To Do", "без лимита"), ("In Progress", "3"), ("Review", "2"), ("Done", "без лимита"))):
        xx = 20 + n * 218
        wf.field(xx, 544, 200, f"Лимит колонки «{col}»", val, placeholder=(val == "без лимита"))
    wf.callout(5, 14, 548)
    wf.text(20, 624, "Лимит — число задач в колонке доски. При превышении колонка помечена предупреждением, при переносе", 12.5, fill=t["muted"])
    wf.text(20, 644, "карточки показывается сообщение, но перенос не запрещается. Пока WIP выключен, поля лимитов неактивны.", 12.5, fill=t["muted"])
    return wf


def screen_create_template():
    wf = WF(700, "Создание задачи с шаблоном")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.overlay()
    mx, my, mw, mh = 130, 108, 640, 560
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 38, "Создать задачу", 20, bold=True)
    f1 = mx + 24
    wf.field(f1, my + 66, 300, "Шаблон", "Баг", dropdown=True)
    wf.callout(1, f1 - 14, my + 66)
    # открытый список
    wf.rect(f1, my + 108, 300, 130, fill=t["bg"], stroke=t["accent"], r=6, sw=1.6)
    for n, (name, sel) in enumerate((("Без шаблона", False), ("Баг", True), ("Story", False), ("Задача", False))):
        wf.rect(f1 + 4, my + 112 + n * 30, 292, 28, fill=t["accent_bg"] if sel else t["bg"], r=4)
        wf.text(f1 + 14, my + 131 + n * 30, name, 13, bold=sel)
    wf.field(f1 + 330, my + 66, 262, "Тип *", "Bug", dropdown=True)
    wf.text(f1 + 330, my + 120, "подставлен шаблоном", 11, fill=t["muted"])
    wf.field(f1, my + 258, mw - 48, "Название *", "Не открывается страница заказа")
    wf.text(f1, my + 330, "Описание", 12, fill=t["muted"])
    wf.rect(f1, my + 336, mw - 48, 150, fill=t["bg"], stroke=t["line"], r=6)
    for n, line in enumerate(("## Шаги воспроизведения", "1. Открыть «Заказы»", "## Ожидалось", "## Получилось", "## Окружение")):
        wf.text(f1 + 12, my + 362 + n * 22, line, 13, fill=t["muted"])
    wf.callout(2, f1 - 14, my + 340)
    wf.button(mx + mw - 330, my + mh - 54, 200, 36, "Создать  (Ctrl+Enter)", True, 13)
    wf.button(mx + mw - 114, my + mh - 54, 90, 36, "Отмена")
    wf.text(mx + 24, my + mh - 30, "Шаблон только подставляет текст: его можно править; смена шаблона просит подтверждение, если текст изменён.", 11.5, fill=t["muted"])
    wf.callout(3, mx + 14, my + mh - 34)
    return wf


def screen_palette():
    wf = WF(560, "Блок «Цветовая гамма» в профиле пользователя")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 128, "Цветовая гамма", 24, bold=True)
    wf.text(20, 152, "Настройка профиля: действует на любом компьютере, где вы входите под своей учёткой.", 13, fill=t["muted"])

    def preview(x, y, title, sub, light, dark, selected):
        # карточка гаммы: светлая и тёмная версии рядом
        wf.rect(x, y, 262, 190, fill=t["bg"], stroke=t["accent"] if selected else t["line"], r=8, sw=2.4 if selected else 1.2)
        wf.text(x + 14, y + 26, title, 15, bold=True)
        wf.text(x + 14, y + 44, sub, 12, fill=t["muted"])
        for k, (name, c) in enumerate((("светлая", light), ("тёмная", dark))):
            bx = x + 12 + k * 124
            wf.rect(bx, y + 58, 114, 96, fill=c["bg"], stroke=t["line"], r=6)
            wf.rect(bx + 8, y + 66, 98, 40, fill=c["panel"], r=4)
            wf.text(bx + 16, y + 90, "Текст", 11, bold=True, fill=c["ink"])
            wf.rect(bx + 56, y + 76, 44, 20, fill=c["accent"], r=4)
            wf.text(bx + 78, y + 90, "Кнопка", 10, "middle", True, c["accent_ink"])
            for j, sw in enumerate(c["extra"]):
                wf.rect(bx + 8 + j * 32, y + 116, 28, 12, fill=sw, r=3)
            wf.text(bx + 8, y + 146, name, 11, fill=c["ink"])
        wf.text(x + 14, y + 178, "Светлая или тёмная — по настройке системы", 10, fill=t["muted"])

    beige_l = dict(bg="#FAF9F5", panel="#FFFFFF", ink="#2B2520", accent="#6A5440", accent_ink="#FFFFFF", extra=("#C5BFAF", "#B7A286", "#ABAFA3"))
    beige_d = dict(bg="#332C26", panel="#3E362E", ink="#F4F2EA", accent="#D2B991", accent_ink="#2A241F", extra=("#C5BFAF", "#B7A286", "#ABAFA3"))
    blue_l = dict(bg="#FFFFFF", panel="#F3F4F6", ink="#1F2937", accent="#1D4ED8", accent_ink="#FFFFFF", extra=("#DBEAFE", "#93C5FD", "#F08C00"))
    blue_d = dict(bg="#111827", panel="#1F2937", ink="#F3F4F6", accent="#93C5FD", accent_ink="#111827", extra=("#1E3A8A", "#7B93FF", "#F08C00"))
    preview(20, 190, "Бежевая (по умолчанию)", "тёплые бежево-коричневые тона", beige_l, beige_d, True)
    wf.callout(2, 12, 206)
    preview(292, 190, "Стандартная", "синяя гамма, как раньше", blue_l, blue_d, False)

    # меню профиля с блоком выбора
    mx, my = 596, 96
    wf.rect(mx, my, 290, 260, fill=t["bg"], stroke=t["line"], r=8, sw=1.6)
    wf.text(mx + 16, my + 26, "Анна Ковалёва", 14, bold=True)
    wf.text(mx + 16, my + 44, "anna@example.com · Администратор", 12, fill=t["muted"])
    wf.line(mx + 10, my + 56, mx + 280, my + 56)
    wf.text(mx + 16, my + 80, "Цветовая гамма", 12, fill=t["muted"])
    wf.callout(1, mx - 10, my + 76)
    for i, (name, sw, on) in enumerate((("Бежевая", ("#6E5A47", "#C5BFAF", "#B7A286"), True), ("Стандартная", ("#1D4ED8", "#93C5FD", "#F08C00"), False))):
        yy = my + 92 + i * 38
        wf.rect(mx + 10, yy, 270, 32, fill=t["accent_bg"] if on else t["bg"], stroke=t["accent"] if on else t["line"], r=6)
        wf.p.append(f'<circle cx="{mx + 28}" cy="{yy + 16}" r="7" fill="{t["bg"]}" stroke="{t["accent"]}" stroke-width="2"/>')
        if on:
            wf.p.append(f'<circle cx="{mx + 28}" cy="{yy + 16}" r="3.5" fill="{t["accent"]}"/>')
        wf.text(mx + 44, yy + 21, name, 14, bold=on)
        for j, c in enumerate(sw):
            wf.p.append(f'<circle cx="{mx + 220 + j * 18}" cy="{yy + 16}" r="6" fill="{c}" stroke="{t["line"]}" stroke-width="0.8"/>')
    wf.text(mx + 16, my + 184, "Применяется сразу, без перезагрузки.", 12, fill=t["muted"])
    wf.callout(3, mx - 10, my + 180)
    wf.line(mx + 10, my + 198, mx + 280, my + 198)
    wf.text(mx + 16, my + 224, "Выйти", 14)
    wf.text(mx + 16, my + 246, "(в демо: «Сбросить данные»)", 11, fill=t["muted"])
    return wf


# ---------------------------------------------------------------- эскиз: доска «прошлое / текущее / будущее»
# Данные примера условные: демо-проект «через два спринта» (Спринты 1 и 2 закрыты, идёт Спринт 3).

NAMES = {"И": "Игорь Смирнов", "М": "Мария Орлова", "А": "Анна Ковалёва", "Д": "Дмитрий Васильев", None: None}
EPICS = {1: "Кабинет", 31: "Заказы"}


def T(n, typ, title, sp, prio, who=None, epic=1, labels=(), status=None):
    return dict(number=n, type=typ, title=title, points=sp, priority=prio, who=NAMES[who], epic=EPICS[epic], labels=list(labels), status=status)


S1 = [
    T(2, "Story", "Регистрация и вход", 5, "Highest", "И", 1, ["авторизация"]),
    T(3, "Story", "Просмотр профиля", 3, "High", "М", 1, ["профиль"]),
    T(6, "Task", "Спроектировать таблицу пользователей", 3, "High", "И", 1, ["бэкенд"]),
    T(7, "Task", "Реализовать обработчик входа", 3, "High", "И", 1, ["бэкенд"]),
    T(12, "Bug", "Сессия не сбрасывается после выхода", 2, "High", "И", 1, ["авторизация"]),
]
S2 = [
    T(4, "Story", "Смена пароля", 5, "High", "И", 1, ["авторизация"]),
    T(9, "Task", "Форма смены пароля", 3, "High", "И", 1, ["фронтенд"]),
    T(8, "Task", "Вёрстка страницы профиля", 2, "Medium", "М", 1, ["фронтенд"]),
    T(10, "Task", "Письмо о смене пароля", 2, "Medium", "М", 1, ["бэкенд"]),
    T(13, "Bug", "Валидация e-mail отвергает адреса с «+»", 1, "Highest", "М", 1, ["авторизация"]),
    T(17, "Story", "Вход по ссылке из письма", 5, "Medium", "М", 1, ["авторизация"]),
]
S3 = {
    "To Do": [T(22, "Story", "Детали заказа", 3, "High", "И", 31, ["заказы"]), T(5, "Story", "История заказов", 8, "Medium", "М", 31, ["заказы"])],
    "In Progress": [T(19, "Task", "Фильтр заказов по дате", 5, "High", "И", 31, ["заказы", "фронтенд"])],
    "Review": [T(20, "Task", "Экспорт заказов в CSV", 3, "Medium", "М", 31, ["заказы"])],
    "Done": [T(21, "Task", "Вёрстка списка заказов", 2, "Medium", "М", 31, ["фронтенд"])],
}
S4 = [
    T(23, "Story", "Уведомление об отправке заказа", 5, "High", "И", 31, ["заказы"]),
    T(24, "Story", "Повтор заказа в один клик", 5, "Medium", "М", 31, ["заказы"]),
    T(25, "Story", "Адреса доставки", 5, "Medium", None, 31, ["заказы"]),
    T(26, "Bug", "Округление суммы заказа", 2, "Highest", "И", 31, ["бэкенд"]),
]
S5 = [T(27, "Story", "Избранные товары", 3, "Medium", None, 31), T(28, "Task", "Сравнение заказов", 2, "Low", None, 31)]
BACKLOG = [
    T(30, "Story", "Двухфакторная аутентификация", 8, "High", None, 1, ["авторизация", "безопасность"]),
    T(11, "Task", "Пагинация списка заказов", 3, "Low", None, 31, ["заказы", "бэкенд"]),
    T(29, "Task", "Ускорить загрузку списка заказов", None, "Medium", None, 31, ["заказы"]),
    T(32, "Story", "Сохранение корзины", 5, "Medium", None, 31, ["заказы"]),
    T(36, "Task", "Журнал входов в систему", 3, "Medium", "А", 1, ["безопасность"]),
    T(37, "Task", "Экспорт данных профиля", 5, "Medium", None, 1, ["профиль"]),
    T(33, "Task", "Тёмная тема для писем", 2, "Low", None, 1, ["фронтенд"]),
    T(34, "Story", "Локализация интерфейса", None, "Low", None, 1),
    T(35, "Story", "Бонусные баллы", 13, "Low", None, 31, ["заказы"]),
]
S3_ALL = [i for c in ("To Do", "In Progress", "Review", "Done") for i in S3[c]]
SUM = lambda L: sum(i["points"] or 0 for i in L)
VEL = {1: SUM(S1), 2: SUM(S2)}  # velocity закрытых спринтов
CAP = round(sum(VEL.values()) / len(VEL), 1)  # среднее по закрытым (их пока два)
CAP_TXT = f"{CAP:g}".replace(".", ",")
PRIO_MARK = {"Highest": "▲▲", "High": "▲", "Medium": "■", "Low": "▼"}


def k(i):
    return f"{KEY}-{i['number']}"


def vtext(wf, x, y, s, size=12, bold=False, fill=None):
    """Текст, повёрнутый на 90° (читается снизу вверх); (x, y) — начало строки."""
    fill = fill or wf.t["ink"]
    b = ' font-weight="bold"' if bold else ""
    wf.p.append(f'<text transform="rotate(-90 {x} {y})" x="{x}" y="{y}" font-size="{size}"{b} fill="{fill}">{esc(s)}</text>')


def prio_mark(wf, x, y, prio, size=11):
    hot = prio in ("Highest", "High")
    wf.text(x, y, PRIO_MARK[prio], size, "middle", hot, wf.t["warn"] if hot else wf.t["muted"])


def compact_row(wf, x, y, w, i, handle=False, avatar=True, h=28, dim=False):
    """Сжатая строка задачи (боковые части, бэклог на доске): тип, ключ, название, приоритет, points, исполнитель."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["bg"], stroke=t["accent"] if dim else t["line"], r=4, dash=dim)
    cx = x + 6
    if handle:
        wf.text(cx, y + h / 2 + 4, "⋮⋮", 11, fill=t["muted"])
        cx += 14
    wf.icon(cx, y + (h - 16) / 2, i["type"], 16)
    wf.text(cx + 21, y + h / 2 + 4, k(i), 11, bold=True, fill=t["accent"])
    right = x + w - 6
    if avatar:
        if i["who"]:
            wf.avatar(right - 9, y + h / 2, i["who"], 9)
        else:
            wf.text(right - 9, y + h / 2 + 4, "—", 11, "middle", fill=t["muted"])
        right -= 22
    if i["points"] is not None:
        wf.points(right - 10, y + h / 2, i["points"])
    else:
        wf.text(right - 10, y + h / 2 + 4, "?", 11, "middle", True, t["warn"])
    right -= 30
    prio_mark(wf, right - 4, y + h / 2 + 4, i["priority"])
    right -= 24
    tx = cx + 21 + 58
    if right - tx > 20:
        wf.text(tx, y + h / 2 + 4, wf.fit(i["title"], right - tx, 11), 11)


def stack_row(wf, x, y, w, i, handle=False, avatar=False, prio=True, dim=False, h=40):
    """Сжатая строка в две линии для узких боковых частей: сверху тип, ключ, приоритет, points, исполнитель;
    снизу название целиком."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["bg"], stroke=t["accent"] if dim else t["line"], r=4, dash=dim)
    cx = x + 6
    if handle:
        wf.text(cx, y + 17, "⋮⋮", 11, fill=t["muted"])
        cx += 14
    wf.icon(cx, y + 5, i["type"], 16)
    wf.text(cx + 21, y + 17, k(i), 11, bold=True, fill=t["accent"])
    right = x + w - 8
    if avatar:
        if i["who"]:
            wf.avatar(right - 8, y + 14, i["who"], 8.5)
        right -= 22
    if i["points"] is not None:
        wf.points(right - 9, y + 14, i["points"])
    else:
        wf.text(right - 9, y + 18, "?", 11, "middle", True, t["warn"])
    right -= 24
    if prio:
        prio_mark(wf, right - 8, y + 18, i["priority"])
    wf.text(x + 8, y + 33, wf.fit(i["title"], w - 16, 11), 11)


def compact_card(wf, x, y, w, h, i):
    """Карточка на доске: те же поля, что в сжатой строке (тип, ключ, название, приоритет, points, исполнитель)."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["card"], stroke=t["muted"], r=6)
    wf.icon(x + 6, y + 6, i["type"], 15)
    wf.text(x + 26, y + 18, k(i), 11, bold=True, fill=t["accent"])
    lines = textwrap.wrap(i["title"], max(int((w - 12) / 6.1), 6))[:2]
    for n, s in enumerate(lines):
        wf.text(x + 6, y + 34 + n * 13, s, 11)
    wf.text(x + 14, y + h - 9, PRIO_MARK[i["priority"]], 11, "middle", i["priority"] in ("Highest", "High"), t["warn"] if i["priority"] in ("Highest", "High") else t["muted"])
    if i["points"] is not None:
        wf.points(x + w - 44, y + h - 14, i["points"])
    if i["who"]:
        wf.avatar(x + w - 16, y + h - 14, i["who"], 10)


def mini_card(wf, x, y, w, h, i):
    """Предельно узкая карточка (центр зажат боковыми частями): ключ, points, исполнитель; название — во всплывающей подсказке."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["card"], stroke=t["muted"], r=5)
    wf.icon(x + 4, y + 5, i["type"], 13)
    wf.text(x + 20, y + 15, f"{i['number']}", 10.5, bold=True, fill=t["accent"])
    if i["points"] is not None:
        wf.points(x + 14, y + h - 12, i["points"])
    if i["who"]:
        wf.avatar(x + w - 14, y + h - 12, i["who"], 9)


def cap_bar(wf, x, y, w, used, cap, h=8):
    """Индикатор заполнения: points в спринте против ёмкости. Состояние — цветом, значком и словами."""
    t = wf.t
    wf.rect(x, y, w, h, fill=t["panel"], stroke=t["line"], r=h / 2, sw=1)
    ratio = used / cap
    if ratio > 1:
        fill, state = "#dc2626", "перегруз"
    elif ratio > 0.9:
        fill, state = "#d97706", "почти полон"
    else:
        fill, state = "#16a34a", "есть запас"
    # шкала до 125 % ёмкости, метка ёмкости — вертикальная черта
    scale = 1.25
    fw = min(ratio, scale) / scale * w
    wf.rect(x, y, fw, h, fill=fill, r=h / 2, sw=0)
    cx = x + w / scale
    wf.line(cx, y - 3, cx, y + h + 3, color=t["ink"], sw=1.6)
    return state, fill


def retro_toolbar(wf, y, x0=20, short=False):
    """Фильтры доски активного спринта (относятся только к центру)."""
    t = wf.t
    x = x0
    x += wf.chip(x, y + 6, "Спринт 3 ▾", 13, h=28) + 8
    x += wf.chip(x, y + 6, "Группировка ▾" if short else "Группировать: Исполнитель ▾", 13, h=28, fill=t["accent_bg"]) + 8
    if not short:
        x += wf.chip(x, y + 6, "Тип ▾", 13, h=28) + 8
        wf.chip(x, y + 6, "Приоритет ▾", 13, h=28)


def nav_pills(wf, y):
    """Три плашки над доской: прошлое и будущее — кнопки-ссылки на отдельные вкладки (↗), текущий спринт — выбранная."""
    t = wf.t
    x = 20
    x += wf.chip(x, y, "Прошлые спринты ↗", 13, h=32, fill=t["bg"], bold=True, ink=t["accent"]) + 8
    x += wf.chip(x, y, "Текущий спринт · Спринт 3 · 09.11 – 20.11", 13, h=32, fill=t["accent_bg"], bold=True) + 8
    wf.chip(x, y, "Планирование будущих спринтов ↗", 13, h=32, fill=t["bg"], bold=True, ink=t["accent"])


def past_tab(wf, x, y0, h, n, sprint, dates, tasks, w=52):
    """Сжатая колонка закрытого спринта: название, даты, число задач и points, velocity — вертикально."""
    t = wf.t
    wf.rect(x, y0, w, h, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(x + w / 2, y0 + 20, "▸", 14, "middle", fill=t["muted"])
    bottom = y0 + h - 12
    vtext(wf, x + 17, bottom, f"Выполнено в спринте {n}", 12, True)
    vtext(wf, x + 31, bottom, dates, 11, False, t["muted"])
    vtext(wf, x + 45, bottom, f"{len(tasks)} задач · {SUM(tasks)} sp · V {VEL[n]}", 11, False, t["muted"])


def side_group(wf, x, y, w, title, sub, state_chip=None, used=None, cap=None):
    """Заголовок группы в правой панели: название, состояние, заполнение спринта."""
    t = wf.t
    wf.rect(x, y, w, 40 if used is not None else 26, fill=t["panel"], stroke=t["line"], r=5)
    wf.text(x + 8, y + 17, title, 12, bold=True)
    if state_chip:
        wf.chip(x + 8 + wf.est(title, 12, True) + 6, y + 4, state_chip, 10, h=16)
    wf.text(x + w - 8, y + 17, sub, 11, "end", fill=t["muted"])
    if used is not None:
        cap_bar(wf, x + 8, y + 28, w - 16, used, cap, h=6)
    return 44 if used is not None else 30


def screen_retro_board(theme=LIGHT):
    wf = WF(560, "Доска: кнопки-ссылки на прошлое и будущее", theme)
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    nav_pills(wf, 96)
    wf.callout(1, 14, 96)
    wf.callout(2, 178, 96)
    wf.callout(3, 524, 96)
    retro_toolbar(wf, 136, x0=20)
    wf.callout(4, 14, 138)
    cols = ["To Do", "In Progress", "Review", "Done"]
    gap, cx0 = 12, 20
    cw = (W - 40 - 3 * gap) / 4
    y0 = 184
    for n, c in enumerate(cols):
        x = cx0 + n * (cw + gap)
        items = S3[c]
        wf.rect(x, y0, cw, 40, fill=t["status"][c], stroke=t["line"], r=6)
        wf.text(x + 10, y0 + 17, c, 13, bold=True)
        wf.text(x + 10, y0 + 32, f"{len(items)} · {SUM(items)} sp", 11, fill=t["muted"])
    y = y0 + 46
    for who in ("Игорь Смирнов", "Мария Орлова"):
        mine = [i for c in cols for i in S3[c] if i["who"] == who]
        wf.rect(cx0, y, W - 40, 26, fill=t["panel"], stroke=t["line"], r=5)
        wf.text(cx0 + 8, y + 17, "▾", 11)
        wf.avatar(cx0 + 30, y + 13, who, 9)
        wf.text(cx0 + 46, y + 18, who, 12.5, bold=True)
        wf.text(W - 28, y + 18, f"{plural(len(mine), 'задача', 'задачи', 'задач')} · {SUM(mine)} sp", 11.5, "end", fill=t["muted"])
        y += 30
        for n, c in enumerate(cols):
            x = cx0 + n * (cw + gap)
            wf.rect(x, y, cw, 100, fill=t["panel"], stroke=t["line"], r=6, opacity=0.55)
            for i in [i for i in S3[c] if i["who"] == who][:1]:
                compact_card(wf, x + 8, y + 8, cw - 16, 84, i)
        y += 106
    wf.text(20, y + 20, "Доска остаётся доской активного спринта, как сейчас: колонки статусов, группировка, фильтры. ↗ — открывается отдельная вкладка.", 12, fill=t["muted"])
    wf.text(20, y + 38, "Макет, не готовый экран.", 12, fill=t["muted"])
    return wf


STATUS_OF = {22: "To Do", 5: "To Do", 19: "In Progress", 20: "Review", 21: "Done"}


def detail_row(wf, y, i, x0=20, w=860, h=36, status=False, hot=False):
    """Подробная строка бэклога: тип, ключ, название, эпик, метки, приоритет, points, исполнитель.
    Points, приоритет и исполнитель правятся прямо в строке (поля со стрелкой ▾)."""
    t = wf.t
    wf.rect(x0, y, w, h, fill=t["bg"], stroke=t["accent"] if hot else t["line"], r=4)
    wf.text(x0 + 8, y + 23, "⋮⋮", 13, fill=t["muted"])
    ix = x0 + 30
    if status:
        wf.p.append(f'<circle cx="{ix + 4}" cy="{y + 18}" r="4.5" fill="{t["status"][STATUS_OF[i["number"]]]}" stroke="{t["muted"]}" stroke-width="1"/>')
        ix += 14
    wf.icon(ix, y + 9, i["type"], 18)
    wf.text(ix + 25, y + 23, k(i), 12, bold=True, fill=t["accent"])
    wf.text(x0 + 126, y + 23, wf.fit(i["title"], 190, 13), 13)
    wf.chip(x0 + 326, y + 7, wf.fit(i["epic"], 60, 11), 11, h=22)
    lx = x0 + 400
    shown = 0
    for lab in i["labels"][:2]:
        cw = wf.est(lab, 10.5) + 18
        if lx + cw > x0 + 520:
            break
        lx += wf.chip(lx, y + 8, lab, 10.5, h=20, fill=t["bg"]) + 4
        shown += 1
    if len(i["labels"]) > shown:
        wf.text(lx + 2, y + 23, f"+{len(i['labels']) - shown}", 11, fill=t["muted"])
    # приоритет — поле с выпадающим списком
    mark = PRIO_MARK[i["priority"]]
    hotp = i["priority"] in ("Highest", "High")
    wf.chip(x0 + 528, y + 7, f"{mark} {i['priority']} ▾", 11.5, h=22, stroke=True, bold=hotp, ink=t["warn"] if hotp else None, fill=t["bg"])
    # points — поле ввода
    if i["points"] is None:
        wf.rect(x0 + 640, y + 6, 54, 24, fill=t["bg"], stroke=t["warn"], r=12, dash=True, sw=1.4)
        wf.text(x0 + 667, y + 23, "—", 13, "middle", fill=t["warn"])
    else:
        wf.rect(x0 + 640, y + 6, 54, 24, fill=t["bg"], stroke=t["muted"], r=12, sw=1.4)
        wf.text(x0 + 662, y + 23, i["points"], 13, "middle", True)
        wf.text(x0 + 682, y + 22, "✎", 10, "middle", fill=t["muted"])
    # исполнитель — поле с выпадающим списком
    wf.rect(x0 + 706, y + 6, 146, 24, fill=t["bg"], stroke=t["line"] if i["who"] else t["muted"], r=6, dash=not i["who"])
    if i["who"]:
        wf.avatar(x0 + 722, y + 18, i["who"], 9)
        a, b = i["who"].split()
        wf.text(x0 + 738, y + 23, f"{a} {b[0]}.", 12)
    else:
        wf.text(x0 + 718, y + 23, "Не назначен", 12, fill=t["muted"])
    wf.text(x0 + 842, y + 23, "▾", 11, "middle", fill=t["muted"])


def sprint_block(wf, y, title, state, state_fill, dates, goal, tasks, cap, note, callout=None, open_=True):
    """Заголовок спринта в бэклоге: состояние, даты, цель, индикатор заполнения (points против ёмкости)."""
    t = wf.t
    used = SUM(tasks)
    h = 64 if goal else 52
    wf.rect(20, y, 860, h, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, y + 22, ("▾ " if open_ else "▸ ") + title, 15, bold=True)
    cw = wf.chip(34 + wf.est(("▾ " if open_ else "▸ ") + title, 15, True) + 10, y + 7, state, 11.5, fill=state_fill, h=22)
    wf.text(34 + wf.est(("▾ " if open_ else "▸ ") + title, 15, True) + 20 + cw, y + 22, dates, 12.5, fill=t["muted"])
    if goal:
        wf.text(34, y + 42, "Цель: " + goal, 12, fill=t["muted"])
    # индикатор заполнения: шкала до 125 % ёмкости, чёрта — ёмкость
    bx, by, bw = 540, y + 14, 200
    verdict, color = cap_bar(wf, bx, by, bw, used, cap)
    pct = round(used / cap * 100)
    wf.text(bx + bw + 12, y + 20, f"{used} / {CAP_TXT} sp · {pct} %", 12.5, bold=True)
    over = used - cap
    if used > cap:
        wf.text(bx, y + 40, f"⚠ Перегруз на {over:g} sp: убрать задачи или перенести".replace(".", ","), 12, bold=True, fill="#dc2626")
    elif used / cap > 0.9:
        wf.text(bx, y + 40, "● Почти полон: запас меньше 10 %", 12, bold=True, fill="#b45309")
    else:
        wf.text(bx, y + 40, f"✓ Есть запас: {cap - used:g} sp".replace(".", ","), 12, bold=True, fill="#15803d")
    if note:
        wf.text(bx, y + 56 if goal else y + 50, note, 10.5, fill=t["muted"])
    if callout:
        wf.callout(callout, 14, y)
    return h


def screen_backlog_new():
    wf = WF(1160, "Вкладка «Планирование будущих спринтов»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 126, "Планирование будущих спринтов", 24, bold=True)
    wf.button(W - 200, 106, 180, 32, "+ Создать задачу", True)
    # фильтры
    wf.rect(20, 148, 210, 30, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(30, 168, "Номер или название", 12.5, fill=t["muted"])
    x = 242
    for name in ("Эпик ▾", "Исполнитель ▾", "Метка ▾", "Тип ▾"):
        x += wf.chip(x, 151, name, 12.5, h=26) + 6
    wf.text(x + 6, 169, "☐ Без оценки", 12.5)
    wf.text(x + 108, 169, "☐ Без исполнителя", 12.5)
    wf.text(W - 20, 169, "28 задач", 12.5, "end", fill=t["muted"])
    wf.callout(1, 14, 148)
    # заголовки колонок
    wf.rect(20, 186, 860, 30, fill=t["accent_bg"], stroke=t["accent"], r=6)
    wf.text(32, 206, "☑ Выбрано 2 задачи · 8 sp", 12.5, bold=True)
    wf.chip(230, 190, "Перенести в спринт ▾", 12, h=22, fill=t["bg"])
    wf.text(400, 206, "Одна или несколько задач сразу — в Спринт 4, Спринт 5 или в общий бэклог.", 12, fill=t["muted"])
    wf.callout(8, 14, 186)
    y = 224
    for label, dx in (("Задача", 30), ("Название", 126), ("Эпик", 326), ("Метки", 400), ("Приоритет", 528), ("Points", 640), ("Исполнитель", 706)):
        wf.text(20 + dx, y + 12, label, 11, fill=t["muted"])
    wf.line(20, y + 18, 880, y + 18)
    y += 26

    # --- активный спринт (сверху)
    h = sprint_block(wf, y, "Спринт 3", "идёт", t["status"]["In Progress"], "09.11 – 20.11", "заказы: просмотр, фильтр, экспорт",
                     S3_ALL, CAP, f"Ёмкость {CAP_TXT} sp = среднее velocity (16 и 18)", callout=2)
    y += h + 4
    for i in S3_ALL:
        detail_row(wf, y, i, status=True, hot=(i["number"] == 19))
        y += 38
    wf.callout(3, 20, y - 38 * 3 + 10)
    y += 6

    # --- планируемые спринты
    h = sprint_block(wf, y, "Спринт 4", "запланирован", t["panel"], "23.11 – 04.12", None, S4, CAP, None, callout=4)
    y += h + 4
    row25 = 0
    for n, i in enumerate(S4):
        if i["number"] == 25:
            row25 = y
        detail_row(wf, y, i, hot=(i["number"] == 25))
        y += 38
        if n == 1:  # вставка перетаскиваемой задачи: линия-указатель между строками
            wf.rect(20, y - 3, 860, 4, fill=t["accent"], r=2, sw=0)
            wf.p.append(f'<circle cx="20" cy="{y - 1}" r="5" fill="{t["accent"]}"/>')
            wf.text(W - 40, y + 8, "↓ отпустите здесь: DEMO-11 встанет третьей", 11, "end", fill=t["accent"])
            y += 12
    y += 4
    h = sprint_block(wf, y, "Спринт 5", "запланирован", t["panel"], "07.12 – 18.12", None, S5, CAP, None, open_=False)
    y += h + 10

    # --- общий бэклог
    wf.rect(20, y, 860, 40, fill=t["panel"], stroke=t["line"], r=6)
    wf.text(34, y + 25, "▾ Общий бэклог", 15, bold=True)
    wf.text(190, y + 25, f"{len(BACKLOG)} задач · {SUM(BACKLOG)} sp · без оценки: 2", 12.5, fill=t["muted"])
    wf.callout(5, 14, y)
    y += 44
    for i in BACKLOG[:5]:
        detail_row(wf, y, i)
        y += 38
    wf.text(450, y + 14, "ещё 4 ▾", 12.5, "middle", fill=t["accent"])
    y += 34

    # --- ссылка на историю (внизу)
    wf.text(20, y + 18, "Выполненные спринты ↗", 14, bold=True, fill=t["accent"])
    wf.text(220, y + 18, "открывается отдельная вкладка «Прошлые спринты»", 12, fill=t["muted"])
    wf.callout(6, 14, y)
    y += 40

    # --- быстрое редактирование: открытый список исполнителей у задачи без исполнителя (DEMO-25)
    px, py = 20 + 706, row25 + 32
    people = ["Игорь Смирнов", "Мария Орлова", "Анна Ковалёва"]
    wf.rect(px + 3, py + 4, 146, 3 * 26 + 34, fill="#000000", r=6, opacity=0.15)
    wf.rect(px, py, 146, 3 * 26 + 30, fill=t["bg"], stroke=t["accent"], r=6, sw=1.6)
    wf.text(px + 10, py + 19, "Не назначен", 12, fill=t["muted"])
    for n, name in enumerate(people):
        yy = py + 26 + n * 26
        if n == 1:
            wf.rect(px + 3, yy - 3, 140, 24, fill=t["accent_bg"], r=4, sw=0)
        wf.avatar(px + 18, yy + 9, name, 9)
        wf.text(px + 34, yy + 14, name, 12, bold=(n == 1))
    wf.callout(7, px - 8, py - 2)
    return wf


def seg(wf, x, y, w, h, title, sub, fill, stroke=None, dash=False, bold=True, tsize=11.5):
    t = wf.t
    wf.rect(x, y, w, h, fill=fill, stroke=stroke or t["line"], r=4, dash=dash, sw=1.3)
    if w > 40:
        wf.text(x + w / 2, y + h / 2 - 1, wf.fit(title, w - 6, tsize, bold), tsize, "middle", bold)
        if sub:
            wf.text(x + w / 2, y + h / 2 + 13, wf.fit(sub, w - 6, 10), 10, "middle", fill=t["muted"])


def screen_retro_responsive():
    """Схема ширин на ноутбуке 1366 px: что сколько занимает и что сворачивается при нехватке места."""
    wf = WF(480, "Поведение экранов на ноутбуке 1366 px")
    t = wf.t
    sc = 860 / 1366
    pad = 16 * sc

    def row(y, title, parts, total=1366, note=None, bad=False):
        wf.text(20, y + 14, title, 13, bold=True, fill="#dc2626" if bad else None)
        if note:
            wf.text(W - 20, y + 14, note, 11.5, "end", fill=t["muted"])
        w = total * sc
        wf.rect(20, y + 22, w, 62, fill=t["panel"], stroke="#dc2626" if bad else t["muted"], r=6, dash=bad, sw=1.6)
        x = 20 + pad
        for px, ttl, sub, fill, dash in parts:
            ww = px * sc
            seg(wf, x, y + 30, ww, 46, ttl, sub, fill, dash=dash)
            x += ww + 6 * sc * 2

    bgp, bgc, bgf, bgo = t["panel"], t["accent_bg"], t["status"]["Done"], t["bg"]
    y = 98
    wf.text(20, y + 8, "Ширина окна 1366 px. Поля по 16 px; цифры — ширина в пикселях.", 12.5, fill=t["muted"])
    y += 22
    row(y, "А. Доска — три плашки сверху, доска на всю ширину", [
        (1334, "Доска активного спринта", "1334: 4 колонки ≈ 320 — шире, чем раньше", bgc, False)], note="прошлое и будущее открываются отдельными вкладками")
    wf.callout(1, 14, y + 22)
    y += 106

    # --- вкладка «Бэклог»
    wf.text(20, y + 14, "Б. Вкладка «Планирование» — 1366 px: все поля подробной строки помещаются", 13, bold=True)
    wf.rect(20, y + 22, 1366 * sc, 62, fill=t["panel"], stroke=t["muted"], r=6, sw=1.6)
    cols = [("⋮⋮", 24, bgo), ("Тип · ключ", 96, bgo), ("Название", 330, bgc), ("Эпик", 120, bgo), ("Метки", 150, bgo), ("Приоритет", 112, bgo), ("Points", 76, bgo), ("Исполнитель", 150, bgo)]
    x = 20 + pad
    for name, px, fill in cols:
        ww = px * sc
        seg(wf, x, y + 30, ww, 46, name, f"{px}", fill, tsize=10.5)
        x += ww + 12 * sc
    wf.callout(2, 14, y + 22)
    y += 96
    wf.text(20, y + 14, "В. Вкладка «Планирование» — окно 1100 px: метки в «+N», эпик короче", 13, bold=True)
    wf.rect(20, y + 22, 1100 * sc, 62, fill=t["panel"], stroke=t["muted"], r=6, sw=1.6)
    cols = [("⋮⋮", 24, bgo), ("Тип · ключ", 96, bgo), ("Название", 360, bgc), ("Эпик", 80, bgo), ("+N", 40, bgo), ("Приор.", 100, bgo), ("Pts", 60, bgo), ("Исполн.", 130, bgo)]
    x = 20 + pad
    for name, px, fill in cols:
        ww = px * sc
        seg(wf, x, y + 30, ww, 46, name, f"{px}", fill, tsize=10)
        x += ww + 12 * sc
    wf.callout(3, 14, y + 22)
    return wf


def screen_issue_views():
    """Единый стиль задачи: карточка доски, строки боковых частей и подробная строка бэклога — одни и те же поля."""
    wf = WF(390, "Единый вид задачи: карточка, сжатая строка, подробная строка")
    t = wf.t
    i = S3["In Progress"][0]
    wf.text(20, 28, "Одна и та же задача DEMO-19 в трёх видах. Сжатый вид содержит: тип · ключ · название · points · приоритет · исполнитель.", 12.5, fill=t["muted"])
    wf.text(20, 58, "1. Карточка на доске", 13, bold=True)
    compact_card(wf, 20, 68, 210, 92, i)
    wf.callout(1, 14, 66)
    wf.text(250, 58, "2. Строка во вкладке «Прошлые спринты»", 13, bold=True)
    stack_row(wf, 250, 68, 290, i, avatar=True)
    wf.text(250, 126, "ключ · название · приоритет · points · исполнитель", 11.5, fill=t["muted"])
    wf.callout(2, 244, 66)
    wf.text(20, 196, "3. Подробная строка во вкладке «Планирование»: все поля, points, приоритет и исполнитель правятся прямо в строке", 13, bold=True)
    detail_row(wf, 208, i, status=True)
    wf.callout(3, 14, 206)
    labels = [(20, "ручка"), (66, "тип"), (84, "ключ"), (146, "название"), (346, "эпик"), (420, "метки"), (548, "приоритет ▾"), (660, "points ✎"), (726, "исполнитель ▾")]
    for x, label in labels:
        wf.text(x, 262, label, 10.5, fill=t["muted"])
    wf.rect(20, 280, 860, 94, fill=t["panel"], stroke=t["line"], r=6)
    rows = [
        ("Правило единства", "Порядок и значки одинаковы: тип, ключ синим, название, приоритет, points в кружке, аватар."),
        ("Что добавляет подробный вид", "Эпик, метки, точка статуса и поля правки. Всё это нужно при планировании и не нужно для беглого взгляда."),
    ]
    for n, (a, b) in enumerate(rows):
        wf.text(34, 304 + n * 36, a, 12.5, bold=True)
        wf.text(34, 320 + n * 36, wf.fit(b, 830, 12), 12, fill=t["muted"])
    return wf


def screen_history():
    wf = WF(700, "Вкладка «Прошлые спринты» — вся история")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/history", "Спринты")
    wf.text(20, 126, "Прошлые спринты", 24, bold=True)
    wf.text(250, 126, "История закрытых спринтов: только чтение.", 13, fill=t["muted"])
    wf.rect(20, 148, 210, 30, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(30, 168, "Номер или название", 12.5, fill=t["muted"])
    x = 242
    for name in ("Эпик ▾", "Исполнитель ▾", "Тип ▾"):
        x += wf.chip(x, 151, name, 12.5, h=26) + 6
    wf.text(W - 20, 169, "2 спринта · 11 задач · 34 sp", 12.5, "end", fill=t["muted"])
    wf.callout(1, 14, 148)
    y = 192
    for n, tasks, dates, closed, open_ in ((2, S2, "26.10 – 06.11", "06.11", True), (1, S1, "12.10 – 23.10", "23.10", False)):
        h = 56
        wf.rect(20, y, 860, h, fill=t["panel"], stroke=t["line"], r=6)
        label = ("▾ " if open_ else "▸ ") + f"Спринт {n}"
        wf.text(34, y + 24, label, 15, bold=True)
        wf.chip(34 + wf.est(label, 15, True) + 10, y + 9, "закрыт", 11.5, h=22)
        wf.text(34 + wf.est(label, 15, True) + 90, y + 25, dates, 12.5, fill=t["muted"])
        wf.text(34, y + 44, f"{len(tasks)} задач · {SUM(tasks)} sp · velocity {VEL[n]} sp · закрыт {closed}", 12, fill=t["muted"])
        wf.text(W - 34, y + 24, "Открыть отчёт спринта ↗", 12, "end", fill=t["accent"])
        y += h + 4
        if open_:
            for i in tasks:
                compact_row(wf, 20, y, 860, i, h=30)
                y += 32
            wf.text(20, y + 14, "Только чтение: перетаскивать и править нельзя. Клик по ключу — карточка задачи.", 11.5, fill=t["muted"])
            y += 26
    wf.callout(2, 14, 192)
    wf.callout(3, 14, 192 + 62)
    wf.text(450, y + 20, "ещё спринты загружаются порциями по 5 ▾", 12.5, "middle", fill=t["accent"])
    wf.callout(4, 14, y + 6)
    return wf


def screen_search():
    wf = WF(600, "Поиск и подсказка клавиш")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    wf.overlay()
    mx, my, mw = 40, 120, 440
    wf.rect(mx, my, mw, 330, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.rect(mx + 16, my + 16, mw - 32, 40, fill=t["bg"], stroke=t["accent"], r=6, sw=1.8)
    wf.text(mx + 28, my + 42, "DEMO-1", 16)
    wf.callout(1, mx + 12, my + 16)
    res = [i for i in SEED["issues"] if tkey(i).startswith("DEMO-1")][:6]
    y = my + 70
    wf.text(mx + 20, y, "Задачи", 12, fill=t["muted"])
    y += 8
    for k, i in enumerate(res):
        sel = k == 1
        wf.rect(mx + 12, y, mw - 24, 34, fill=t["accent_bg"] if sel else t["bg"], r=4)
        wf.icon(mx + 22, y + 8, i["type"], 18)
        wf.text(mx + 50, y + 22, tkey(i), 12, bold=True, fill=t["accent"])
        wf.text(mx + 120, y + 22, wf.fit(i["title"], 300, 13), 13)
        y += 36
    wf.callout(2, mx + 6, my + 106)
    wf.text(mx + 20, my + 318, "↑↓ выбор · Enter открыть · Esc закрыть", 12, fill=t["muted"])
    kx, kw = 510, 350
    wf.rect(kx, my, kw, 440, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(kx + 20, my + 34, "Горячие клавиши", 17, bold=True)
    wf.callout(3, kx + 8, my + 18)
    keys = [("C", "создать задачу"), ("/", "поиск"), ("?", "эта подсказка"), ("G, B", "бэклог"), ("G, D", "доска"),
            ("G, S", "спринты"), ("G, R", "отчёты"), ("S, 1–5", "статус выделенной задачи"),
            ("Ctrl+Enter", "сохранить / отправить"), ("Esc", "закрыть окно")]
    y = my + 60
    for k, d in keys:
        wf.rect(kx + 20, y, 100, 26, fill=t["panel"], stroke=t["line"], r=4)
        wf.text(kx + 70, y + 18, k, 13, "middle", True)
        wf.text(kx + 136, y + 18, d, 14)
        y += 34
    wf.text(kx + 20, y + 14, "Клавиши не работают в полях ввода.", 12, fill=t["muted"])
    return wf


PEOPLE5 = ("Анна Ковалёва", "Игорь Смирнов", "Мария Орлова", "Дмитрий Васильев")


def screen_availability():
    wf = WF(780, "Доступность людей и ёмкость спринта")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 130, "Планирование будущих спринтов", 22, bold=True)
    # заголовок спринта + индикатор
    wf.rect(20, 150, 860, 150, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(34, 178, "▾ Спринт 3", 15, bold=True)
    wf.chip(130, 163, "запланирован", 12)
    wf.text(250, 179, "09.11 – 20.11", 13, fill=t["muted"])
    wf.rect(34, 192, 520, 14, fill=t["bg"], stroke=t["line"], r=7)
    wf.rect(34, 192, 380, 14, fill=t["status"]["In Progress"], stroke=t["accent"], r=7)
    wf.text(566, 204, "12 / 13 sp · 92 %", 13, bold=True)
    wf.text(34, 232, "✓ Почти полон: 1 sp в запасе", 13, fill=t["muted"])
    wf.text(34, 254, "Ёмкость 13 sp = velocity 16 sp × доступность 82 % (41 из 50 человеко-дней)", 13, fill=t["muted"])
    wf.text(34, 280, "Отсутствуют: Анна К. 12–20.11 (отпуск) · Игорь С. 16.11 (больничный)", 13, fill=t["muted"])
    wf.callout(1, 14, 192)
    wf.callout(2, 14, 254)
    wf.callout(3, 14, 280)
    # блок «Отсутствия» на экране «Люди»
    wf.line(20, 322, 880, 322)
    wf.text(20, 352, "Люди → «Отсутствия»", 18, bold=True)
    wf.text(230, 352, "правят тимлид и администратор", 12, fill=t["muted"])
    hdr = (("Человек", 20), ("С", 250), ("По", 350), ("Вид", 450), ("Рабочих дней", 560))
    for label, x in hdr:
        wf.text(x, 388, label, 12, fill=t["muted"])
    rows = (("Анна Ковалёва", "12.11.2026", "20.11.2026", "Отпуск", "7"), ("Игорь Смирнов", "16.11.2026", "16.11.2026", "Больничный", "1"))
    for n, (a, b, c, d, e) in enumerate(rows):
        y = 400 + n * 40
        wf.rect(20, y, 860, 34, fill=t["panel"], stroke=t["line"], r=6)
        for val, x in zip((a, b, c, d, e), (30, 250, 350, 450, 560)):
            wf.text(x, y + 22, val, 13)
        wf.button(740, y + 4, 60, 26, "Изм.", size=12)
        wf.button(806, y + 4, 66, 26, "Удалить", size=12)
    wf.callout(4, 14, 400)
    wf.field(20, 500, 220, "Человек", "Мария Орлова", dropdown=True)
    wf.field(256, 500, 130, "С", "23.11.2026")
    wf.field(398, 500, 130, "По", "27.11.2026")
    wf.field(540, 500, 150, "Вид", "Отпуск", dropdown=True)
    wf.button(706, 506, 174, 34, "+ Добавить отсутствие", True, 13)
    wf.callout(5, 14, 506)
    wf.text(20, 584, "Рабочие дни — понедельник–пятница без праздников; пересекающиеся отсутствия одного человека не считаются дважды.", 12.5, fill=t["muted"])
    wf.text(20, 606, "Команда — участники проекта и владелец. Без отсутствий доступность 100 %, индикатор остаётся как в ADR-014.", 12.5, fill=t["muted"])
    return wf


def screen_dod():
    wf = WF(760, "Definition of Done: настройка и подтверждение при переносе в Done")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    wf.text(20, 130, "Настройки проекта", 24, bold=True)
    wf.text(20, 170, "Definition of Done", 18, bold=True)
    wf.text(220, 170, "тимлид и администратор", 12, fill=t["muted"])
    wf.rect(20, 184, 470, 130, fill=t["bg"], stroke=t["line"], r=6)
    for n, line in enumerate(("- [ ] Код проверен другим разработчиком", "- [ ] Тесты написаны и проходят", "- [ ] Документация обновлена", "- [ ] Проверено на тестовом стенде")):
        wf.text(34, 212 + n * 24, line, 13, fill=t["muted"])
    wf.callout(1, 14, 184)
    wf.text(510, 204, "Пункты — строки «- [ ] …» (Markdown).", 12.5, fill=t["muted"])
    wf.text(510, 224, "Пустой список — подтверждения нет.", 12.5, fill=t["muted"])
    wf.button(20, 328, 120, 32, "Сохранить", True, 13)
    # диалог
    wf.overlay()
    mx, my, mw, mh = 190, 300, 520, 330
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 38, "Перевести в Done?", 20, bold=True)
    wf.text(mx + 24, my + 62, "DEMO-5 История заказов", 13, fill=t["muted"])
    for n, (line, on) in enumerate((("Код проверен другим разработчиком", True), ("Тесты написаны и проходят", True), ("Документация обновлена", False), ("Проверено на тестовом стенде", False))):
        yy = my + 100 + n * 34
        wf.rect(mx + 24, yy - 14, 18, 18, fill=t["accent"] if on else t["bg"], stroke=t["accent"], r=4)
        if on:
            wf.text(mx + 33, yy, "✓", 13, "middle", True, t["accent_ink"])
        wf.text(mx + 54, yy, line, 14)
    wf.callout(2, mx + 6, my + 86)
    wf.text(mx + 24, my + 252, "Отмечено 2 из 4: «Подтвердить» станет доступна, когда отмечены все пункты.", 12.5, fill=t["muted"])
    wf.button(mx + 24, my + 274, 150, 34, "Подтвердить", False, 13)
    wf.button(mx + 190, my + 274, 110, 34, "Отмена", size=13)
    wf.callout(3, mx + 6, my + 274)
    return wf


def screen_retro():
    wf = WF(780, "Ретроспектива спринта")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/sprints", "Спринты")
    wf.text(20, 130, "Спринт 2 · ретроспектива", 22, bold=True)
    wf.chip(330, 112, "закрыт 06.11", 12)
    wf.button(660, 112, 220, 32, "Отчёт спринта →", size=13)
    cols = (("Что хорошо", ("Быстро закрыли блокирующий баг", "Демо прошло без замечаний"), "+ Добавить"), ("Что улучшить", ("Поздно нашли расхождения в API", "Мало времени на ревью"), "+ Добавить"), ("Действия", ("Договориться об окне ревью (Мария)", "Описать контракт API до старта"), "+ Добавить"))
    gap = 14
    cw = (W - 40 - 2 * gap) / 3
    for n, (title, items, add) in enumerate(cols):
        x = 20 + n * (cw + gap)
        wf.rect(x, 164, cw, 400, fill=t["panel"], stroke=t["line"], r=8)
        wf.text(x + 14, 192, title, 15, bold=True)
        for k, item in enumerate(items):
            yy = 208 + k * 78
            wf.rect(x + 10, yy, cw - 20, 66, fill=t["bg"], stroke=t["line"], r=6)
            wf.text(x + 20, yy + 24, wf.fit(item, cw - 40, 13), 13)
            wf.text(x + 20, yy + 48, PEOPLE5[k], 11.5, fill=t["muted"])
            if n == 2:
                wf.button(x + cw - 150, yy + 36, 134, 24, "→ в задачу" if k == 0 else "DEMO-18", size=11.5)
        wf.button(x + 10, 380, cw - 20, 30, add, size=13)
    wf.callout(1, 14, 164)
    wf.callout(2, 20 + 2 * (cw + gap) + 6, 164)
    wf.callout(3, 20 + 2 * (cw + gap) + cw - 162, 258)
    wf.text(34, 590, "Записи может добавлять любой, у кого есть доступ; удаляет автор, тимлид и администратор. Закрытый спринт тоже можно дополнять.", 12.5, fill=t["muted"])
    wf.text(34, 610, "«→ в задачу» создаёт задачу в бэклоге (тип Task, название — текст действия) и ставит ссылку DEMO-18 на самой записи.", 12.5, fill=t["muted"])
    wf.text(34, 630, "Во вкладке «Прошлые спринты» у раскрытого спринта те же три списка — только чтение, со ссылками на задачи.", 12.5, fill=t["muted"])
    wf.callout(4, 20, 606)
    return wf


def screen_sprint_report():
    wf = WF(860, "Отчёт спринта: Excel и печать")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/sprints/s1/report", "Спринты")
    wf.text(20, 130, "Отчёт: Спринт 2", 22, bold=True)
    wf.text(20, 154, "26.10 – 06.11 · закрыт 06.11", 13, fill=t["muted"])
    wf.button(540, 112, 150, 32, "Скачать Excel", size=13)
    wf.button(702, 112, 178, 32, "Печать / PDF", True, 13)
    wf.callout(1, 530, 112)
    wf.rect(20, 172, 860, 52, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(34, 194, "Цель", 12, fill=t["muted"])
    wf.text(34, 214, "Смена пароля и начало истории заказов", 14, bold=True)
    wf.callout(2, 14, 172)
    for n, (a, b) in enumerate((("Выполнено", "18 sp · 6 задач"), ("Перенесено", "3 sp · 1 задача"), ("Velocity", "18 sp"), ("Ёмкость", "16 sp · доступность 90 %"))):
        x = 20 + n * 218
        wf.rect(x, 240, 204, 62, fill=t["panel"], stroke=t["line"], r=8)
        wf.text(x + 12, 262, a, 12, fill=t["muted"])
        wf.text(x + 12, 288, b, 14, bold=True)
    wf.callout(3, 14, 240)
    wf.rect(20, 320, 420, 200, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(34, 346, "Burndown", 14, bold=True)
    wf.poly([(50, 380), (130, 400), (210, 430), (290, 450), (370, 482), (420, 500)], t["accent"])
    wf.poly([(50, 380), (420, 500)], t["muted"], dash=True)
    wf.callout(4, 14, 320)
    wf.rect(460, 320, 420, 200, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(474, 346, "Итоги по людям", 14, bold=True)
    for k, name in enumerate(PEOPLE5):
        yy = 368 + k * 36
        wf.avatar(486, yy, name, 11)
        wf.text(508, yy + 5, name, 13)
        wf.text(700, yy + 5, ("5 sp · 2 задачи", "6 sp · 2 задачи", "4 sp · 1 задача", "3 sp · 1 задача")[k], 13)
    wf.callout(5, 454, 320)
    wf.rect(20, 536, 860, 150, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(34, 562, "Выполненные и перенесённые задачи · ретроспектива", 14, bold=True)
    for k, line in enumerate(("DEMO-6 Спроектировать таблицу пользователей — Done — Анна К. — 5 sp", "DEMO-4 Смена пароля — Done — Игорь С. — 5 sp", "DEMO-5 История заказов — перенесена в Спринт 3 — 8 sp", "Ретро: 2 «хорошо», 2 «улучшить», 2 действия")):
        wf.text(34, 590 + k * 24, line, 13, fill=t["muted"] if k == 3 else None)
    wf.text(20, 722, "Excel: листы «Сводка», «Задачи», «Люди», «Burndown», «Ретроспектива». Печать: кнопки и меню скрыты, остаётся только отчёт.", 12.5, fill=t["muted"])
    wf.text(20, 742, "Отчёт доступен у закрытого спринта и у идущего (тогда цифры на сегодня).", 12.5, fill=t["muted"])
    return wf


def analytics_head(wf, tab, period="Период: 60 дней ▾"):
    t = wf.t
    wf.shell("team-tracker.app/analytics?projects=DEMO,SHOP", "Портфель")
    wf.text(20, 130, "Аналитика", 24, bold=True)
    wf.rect(20, 148, 188, 30, fill=t["accent_bg"], stroke=t["accent"], r=15, sw=1.6)
    wf.text(34, 168, "Проекты: DEMO, SHOP ▾", 13, bold=True)
    wf.callout(1, 14, 148)
    wf.chip(222, 150, period, 12.5, h=28)
    wf.callout(2, 216, 148)
    x = 20
    for name in ("Поток (CFD)", "Время цикла", "Нагрузка", "Дорожная карта"):
        sel = name == tab
        w = wf.est(name, 14, sel) + 28
        wf.rect(x, 192, w, 34, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=6, sw=1.8 if sel else 1.2)
        wf.text(x + w / 2, 214, name, 14, "middle", sel)
        x += w + 8
    wf.callout(3, 14, 192)


def screen_cfd():
    wf = WF(700, "Аналитика: кумулятивная диаграмма потока (CFD)")
    t = wf.t
    analytics_head(wf, "Поток (CFD)")
    x0, y0, w, h = 60, 262, 800, 300
    wf.rect(20, 244, 860, 380, fill=t["panel"], stroke=t["line"], r=8)
    wf.line(x0, y0 + h, x0 + w, y0 + h)
    wf.line(x0, y0, x0, y0 + h)
    bands = [("Done", [0, 6, 14, 24, 34, 48, 60, 72], "Done"), ("Review", [2, 5, 8, 10, 12, 12, 14, 14], "Review"), ("In Progress", [4, 7, 9, 10, 12, 14, 14, 15], "In Progress"), ("To Do", [10, 12, 14, 14, 15, 16, 16, 17], "To Do"), ("Backlog", [20, 21, 22, 24, 25, 26, 28, 30], "Backlog")]
    n = 8
    scale = h / 150
    cum = [0] * n
    for name, vals, status in bands:
        lower = list(cum)
        cum = [c + v for c, v in zip(cum, vals)]
        top = [(x0 + i * w / (n - 1), y0 + h - c * scale) for i, c in enumerate(cum)]
        bot = [(x0 + i * w / (n - 1), y0 + h - c * scale) for i, c in enumerate(lower)]
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in top + bot[::-1])
        wf.p.append(f'<polygon points="{pts}" fill="{t["status"][status]}" stroke="{t["muted"]}" stroke-width="1"/>')
    wf.callout(4, 66, 276)
    for i, d in enumerate(("01.09", "08.09", "15.09", "22.09", "29.09", "06.10", "13.10", "20.10")):
        wf.text(x0 + i * w / (n - 1), y0 + h + 18, d, 11, "middle", fill=t["muted"])
    lx = 60
    for name, _, status in bands[::-1]:
        wf.rect(lx, 596, 14, 14, fill=t["status"][status], stroke=t["muted"], r=3)
        wf.text(lx + 20, 608, name, 12)
        lx += 120
    wf.callout(5, 640, 600)
    wf.text(20, 650, "Высота полосы — число задач в статусе на конец дня. Расширяющаяся полоса «In Progress» — затор: задачи начинают, но не заканчивают.", 12, fill=t["muted"])
    wf.text(20, 672, "Таблица данных под графиком (для чтецов экрана и для печати). Считается из истории задач, ничего не хранится.", 12, fill=t["muted"])
    return wf


def screen_cycle():
    wf = WF(700, "Аналитика: cycle time и lead time")
    t = wf.t
    analytics_head(wf, "Время цикла")
    wf.rect(20, 244, 420, 270, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(34, 270, "Время цикла: распределение", 14, bold=True)
    wf.text(34, 288, "от «In Progress» до «Done», дни", 11.5, fill=t["muted"])
    for i, v in enumerate((12, 34, 28, 17, 9, 5, 2)):
        wf.rect(50 + i * 52, 490 - v * 5, 40, v * 5, fill=t["status"]["In Progress"], stroke=t["accent"], r=3)
        wf.text(70 + i * 52, 506, ("0–1", "1–2", "2–3", "3–5", "5–8", "8–13", "13+")[i], 10.5, "middle", fill=t["muted"])
    wf.callout(4, 14, 244)
    wf.rect(460, 244, 420, 270, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(474, 270, "Время выполнения: распределение", 14, bold=True)
    wf.text(474, 288, "от создания до «Done», дни", 11.5, fill=t["muted"])
    for i, v in enumerate((3, 8, 14, 24, 22, 14, 9)):
        wf.rect(490 + i * 52, 490 - v * 5, 40, v * 5, fill=t["status"]["Review"], stroke=t["accent"], r=3)
        wf.text(510 + i * 52, 506, ("0–2", "2–5", "5–8", "8–13", "13–21", "21–34", "34+")[i], 10.5, "middle", fill=t["muted"])
    wf.callout(5, 454, 244)
    wf.rect(20, 530, 860, 130, fill=t["panel"], stroke=t["line"], r=8)
    for k, h in enumerate(("Тип", "Задач", "Цикл: среднее", "Цикл: медиана", "85 %", "Выполнение: среднее")):
        wf.text(34 + k * 140, 556, h, 12, fill=t["muted"])
    for r, row in enumerate((("Все", "107", "3,4 дн.", "3 дн.", "6 дн.", "9,8 дн."), ("Story", "31", "4,9 дн.", "4 дн.", "8 дн.", "12,1 дн."), ("Bug", "22", "1,8 дн.", "1 дн.", "3 дн.", "5,2 дн."))):
        for k, v in enumerate(row):
            wf.text(34 + k * 140, 582 + r * 24, v, 13, bold=(r == 0))
    wf.callout(6, 14, 530)
    wf.text(20, 690, "Считаются задачи, завершённые за период: цикл — с последнего входа в In Progress до Done, выполнение — с создания до Done.", 12, fill=t["muted"])
    return wf


def screen_workload():
    wf = WF(700, "Аналитика: нагрузка по людям")
    t = wf.t
    analytics_head(wf, "Нагрузка", "Активные спринты")
    wf.rect(20, 244, 860, 330, fill=t["panel"], stroke=t["line"], r=8)
    people = (("Анна Ковалёва", 13, 5, 8), ("Игорь Смирнов", 18, 3, 5), ("Мария Орлова", 9, 2, 6), ("Дмитрий Васильев", 5, 2, 0), ("Не назначено", 6, 4, 0))
    for r, (name, demo, shop, tasks) in enumerate(people):
        y = 280 + r * 54
        wf.avatar(44, y, name, 12)
        wf.text(66, y + 5, name, 13)
        wf.rect(230, y - 12, demo * 20, 24, fill=t["status"]["In Progress"], stroke=t["accent"], r=3)
        wf.rect(230 + demo * 20, y - 12, shop * 20, 24, fill=t["status"]["Review"], stroke=t["accent"], r=3)
        wf.text(230 + (demo + shop) * 20 + 10, y + 5, f"{demo + shop} sp · {demo // 3 + shop // 3 + 1} задач", 12, fill=t["muted"])
    wf.line(230 + 16 * 20, 262, 230 + 16 * 20, 560, dash=True)
    wf.text(230 + 16 * 20 + 6, 270, "среднее 10,2", 11, fill=t["muted"])
    wf.callout(4, 14, 262)
    wf.rect(60, 596, 14, 14, fill=t["status"]["In Progress"], stroke=t["muted"], r=3)
    wf.text(80, 608, "DEMO", 12)
    wf.rect(160, 596, 14, 14, fill=t["status"]["Review"], stroke=t["muted"], r=3)
    wf.text(180, 608, "SHOP", 12)
    wf.callout(5, 40, 600)
    wf.text(20, 650, "Story points и задачи, не завершённые, в активных спринтах выбранных проектов — по каждому человеку сразу по всем проектам.", 12, fill=t["muted"])
    wf.text(20, 672, "Полоса разбита по проектам; пунктир — среднее по людям. Клик по имени — их задачи на экране «Люди».", 12, fill=t["muted"])
    return wf


def screen_roadmap():
    wf = WF(700, "Аналитика: дорожная карта эпиков")
    t = wf.t
    analytics_head(wf, "Дорожная карта", "Период: 6 месяцев ▾")
    wf.rect(20, 244, 860, 380, fill=t["panel"], stroke=t["line"], r=8)
    months = ("Сен", "Окт", "Ноя", "Дек", "Янв", "Фев")
    for i, m in enumerate(months):
        wf.text(300 + i * 96, 268, m, 12, "middle", fill=t["muted"])
        wf.line(252 + i * 96, 276, 252 + i * 96, 604, color=t["line"])
    wf.line(300 + 1.6 * 96 + 20, 276, 300 + 1.6 * 96 + 20, 604, dash=True)
    wf.text(300 + 1.6 * 96 + 26, 290, "сегодня", 11, fill=t["warn"])
    rows = (("DEMO", "Личный кабинет клиента", 0.0, 3.4, 40), ("DEMO", "Заказы", 1.2, 4.6, 25), ("SHOP", "Оплата", 0.4, 2.4, 70), ("SHOP", "Каталог", 1.6, 5.2, 55), ("SHOP", "Промокоды", None, None, 0))
    for r, (key, name, a, b, pr) in enumerate(rows):
        y = 316 + r * 60
        wf.chip(30, y - 14, key, 11.5, h=22)
        wf.text(76, y + 2, wf.fit(name, 168, 13), 13, bold=True)
        if a is None:
            wf.text(262, y + 4, "без дат: нет задач в спринтах", 12, fill=t["muted"])
            continue
        x1, x2 = 252 + a * 96, 252 + b * 96
        wf.rect(x1, y - 14, x2 - x1, 26, fill=t["bg"], stroke=t["accent"], r=5, sw=1.6)
        wf.rect(x1, y - 14, (x2 - x1) * pr / 100, 26, fill=t["status"]["Done"], stroke=t["accent"], r=5, sw=1.6)
        wf.text(x1 + 8, y + 4, f"{pr} %", 12, bold=True)
    wf.callout(4, 14, 302)
    wf.callout(5, 252 + 1.6 * 96 + 14, 290)
    wf.text(20, 650, "Полоса эпика — от начала первого до конца последнего спринта его задач (или срока эпика, если он позже); закрашено — прогресс эпика.", 12, fill=t["muted"])
    wf.text(20, 672, "Эпики сгруппированы по проектам выбранного набора; эпик без задач в спринтах показан без полосы.", 12, fill=t["muted"])
    return wf


def screen_wizard():
    wf = WF(700, "Мастер первого запуска (администратор)")
    t = wf.t
    wf.shell("team-tracker.app/projects", "Портфель", tabs=False)
    wf.overlay()
    mx, my, mw, mh = 120, 96, 660, 560
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 38, "Добро пожаловать в Team Tracker", 20, bold=True)
    wf.text(mx + 24, my + 62, "Четыре шага — и можно работать. Любой шаг можно пропустить.", 13, fill=t["muted"])
    steps = ("1 Проект", "2 Владелец", "3 Люди", "4 Гамма")
    x = mx + 24
    for n, name in enumerate(steps):
        cur = n == 1
        w = wf.est(name, 13, cur) + 24
        wf.rect(x, my + 80, w, 28, fill=t["accent_bg"] if cur else t["bg"], stroke=t["accent"] if cur else t["line"], r=14, sw=1.8 if cur else 1.2)
        wf.text(x + w / 2, my + 99, name, 13, "middle", cur)
        x += w + 8
    wf.callout(1, mx + 10, my + 80)
    wf.text(mx + 24, my + 148, "Кто владелец проекта DEMO?", 16, bold=True)
    wf.text(mx + 24, my + 170, "Владелец — продакт, который отвечает за проект; его видно в «Портфеле».", 13, fill=t["muted"])
    wf.field(mx + 24, my + 190, 320, "Владелец", "Админ Тестов", dropdown=True)
    wf.callout(2, mx + 10, my + 190)
    wf.rect(mx + 24, my + 262, 612, 150, fill=t["panel"], stroke=t["line"], r=8)
    wf.text(mx + 40, my + 288, "Что уже сделано", 13, bold=True)
    for k, line in enumerate(("✓ Шаг 1. Проект DEMO «Демо-проект» создан", "○ Шаг 2. Владелец — выберите и нажмите «Далее»", "○ Шаг 3. Люди: добавьте участников (им выдаётся временный пароль)", "○ Шаг 4. Цветовая гамма")):
        wf.text(mx + 40, my + 314 + k * 24, line, 13, fill=t["muted"] if k else None)
    wf.callout(3, mx + 10, my + 262)
    wf.button(mx + 24, my + 460, 110, 34, "← Назад", size=13)
    wf.button(mx + 150, my + 460, 110, 34, "Далее →", True, 13)
    wf.button(mx + 440, my + 460, 196, 34, "Пропустить мастер", size=13)
    wf.callout(4, mx + 430, my + 460)
    wf.text(mx + 24, my + 530, "Мастер откроется один раз; позже его можно запустить из «Справки» (клавиша ?).", 12, fill=t["muted"])
    return wf


def screen_help():
    wf = WF(860, "Встроенная справка по «?»")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    wf.overlay()
    mx, my, mw, mh = 90, 90, 720, 720
    wf.rect(mx, my, mw, mh, fill=t["bg"], stroke=t["line"], r=10, sw=1.6)
    wf.text(mx + 24, my + 38, "Справка", 20, bold=True)
    wf.text(mx + mw - 30, my + 38, "Esc", 13, "end", fill=t["muted"])
    x = mx + 24
    for n, name in enumerate(("Клавиши", "Правила", "Кто что может")):
        sel = n == 0
        w = wf.est(name, 14, sel) + 28
        wf.rect(x, my + 56, w, 32, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=6, sw=1.8 if sel else 1.2)
        wf.text(x + w / 2, my + 77, name, 14, "middle", sel)
        x += w + 8
    wf.callout(1, mx + 10, my + 56)
    rows = (("Ctrl+K  ·  /", "Поиск и команды"), ("C", "Создать задачу"), ("G, затем D / B / H / S / R / P", "Доска, планирование, прошлые спринты, спринты, отчёты, люди"), ("?", "Эта справка"), ("Ctrl+Enter", "Сохранить форму или отправить комментарий"), ("Esc", "Закрыть окно"))
    y = my + 120
    for k, d in rows:
        wf.rect(mx + 24, y - 18, 220, 28, fill=t["panel"], stroke=t["line"], r=5)
        wf.text(mx + 34, y + 1, k, 12.5, bold=True)
        wf.text(mx + 260, y + 1, wf.fit(d, 410, 13), 13)
        y += 38
    wf.callout(2, mx + 10, my + 104)
    wf.text(mx + 24, y + 6, "Клавиши не срабатывают, пока фокус в поле ввода.", 12, fill=t["muted"])
    wf.line(mx + 24, y + 30, mx + mw - 24, y + 30)
    wf.text(mx + 24, y + 60, "Вкладка «Правила» — коротко и простым языком:", 13, bold=True)
    for k, line in enumerate(("Статусы: Backlog → To Do → In Progress → Review → Done; допустим любой переход.", "Story points — целое число; у Epic и подзадач их нет.", "Спринт: один идущий; закрытие переносит незавершённое по выбору.", "Перенос: с доски за ручку ⋮⋮, в планировании — между спринтами.", "WIP-лимит: превышение — предупреждение, запрета нет.", "Definition of Done: перед Done подтверждаются пункты проекта.")):
        wf.text(mx + 24, y + 86 + k * 24, wf.fit("• " + line, mw - 48, 12.5), 12.5, fill=t["muted"])
    wf.callout(3, mx + 10, y + 46)
    wf.line(mx + 24, y + 244, mx + mw - 24, y + 244)
    wf.text(mx + 24, y + 274, "Вкладка «Кто что может» — таблица прав по ролям (из той же проверки, что на сервере).", 13, fill=t["muted"])
    wf.callout(4, mx + 10, y + 258)
    wf.button(mx + 24, my + mh - 56, 230, 34, "Запустить мастер первого запуска", size=12.5)
    wf.callout(5, mx + 10, my + mh - 56)
    wf.text(mx + 270, my + mh - 34, "только администратор", 12, fill=t["muted"])
    return wf


def screen_nav_tabs():
    wf = WF(560, "Шапка на «Портфеле» и «Аналитике»: те же вкладки проекта, переключатель проектов")
    t = wf.t
    wf.shell("team-tracker.app/portfolio", "Портфель")
    # открытый переключатель проектов
    wf.rect(300, 96, 300, 150, fill=t["bg"], stroke=t["accent"], r=8, sw=1.6)
    for n, (name, cur) in enumerate((("TEST · Проект 1", True), ("DEMO · Демо-проект", False), ("SHOP · Интернет-магазин", False))):
        wf.rect(306, 102 + n * 30, 288, 28, fill=t["accent_bg"] if cur else t["bg"], r=4)
        wf.text(318, 121 + n * 30, ("✓ " if cur else "") + name, 13, bold=cur)
    wf.line(306, 196, 594, 196)
    wf.text(318, 218, "Все проекты…", 13)
    wf.text(318, 238, "+ Новый проект (администратор)", 13, fill=t["muted"])
    wf.callout(1, 294, 100)
    wf.text(20, 300, "Портфель", 24, bold=True)
    wf.text(20, 326, "Вкладки проекта видны и здесь: переход в Бэклог, Доску, Спринты… без возврата в список проектов.", 13, fill=t["muted"])
    wf.callout(2, 14, 96)
    wf.text(20, 372, "1. Чип проекта становится переключателем: текущий проект, быстрый выбор другого, «Все проекты…» (список и создание).", 13)
    wf.text(20, 398, "2. Какой проект стоит в чипе на «Портфеле» и «Аналитике»: последний открытый (запоминается), иначе первый из выбранных.", 13)
    wf.text(20, 424, "3. Вкладки проекта — те же, что внутри проекта; «Портфель» и «Аналитика» остаются слева и подсвечиваются, когда открыты.", 13)
    wf.text(20, 450, "4. Выбор проекта в чипе не меняет фильтр «Проекты: …» на странице: фильтр — про то, что считать, чип — куда переходить.", 13)
    return wf


def screen_frames():
    wf = WF(820, "Планирование: спринт в общей рамке, иерархия эпик → задачи")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/backlog", "Бэклог")
    wf.text(20, 130, "Планирование будущих спринтов", 22, bold=True)
    # спринт в одной рамке
    wf.rect(20, 150, 860, 230, fill=t["bg"], stroke=t["muted"], r=10, sw=1.8)
    wf.rect(20, 150, 860, 62, fill=t["panel"], stroke=None, r=10)
    wf.line(20, 212, 880, 212, color=t["line"])
    wf.text(34, 178, "▾ Спринт 1", 15, bold=True)
    wf.chip(130, 163, "идёт", 12)
    wf.text(190, 179, "28.10 – 04.11", 13, fill=t["muted"])
    wf.text(866, 178, "9 / 16 sp · 56 %", 13, "end", True)
    wf.text(34, 202, "Цель: смена пароля и начало истории заказов", 12.5, fill=t["muted"])
    wf.callout(1, 14, 150)
    for n, (key, title, typ) in enumerate((("TEST-1", "Тест задача", "Task"), ("TEST-4", "Форма смены пароля", "Story"))):
        yy = 224 + n * 70
        wf.rect(34, yy, 832, 58, fill=t["bg"], stroke=t["line"], r=6)
        wf.icon(46, yy + 18, typ, 20)
        wf.text(80, yy + 36, key, 13, bold=True)
        wf.text(150, yy + 36, title, 14)
    # бэклог с иерархией
    wf.rect(20, 400, 860, 360, fill=t["bg"], stroke=t["muted"], r=10, sw=1.8)
    wf.rect(20, 400, 860, 44, fill=t["panel"], stroke=None, r=10)
    wf.line(20, 444, 880, 444, color=t["line"])
    wf.text(34, 428, "▾ Общий бэклог", 15, bold=True)
    wf.text(190, 428, "5 задач · 8 sp", 13, fill=t["muted"])
    wf.callout(2, 14, 400)
    # эпик с вложенными
    wf.rect(34, 456, 832, 44, fill=t["accent_bg"], stroke=t["accent"], r=6)
    wf.text(46, 484, "▾", 14)
    wf.icon(66, 468, "Epic", 20)
    wf.text(98, 484, "TEST-2", 13, bold=True)
    wf.text(170, 484, "Тест Эпик 1", 14, bold=True)
    wf.text(860, 484, "1 из 3 · 33 %", 12.5, "end", fill=t["muted"])
    for n, (key, title, typ, where) in enumerate((("TEST-3", "Задача в эпике 1", "Task", ""), ("TEST-5", "Экспорт заказов", "Story", ""), ("TEST-6", "Письмо о смене пароля", "Task", "в Спринте 1"))):
        yy = 508 + n * 48
        wf.line(52, 500 if n == 0 else yy - 4, 52, yy + 20, color=t["muted"])
        wf.line(52, yy + 20, 72, yy + 20, color=t["muted"])
        wf.rect(76, yy, 790, 40, fill=t["bg"], stroke=t["line"], r=6)
        wf.icon(88, yy + 10, typ, 20)
        wf.text(120, yy + 26, key, 13, bold=True)
        wf.text(190, yy + 26, title, 14)
        if where:
            wf.chip(700, yy + 9, where, 12, fill=t["panel"])
    wf.callout(3, 14, 458)
    wf.callout(4, 680, 646)
    wf.rect(34, 660, 832, 40, fill=t["bg"], stroke=t["line"], r=6)
    wf.icon(46, 670, "Bug", 20)
    wf.text(80, 686, "TEST-9", 13, bold=True)
    wf.text(150, 686, "Ошибка округления (без эпика)", 14)
    wf.text(20, 790, "Эпик — строка-заголовок с прогрессом; его задачи вложены под ним отступом и линией (как подзадачи под родителем). Эпик сворачивается ▾/▸.", 12, fill=t["muted"])
    return wf


def screen_settings_groups():
    wf = WF(980, "Настройки проекта: группы в тонких рамках")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/settings", "Настройки")
    wf.text(20, 130, "Настройки проекта", 24, bold=True)

    def frame(y, h, title, sub):
        wf.rect(20, y, 860, h, fill=t["bg"], stroke=t["line"], r=8, sw=1.2)
        wf.text(36, y + 26, title, 16, bold=True)
        wf.text(36, y + 46, sub, 12, fill=t["muted"])
    frame(150, 160, "Спринты", "значения подставляются в форму нового спринта")
    wf.field(36, 266 - 100, 150, "Длительность, дней", "14")
    wf.field(204, 266 - 100, 150, "Префикс названия", "Спринт")
    wf.field(372, 266 - 100, 150, "Номер следующего", "3")
    wf.field(540, 266 - 100, 170, "Старт следующего", "05.11.2026")
    wf.button(36, 270, 110, 30, "Сохранить", True, 13)
    wf.callout(1, 14, 150)
    frame(324, 110, "WIP-лимиты колонок", "предупреждение при превышении; запрета нет")
    wf.rect(36, 366, 40, 22, fill=t["bg"], stroke=t["muted"], r=11, sw=1.4)
    wf.p.append(f'<circle cx="47" cy="377" r="8" fill="{t["muted"]}"/>')
    wf.text(86, 382, "Выключены", 13)
    for n, c in enumerate(("To Do", "In Progress", "Review", "Done")):
        wf.chip(250 + n * 150, 364, f"{c}: —", 12, h=26)
    wf.callout(2, 14, 324)
    frame(448, 100, "Definition of Done", "пункты подтверждаются при переводе в Done")
    wf.rect(36, 492, 560, 44, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(46, 519, "- [ ] Код проверен · - [ ] Тесты проходят", 12.5, fill=t["muted"])
    # шаблоны — список слева, редактор справа
    frame(562, 270, "Шаблоны задач", "тип, описание и критерии подставляются при создании")
    wf.rect(36, 604, 200, 214, fill=t["panel"], stroke=t["line"], r=6)
    for n, (name, sel) in enumerate((("Баг", True), ("Story", False), ("Задача", False))):
        wf.rect(42, 610 + n * 38, 188, 32, fill=t["accent_bg"] if sel else t["panel"], stroke=t["accent"] if sel else None, r=5)
        wf.text(54, 631 + n * 38, name, 13, bold=sel)
    wf.button(42, 774, 188, 30, "+ Новый шаблон", size=12.5)
    wf.rect(252, 604, 616, 214, fill=t["bg"], stroke=t["line"], r=6)
    wf.field(266, 630, 250, "Название", "Баг", h=30)
    wf.field(534, 630, 150, "Тип", "Bug", h=30, dropdown=True)
    wf.rect(266, 698, 588, 70, fill=t["bg"], stroke=t["line"], r=6)
    wf.text(278, 724, "## Шаги воспроизведения …", 12.5, fill=t["muted"])
    wf.button(266, 778, 110, 28, "Сохранить", True, 12.5)
    wf.button(386, 778, 90, 28, "Удалить", size=12.5)
    wf.callout(3, 14, 562)
    frame(846, 120, "Участники проекта", "роль в проекте; владелец отвечает за проект")
    wf.text(36, 892, "Владелец: Админ Тестов ▾", 13)
    wf.chip(250, 874, "Анна Ковалёва · Тимлид ✕", 12, h=26)
    wf.chip(450, 874, "Игорь Смирнов · Разработчик ✕", 12, h=26)
    wf.callout(4, 14, 846)
    return wf


def screen_roles_groups():
    wf = WF(700, "Люди: учётки и роли — таблица в рамке, форма в отдельной рамке")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/people", "Люди")
    wf.text(20, 130, "Учётки и роли", 22, bold=True)
    wf.rect(20, 150, 860, 250, fill=t["bg"], stroke=t["line"], r=8)
    for k, (h, x) in enumerate((("Человек", 36), ("Почта", 250), ("Роль", 520), ("Пароль", 700))):
        wf.text(x, 178, h, 12, fill=t["muted"])
    wf.line(20, 188, 880, 188, color=t["line"])
    for n, (name, mail, role) in enumerate((("Админ Тестов", "admin@example.com", "Администратор"), ("Анна Ковалёва", "anna@example.com", "Тимлид"), ("Игорь Смирнов", "igor@example.com", "Разработчик"))):
        yy = 214 + n * 52
        wf.avatar(46, yy, name, 12)
        wf.text(68, yy + 5, name, 13)
        wf.text(250, yy + 5, mail, 13, fill=t["muted"])
        wf.rect(520, yy - 15, 150, 30, fill=t["bg"], stroke=t["line"], r=6)
        wf.text(530, yy + 5, role, 13)
        wf.text(655, yy + 6, "▾", 13, fill=t["muted"])
        wf.button(700, yy - 15, 150, 30, "Сбросить пароль", size=12)
        if n < 2:
            wf.line(30, yy + 26, 870, yy + 26, color=t["line"])
    wf.callout(1, 14, 150)
    wf.rect(20, 420, 860, 200, fill=t["bg"], stroke=t["line"], r=8)
    wf.text(36, 448, "Новый участник", 16, bold=True)
    wf.text(36, 468, "создаётся учётка с временным паролем; человек сменит его при первом входе", 12, fill=t["muted"])
    wf.field(36, 482, 190, "Имя", "")
    wf.field(240, 482, 210, "Почта", "")
    wf.field(464, 482, 200, "Временный пароль", "k7Rm2xQp9cWs")
    wf.field(678, 482, 180, "Роль", "Разработчик", dropdown=True)
    wf.button(36, 566, 180, 34, "Создать участника", True, 13)
    wf.callout(2, 14, 420)
    wf.text(20, 650, "Роль «Администратор» видят и меняют только администраторы; изменение своей роли заблокировано. Рядом с ролью — подсказка при наведении.", 12, fill=t["muted"])
    return wf


def screen_tooltips():
    wf = WF(560, "Подсказки при наведении: где и какие")
    t = wf.t
    wf.shell(f"team-tracker.app/projects/{KEY}/board", "Доска")
    def tip(x, y, w, text):
        wf.rect(x, y, w, 30, fill=t["ink"], r=5)
        wf.text(x + 10, y + 20, text, 12, fill=t["bg"])
    wf.chip(40, 140, "Проекты: TEST ▾", 13, h=30, fill=t["accent_bg"])
    tip(40, 176, 330, "Какие проекты показывать на экране: свои, все или выбранные")
    wf.chip(420, 140, "⚠ WIP 4 из 3", 12.5, h=28)
    tip(420, 174, 400, "Задач в колонке больше лимита; перенос не запрещён")
    wf.chip(40, 260, "In Progress", 12.5, h=28, fill=t["status"]["In Progress"])
    tip(40, 294, 360, "Статус задачи. Допустим любой переход; он пишется в историю")
    wf.rect(450, 260, 70, 30, fill=t["bg"], stroke=t["line"], r=5)
    wf.text(466, 280, "8", 14)
    tip(450, 294, 330, "Story points — оценка в целых числах (1, 2, 3, 5, 8, 13)")
    wf.text(40, 400, "Правила подсказок", 16, bold=True)
    for k, line in enumerate(("Есть у всех кнопок-значков, сокращений, чипов, статусов, фильтров, полей настроек и переключателей.", "Текст — одна короткая фраза: что это и что произойдёт. Без повторения подписи кнопки.", "То же текстом для чтецов экрана (aria-label / описание), не только мышь.", "Появляется при наведении и при фокусе с клавиатуры; не закрывает поле, к которому относится.")):
        wf.text(40, 428 + k * 26, "• " + line, 13)
    return wf


def screen_roles_matrix():
    wf = WF(860, "Настройки: роли и права — таблица с галочками")
    t = wf.t
    wf.shell(f"team-tracker.app/settings/roles", "Настройки")
    wf.text(20, 130, "Роли и права", 24, bold=True)
    wf.text(20, 154, "Название роли — любое; галочки задают, что роли разрешено. Просмотр данных доступен всем ролям.", 13, fill=t["muted"])
    wf.rect(20, 172, 860, 600, fill=t["bg"], stroke=t["line"], r=8)
    roles = ("Администратор", "Тимлид", "Продакт", "Разработчик", "Наблюдатель")
    x0 = 330
    cw = 108
    # шапка: названия — поля ввода
    for k, name in enumerate(roles):
        x = x0 + k * cw
        wf.rect(x, 186, cw - 8, 30, fill=t["panel"] if k == 0 else t["bg"], stroke=t["line"], r=5)
        wf.text(x + 8, 206, wf.fit(name, cw - 24, 12), 12, bold=True)
    wf.text(36, 206, "Функция", 12, fill=t["muted"])
    wf.callout(1, x0 - 8, 186)
    groups = (
        ("Задачи", (("Создавать задачи", (1, 1, 1, 1, 0)), ("Редактировать поля и описание", (1, 1, 1, 1, 0)), ("Комментировать", (1, 1, 1, 1, 0)), ("Менять статус своих задач", (1, 1, 1, 1, 0)), ("Менять статус чужих задач", (1, 1, 1, 0, 0)))),
        ("Планирование", (("Приоритет и порядок задач", (1, 1, 1, 0, 0)), ("Состав спринта", (1, 1, 1, 0, 0)), ("Спринты и настройки проекта", (1, 1, 0, 0, 0)), ("Шаблоны, WIP и Definition of Done", (1, 1, 0, 0, 0)), ("Отпуска и больничные", (1, 1, 0, 0, 0)))),
        ("Администрирование", (("Проекты, люди и участники", (1, 0, 0, 0, 0)), ("Учётки и роли", (1, 0, 0, 0, 0)), ("Резервные копии и диагностика", (1, 0, 0, 0, 0)))),
    )
    y = 236
    for title, rows in groups:
        wf.rect(28, y, 844, 24, fill=t["panel"], r=4)
        wf.text(38, y + 17, title, 12, bold=True)
        y += 30
        for label, vals in rows:
            wf.text(40, y + 17, label, 13)
            for k, v in enumerate(vals):
                bx = x0 + k * cw + (cw - 8) / 2 - 9
                locked = k == 0
                wf.rect(bx, y + 3, 18, 18, fill=t["accent"] if v and not locked else (t["muted"] if v else t["bg"]), stroke=t["muted"] if locked else t["accent"], r=4)
                if v:
                    wf.text(bx + 9, y + 17, "✓", 13, "middle", True, t["accent_ink"])
            y += 28
        y += 6
    wf.callout(2, 28, 270)
    wf.text(36, y + 18, "Роль «Администратор» защищена: все права, галочки не снимаются, удалить нельзя.", 12.5, fill=t["muted"])
    wf.text(36, y + 40, "«Наблюдатель» — только чтение: ни одной галочки.", 12.5, fill=t["muted"])
    wf.callout(3, 28, y + 14)
    wf.button(36, y + 68, 160, 32, "+ Новая роль", size=13)
    wf.button(206, y + 68, 150, 32, "Копировать роль", size=13)
    wf.button(366, y + 68, 120, 32, "Удалить роль", size=13)
    wf.button(700, y + 68, 160, 32, "Сохранить", True, 13)
    wf.callout(4, 28, y + 68)
    wf.text(36, y + 124, "Удалить можно роль, которой нет ни у одной учётки. Права действуют сразу после сохранения; сервер проверяет их сам.", 12.5, fill=t["muted"])
    return wf


SCREENS = {
    "wf-map": screen_map,
    "wf-projects": screen_projects,
    "wf-backlog": screen_backlog,
    "wf-board": lambda: board(LIGHT, "Экран «Доска», группировка по исполнителю", f"team-tracker.app/projects/{KEY}/board"),
    "wf-board-dark": lambda: board(DARK, "Экран «Доска», тёмная тема", f"team-tracker.app/projects/{KEY}/board", False),
    "wf-sprints": screen_sprints,
    "wf-sprint-close": screen_close,
    "wf-issue": lambda: screen_issue(9, "comments", "Карточка задачи, вкладка «Комментарии»"),
    "wf-issue-history": lambda: screen_issue(7, "history", "Карточка задачи, вкладка «История»"),
    "wf-create": screen_create,
    "wf-reports": screen_reports,
    "wf-people": screen_people,
    "wf-login": screen_login,
    "wf-search": screen_search,
    "wf-settings": screen_settings,
    "wf-backups": screen_backups,
    "wf-palette": screen_palette,
    "wf-about": screen_about,
    "wf-board-projects": screen_board_projects,
    "wf-portfolio": screen_portfolio,
    "wf-members": screen_members,
    "wf-quick": screen_quick,
    "wf-bulk": screen_bulk,
    "wf-markdown": screen_markdown,
    "wf-templates": screen_templates,
    "wf-create-template": screen_create_template,
    "wf-availability": screen_availability,
    "wf-nav-tabs": screen_nav_tabs,
    "wf-frames": screen_frames,
    "wf-settings-groups": screen_settings_groups,
    "wf-roles-groups": screen_roles_groups,
    "wf-roles-matrix": screen_roles_matrix,
    "wf-tooltips": screen_tooltips,
    "wf-wizard": screen_wizard,
    "wf-help": screen_help,
    "wf-cfd": screen_cfd,
    "wf-cycle": screen_cycle,
    "wf-workload": screen_workload,
    "wf-roadmap": screen_roadmap,
    "wf-dod": screen_dod,
    "wf-retro": screen_retro,
    "wf-sprint-report": screen_sprint_report,
    "wf-retro-board": screen_retro_board,
    "wf-board-beige": lambda: screen_retro_board(BEIGE),
    "wf-backlog-new": screen_backlog_new,
    "wf-retro-responsive": screen_retro_responsive,
    "wf-issue-views": screen_issue_views,
    "wf-history": screen_history,
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in SCREENS.items():
        (OUT / f"{name}.svg").write_text(fn().render(), encoding="utf-8")
        print("svg", name)


if __name__ == "__main__":
    main()
