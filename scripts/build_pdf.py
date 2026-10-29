#!/usr/bin/env python3
"""Собирает docs/pdf/architecture.pdf и docs/pdf/capabilities.pdf из Markdown.

Зависимость: reportlab (и Pillow, он ставится вместе с ним). Шрифт — DejaVu Sans.
Схемы берутся из docs/diagrams/*.png (см. build_diagrams.py и svg_to_png.cjs):
- блок ```mermaid, за которым идёт `<!-- pdf: diagrams/имя.png -->`, заменяется картинкой;
- `![...](x.svg)` заменяется docs/diagrams/x.png.

Запуск: python3 scripts/build_pdf.py
"""
import datetime
import pathlib
import re
import sys

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "pdf"
VERSION = "0.13"
TODAY = datetime.date.today().strftime("%d.%m.%Y")

FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/TTF",
    "C:/Windows/Fonts",
    "/Library/Fonts",
]
FONT_FILES = {
    "DejaVu": "DejaVuSans.ttf",
    "DejaVu-Bold": "DejaVuSans-Bold.ttf",
    "DejaVuMono": "DejaVuSansMono.ttf",
    "DejaVuMono-Bold": "DejaVuSansMono-Bold.ttf",
}

BOOKS = [
    ("architecture.md", "architecture.pdf"),
    ("capabilities.md", "capabilities.pdf"),
    ("wireframes.md", "wireframes.pdf"),
]

INK = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#6b7280")
ACCENT = colors.HexColor("#1d4ed8")
HEAD_BG = colors.HexColor("#e5e7eb")
CODE_BG = colors.HexColor("#f3f4f6")
GRID = colors.HexColor("#9ca3af")


def register_fonts():
    for name, fname in FONT_FILES.items():
        for d in FONT_DIRS:
            path = pathlib.Path(d) / fname
            if path.exists():
                pdfmetrics.registerFont(TTFont(name, str(path)))
                break
        else:
            sys.exit(f"Не найден шрифт {fname}; установите DejaVu Sans")
    pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold")


def styles():
    base = dict(fontName="DejaVu", textColor=INK)
    return {
        "body": ParagraphStyle("body", fontSize=9.5, leading=14, spaceAfter=5, **base),
        "h1": ParagraphStyle("h1", fontName="DejaVu-Bold", fontSize=16, leading=20, spaceBefore=16, spaceAfter=8, textColor=ACCENT, keepWithNext=1),
        "h2": ParagraphStyle("h2", fontName="DejaVu-Bold", fontSize=12.5, leading=16, spaceBefore=12, spaceAfter=6, textColor=INK, keepWithNext=1),
        "h3": ParagraphStyle("h3", fontName="DejaVu-Bold", fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3, textColor=INK, keepWithNext=1),
        "li": ParagraphStyle("li", leftIndent=14, bulletIndent=3, fontSize=9.5, leading=14, spaceAfter=2, **base),
        "cell": ParagraphStyle("cell", fontSize=8.2, leading=10.6, **base),
        "cellh": ParagraphStyle("cellh", fontName="DejaVu-Bold", fontSize=8.2, leading=10.6, textColor=INK),
        "code": ParagraphStyle("code", fontName="DejaVuMono", fontSize=7.8, leading=9.8, textColor=INK, backColor=CODE_BG, borderPadding=5, spaceBefore=4, spaceAfter=8),
        "title": ParagraphStyle("title", fontName="DejaVu-Bold", fontSize=30, leading=36, alignment=TA_CENTER, textColor=ACCENT),
        "subtitle": ParagraphStyle("subtitle", fontName="DejaVu", fontSize=15, leading=21, alignment=TA_CENTER, textColor=INK),
        "meta": ParagraphStyle("meta", fontName="DejaVu", fontSize=10.5, leading=16, alignment=TA_CENTER, textColor=MUTED),
        "toc_title": ParagraphStyle("toc_title", fontName="DejaVu-Bold", fontSize=18, leading=24, spaceAfter=10, textColor=ACCENT),
        "toc0": ParagraphStyle("toc0", fontName="DejaVu-Bold", fontSize=10, leading=16, leftIndent=0, textColor=INK),
        "toc1": ParagraphStyle("toc1", fontName="DejaVu", fontSize=9, leading=14, leftIndent=14, textColor=INK),
    }


