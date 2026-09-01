# -*- coding: utf-8 -*-
from docx import Document
doc = Document('/home/z/my-project/upload/دستورالعمل کدگذاری محصولات 3.docx')

out = []
# iterate through body elements in order
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn

def iter_block_items(parent):
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)

for block in iter_block_items(doc):
    if isinstance(block, Paragraph):
        t = block.text.strip()
        if t:
            out.append(t)
    else:
        out.append('--- TABLE ---')
        for row in block.rows:
            cells = [c.text.strip().replace('\n', ' / ') for c in row.cells]
            out.append(' | '.join(cells))
        out.append('--- END TABLE ---')

text = '\n'.join(out)
with open('/home/z/my-project/tool-results/docx_extracted.txt', 'w', encoding='utf-8') as f:
    f.write(text)
print('chars:', len(text))
print('lines:', len(out))
