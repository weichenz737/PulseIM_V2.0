# -*- coding: utf-8 -*-
import os
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "output", "pdf", "PulseIM-技术架构文档.pdf")

with pdfplumber.open(PDF) as pdf:
    page = pdf.pages[7]
    lines = {}
    for w in page.extract_words():
        key = round(w["top"], 0)
        lines.setdefault(key, []).append(w)
    # 表格区域 (top 380-570) 的行边界
    for key in sorted(lines):
        if 380 <= key <= 560:
            words = sorted(lines[key], key=lambda x: x["x0"])
            print("top=%.0f x[%.0f..%.0f] %s" % (key, words[0]["x0"], words[-1]["x1"],
                  " ".join(x["text"] for x in words)[:80]))
    print("---- full-width lines near table ----")
    for key in sorted(lines):
        if 380 <= key <= 560:
            words = sorted(lines[key], key=lambda x: x["x0"])
            if words[-1]["x1"] > 545:
                print("top=%.0f RIGHT=%.1f" % (key, words[-1]["x1"]))