# ---------------------------------------------------------------- разметка


def inline(text):
    codes = []

    def keep(m):
        codes.append(m.group(1))
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", keep, text)
    text = text.replace("<br/>", "\x01")
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("\x01", "<br/>")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#1d4ed8">\1</link>', text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

    def restore(m):
        c = codes[int(m.group(1))].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f'<font name="DejaVuMono" size="8.4">{c}</font>'

    return re.sub(r"\x00(\d+)\x00", restore, text)


def image_flowable(path, frame_w, frame_h):
    with PILImage.open(path) as im:
        w, h = im.size
    scale = min(frame_w / w, frame_h * 0.85 / h)
    img = Image(str(path), width=w * scale, height=h * scale)
    img.hAlign = "CENTER"
    return img


def make_table(rows, aligns, st, frame_w):
    ncol = len(rows[0])
    data = []
    for r, row in enumerate(rows):
        row = (row + [""] * ncol)[:ncol]
        data.append([Paragraph(inline(c), st["cellh" if r == 0 else "cell"]) for c in row])
    weights = []
    for c in range(ncol):
        longest = max(len(re.sub(r"[`*]", "", rows[r][c])) if c < len(rows[r]) else 0 for r in range(len(rows)))
        words = max(len(w) for r in rows if c < len(r) for w in re.sub(r"[`*]", "", r[c]).split() or [""])
        weights.append(max(min(longest, 48), words * 1.8, 6) + 3)
    total = sum(weights)
    widths = [frame_w * w / total for w in weights]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for c, a in enumerate(aligns):
        if a == "center":
            style.append(("ALIGN", (c, 0), (c, -1), "CENTER"))
    t.setStyle(TableStyle(style))
    return t


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def markdown_to_flowables(md, st, frame_w, frame_h):
    lines = md.splitlines()
    out, title = [], None
    i, n = 0, len(lines)
    para = []

    def flush():
        if para:
            out.append(Paragraph(inline(" ".join(para)), st["body"]))
            para.clear()

    while i < n:
        line = lines[i]
        s = line.strip()
        if not s:
            flush()
            i += 1
        elif s.startswith("```"):
            flush()
            lang = s[3:].strip()
            j = i + 1
            block = []
            while j < n and not lines[j].strip().startswith("```"):
                block.append(lines[j])
                j += 1
            j += 1
            if lang == "mermaid":
                k = j
                while k < n and not lines[k].strip():
                    k += 1
                m = re.match(r"<!--\s*pdf:\s*(\S+)\s*-->", lines[k].strip()) if k < n else None
                if not m:
                    sys.exit("У mermaid-блока нет строки <!-- pdf: ... -->")
                out.append(image_flowable(DOCS / m.group(1), frame_w, frame_h))
                out.append(Spacer(1, 8))
                j = k + 1
            else:
                out.append(Preformatted("\n".join(block), st["code"]))
            i = j
        elif s.startswith("<!--"):
            i += 1
        elif s.startswith("!["):
            flush()
            m = re.match(r"!\[[^\]]*\]\(([^)]+)\)", s)
            p = m.group(1)
            if p.endswith(".svg"):
                p = "diagrams/" + pathlib.Path(p).stem + ".png"
            out.append(image_flowable(DOCS / p, frame_w, frame_h))
            out.append(Spacer(1, 8))
            i += 1
        elif s.startswith("# "):
            flush()
            title = title or s[2:].strip()
            i += 1
        elif s.startswith("## "):
            flush()
            out.append(Paragraph(inline(s[3:]), st["h1"]))
            i += 1
        elif s.startswith("### "):
            flush()
            out.append(Paragraph(inline(s[4:]), st["h2"]))
            i += 1
        elif s.startswith("#### "):
            flush()
            out.append(Paragraph(inline(s[5:]), st["h3"]))
            i += 1
        elif s.startswith("|"):
            flush()
            rows = []
            aligns = []
            while i < n and lines[i].strip().startswith("|"):
                cells = split_row(lines[i])
                if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    aligns = ["center" if c.startswith(":") and c.endswith(":") else "left" for c in cells]
                else:
                    rows.append(cells)
                i += 1
            out.append(make_table(rows, aligns, st, frame_w))
            out.append(Spacer(1, 8))
        elif re.match(r"(- |\d+\. )", s):
            flush()
            while i < n and re.match(r"(- |\d+\. )", lines[i].strip()):
                item = lines[i].strip()
                m = re.match(r"(\d+)\. ", item)
                bullet, body = (f"{m.group(1)}.", item[m.end():]) if m else ("•", item[2:])
                i += 1
                while i < n and lines[i].strip() and not re.match(r"(- |\d+\. |\||```|#|<!--|!\[)", lines[i].strip()):
                    body += " " + lines[i].strip()
                    i += 1
                style = ParagraphStyle("li_n", parent=st["li"], leftIndent=18, bulletIndent=0) if m else st["li"]
                out.append(Paragraph(inline(body), style, bulletText=bullet))
            out.append(Spacer(1, 4))
        else:
            para.append(s)
            i += 1
    flush()
    return title, out


