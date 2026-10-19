# -*- coding: utf-8 -*-
"""Render PDF pages to PNG for QA."""
import fitz
import glob
import os

PDF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "output", "pdf", "PulseIM-技术架构文档.pdf")
TMP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "tmp", "pdfs")

for f in glob.glob(os.path.join(TMP, "page-*.png")):
    os.remove(f)

doc = fitz.open(PDF)
print("pages:", doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=110)
    pix.save(os.path.join(TMP, "page-%02d.png" % (i + 1)))
print("rendered ok")
