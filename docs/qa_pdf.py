# -*- coding: utf-8 -*-
"""Programmatic QA for the generated PDF."""
import os
import fitz
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "output", "pdf", "PulseIM-技术架构文档.pdf")

doc = fitz.open(PDF)
print("== pages ==", doc.page_count)

full = ""
for i, page in enumerate(doc):
    t = page.get_text()
    full += t
    first = " ".join(t.split())[:90].encode("ascii", "replace").decode()
    print("p%02d [%s]" % (i + 1, first))

print("\n== key sections ==")
for kw in ["技术栈总览", "系统整体架构", "IM 实时通信详细设计", "消息发送链路",
           "前端架构", "数据存储设计", "部署架构", "认证与安全", "并发能力与容量",
           "附录 A", "Nginx 接入层", "Redis Stream", "批量消费者", "pulse:im:push"]:
    print(("OK  " if kw in full else "MISS"), kw)

print("\n== glyph sanity ==")
print("replacement chars:", full.count("\ufffd"))
print("lone '?' count:", full.count("?") - full.count("？"))

print("\n== overflow check (words beyond margins) ==")
issues = 0
with pdfplumber.open(PDF) as pdf:
    for i, page in enumerate(pdf.pages):
        W = page.width
        for w in page.extract_words():
            if w["x1"] > W - 20 or w["x0"] < 20:
                issues += 1
                if issues <= 5:
                    print("p%d word out of bounds: %r x1=%.1f" % (i + 1, w["text"], w["x1"]))
print("overflow issues:", issues)

print("\n== drawing check ==")
p3 = doc[2].get_drawings()
p5 = doc[4].get_drawings()
print("page3 vector items:", len(p3), "| page5 vector items:", len(p5))

print("\n== TOC page ==")
toc_text = doc[1].get_text()
print("目录" in toc_text, "并发能力与容量" in toc_text)