# ------------------------------------------------------------------ сборка


class Doc(BaseDocTemplate):
    def __init__(self, path, doc_title, **kw):
        super().__init__(path, pagesize=A4, title=doc_title, author="team-tracker", **kw)
        self.doc_title = doc_title
        w, h = A4
        self.fw, self.fh = w - 40 * mm, h - 50 * mm
        frame = Frame(20 * mm, 22 * mm, self.fw, self.fh, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(
            [
                PageTemplate(id="title", frames=[frame], onPage=lambda c, d: None),
                PageTemplate(id="main", frames=[frame], onPage=self.decorate),
            ]
        )

    def decorate(self, canv, doc):
        w, h = A4
        canv.saveState()
        canv.setFont("DejaVu", 8)
        canv.setFillColor(MUTED)
        canv.drawString(20 * mm, h - 14 * mm, f"team-tracker · {self.doc_title}")
        canv.drawRightString(w - 20 * mm, h - 14 * mm, f"версия {VERSION} · {TODAY}")
        canv.setStrokeColor(GRID)
        canv.setLineWidth(0.4)
        canv.line(20 * mm, h - 16.5 * mm, w - 20 * mm, h - 16.5 * mm)
        canv.line(20 * mm, 16 * mm, w - 20 * mm, 16 * mm)
        canv.drawCentredString(w / 2, 11 * mm, f"Страница {doc.page}")
        canv.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("h1", "h2"):
            level = 0 if flowable.style.name == "h1" else 1
            text = flowable.getPlainText()
            key = f"h{self.seq.nextf('toc')}"
            self.canv.bookmarkPage(key)
            self.notify("TOCEntry", (level, text, self.page, key))


def build(src, dst, st):
    md = (DOCS / src).read_text(encoding="utf-8")
    probe = Doc(str(dst), "")
    title, body = markdown_to_flowables(md, st, probe.fw, probe.fh)
    doc = Doc(str(dst), title)
    toc = TableOfContents()
    toc.levelStyles = [st["toc0"], st["toc1"]]
    toc.dotsMinLevel = 0
    story = [
        Spacer(1, 70 * mm),
        Paragraph("team-tracker", st["title"]),
        Spacer(1, 8 * mm),
        Paragraph(title.replace("team-tracker", "").strip() or title, st["subtitle"]),
        Spacer(1, 6 * mm),
        Paragraph("Трекер задач и спринтов для команд разработки", st["meta"]),
        Spacer(1, 40 * mm),
        Paragraph(f"Версия {VERSION} · {TODAY}", st["meta"]),
        Paragraph("Статус: в разработке", st["meta"]),
        NextPageTemplate("main"),
        PageBreak(),
        Paragraph("Содержание", st["toc_title"]),
        toc,
        PageBreak(),
    ] + body
    doc.multiBuild(story)
    return doc.page


def main():
    register_fonts()
    OUT.mkdir(parents=True, exist_ok=True)
    st = styles()
    for src, dst in BOOKS:
        pages = build(src, OUT / dst, st)
        print(f"{dst}: {pages} стр.")


if __name__ == "__main__":
    main()
