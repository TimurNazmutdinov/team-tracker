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
        self.text(20, 67, "team-tracker", 17, bold=True)
        if tabs:
            self.chip(158, 52, f"{KEY} ▾", 13, h=26)
            x = 236
            for name in ("Бэклог", "Доска", "Спринты", "Отчёты", "Люди"):
                w = self.est(name, 14, name == active) + 8
                self.text(x, 67, name, 14, bold=(name == active), fill=t["accent"] if name == active else t["ink"])
                if name == active:
                    self.rect(x - 2, 80, w, 4, fill=t["accent"], r=2)
                x += w + 14
        self.rect(W - 280, 50, 150, 30, fill=t["bg"], stroke=t["line"], r=6)
        self.text(W - 270, 70, "Поиск", 13, fill=t["muted"])
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
    cols = [("Исполнитель", 0), ("Задач", w * 0.5), ("Points", w * 0.65), ("Из них в Done", w * 0.8)]
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
    tabs = [("Бэклог", "/backlog"), ("Доска", "/board"), ("Спринты", "/sprints"), ("Отчёты", "/reports"), ("Люди", "/people")]
    xs = [20 + k * 176 for k in range(5)]
    for x, (n, u) in zip(xs, tabs):
        box(x, 150, 160, 64, n, ["/projects/:key" + u] if len(u) < 9 else ["…" + u])
        arrow(445, 84, x + 80, 150)
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
    for sid, label, fill in (("s2", "идёт", t["status"]["In Progress"]), ("s1", "закрыт", t["status"]["Done"])):
        s = SPRINTS[sid]
        sel = sid == "s2"
        wf.rect(30, y, 230, 64, fill=t["accent_bg"] if sel else t["bg"], stroke=t["accent"] if sel else t["line"], r=6, sw=1.8 if sel else 1.2)
        wf.text(42, y + 24, s["name"], 15, bold=True)
        wf.chip(160, y + 8, label, 12, fill=fill)
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
    issues = [i for i, _ in scope("s1") if i["points"]]
    total = sum(i["points"] for i in issues)
    start = datetime.date.fromisoformat(s1["start"])
    end = datetime.date.fromisoformat(s1["end"])
    days = (end - start).days + 1
    done_at = {}
    for x in SEED["history"]:
        if x["to"] == "Done" and x["at"] <= s1["closedAt"]:
            done_at[x["issueId"]] = datetime.datetime.fromisoformat(x["at"].replace("Z", "+00:00")).date()
    rem = []
    for d in range(days):
        day = start + datetime.timedelta(days=d)
        rem.append(total - sum(i["points"] for i in issues if i["id"] in done_at and done_at[i["id"]] <= day))
    # burndown
    gx, gy, gw, gh = 60, 214, 470, 220
    wf.text(34, 180, "Burndown: остаток points по дням", 16, bold=True)
    wf.callout(2, 14, 174)
    for v in (0, total / 3, 2 * total / 3, total):
        yy = gy + gh - gh * v / total
        wf.line(gx, yy, gx + gw, yy, dash=True)
        wf.text(gx - 8, yy + 4, round(v), 12, "end", fill=t["muted"])
    ideal = [(gx + gw * d / (days - 1), gy + gh - gh * total * (1 - d / (days - 1)) / total) for d in range(days)]
    actual = [(gx + gw * d / (days - 1), gy + gh - gh * rem[d] / total) for d in range(days)]
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
    # velocity
    vx, vw = 580, 300
    wf.text(vx, 180, "Velocity: points в Done по спринтам", 16, bold=True)
    wf.callout(3, vx - 17, 174)
    base = gy + gh
    wf.line(vx, base, vx + vw, base, t["muted"])
    vel = sum(i["points"] or 0 for i, st in scope("s1") if st == "Done")
    bh = gh * 0.8
    wf.rect(vx + 40, base - bh, 80, bh, fill=t["accent"], r=3)
    wf.text(vx + 80, base - bh - 8, vel, 14, "middle", True)
    wf.text(vx + 80, base + 20, "Спринт 1", 12, "middle")
    wf.rect(vx + 170, base - 3, 80, 3, fill=t["muted"], r=0)
    wf.text(vx + 210, base - 12, "идёт", 12, "middle", fill=t["muted"])
    wf.text(vx + 210, base + 20, "Спринт 2", 12, "middle")
    wf.text(vx, base + 50, "Столбцы появляются после закрытия спринта.", 12, fill=t["muted"])
    wf.text(34, 546, f"Итоги по людям — {s1['name']}", 16, bold=True)
    wf.callout(4, 14, 540)
    people_table(wf, 20, 560, "s1")
    wf.text(20, 770, "Линии построены по демо-данным по календарным дням; на экране — те же данные в виде интерактивных графиков.", 12, fill=t["muted"])
    return wf


def screen_people():
    wf = WF(560, "Экран «Люди»")
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
    "wf-search": screen_search,
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in SCREENS.items():
        (OUT / f"{name}.svg").write_text(fn().render(), encoding="utf-8")
        print("svg", name)


if __name__ == "__main__":
    main()
