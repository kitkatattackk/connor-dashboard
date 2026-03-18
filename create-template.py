#!/usr/bin/env python3
"""
create-template.py
Reads the original Markel docx and rewrites document.xml to use
docxtemplater placeholder syntax. Saves to assets/recap-template.docx.

Run once: python3 create-template.py
"""
import zipfile, shutil, os, sys, re

SRC  = '/Users/connor/Downloads/Markel_GaugeQuality_Session_One_GQ_Admin_Only.docx'
DEST = os.path.join(os.path.dirname(__file__), 'assets', 'recap-template.docx')

os.makedirs(os.path.dirname(DEST), exist_ok=True)

# ── helpers ──────────────────────────────────────────────────────────────────

def ctrl_para(tag):
    """Minimal paragraph that holds a docxtemplater loop/close tag."""
    return f'<w:p><w:r><w:t>{tag}</w:t></w:r></w:p>'

def set_para_text(para_xml, new_text):
    """
    Keep <w:pPr> intact.
    Keep the FIRST <w:rPr> intact.
    Replace all content with a single <w:r> carrying new_text.
    """
    # Extract pPr block (may be absent)
    ppr_m = re.search(r'(<w:pPr>.*?</w:pPr>)', para_xml, re.DOTALL)
    ppr   = ppr_m.group(1) if ppr_m else ''

    # Extract first rPr block
    rpr_m = re.search(r'(<w:rPr>.*?</w:rPr>)', para_xml, re.DOTALL)
    rpr   = rpr_m.group(1) if rpr_m else ''

    # Escape XML special chars in new_text
    esc = new_text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

    # Build <w:t>: add xml:space="preserve" so leading/trailing spaces survive
    t_attr = ' xml:space="preserve"' if (esc.startswith(' ') or esc.endswith(' ') or '  ' in esc) else ''
    wt = f'<w:t{t_attr}>{esc}</w:t>'

    # Re-extract the opening <w:p ...> tag (attributes only)
    open_m = re.match(r'(<w:p\b[^>]*>)', para_xml)
    open_tag = open_m.group(1) if open_m else '<w:p>'

    return f'{open_tag}{ppr}<w:r>{rpr}{wt}</w:r></w:p>'

# ── read source paragraphs ────────────────────────────────────────────────────

with zipfile.ZipFile(SRC, 'r') as zin:
    raw_xml = zin.read('word/document.xml').decode('utf-8')

# Split body into paragraphs (keep sectPr separately)
# We work on the <w:body>...</w:body> content
body_m = re.search(r'<w:body>(.*)</w:body>', raw_xml, re.DOTALL)
if not body_m:
    sys.exit('ERROR: could not find <w:body> in document.xml')

body_inner = body_m.group(1)

# Split into individual <w:p .../> or <w:p ...>...</w:p> blocks + sectPr
# Strategy: tokenize on top-level elements
tokens = re.findall(r'<w:p[\s>].*?</w:p>|<w:sectPr>.*?</w:sectPr>', body_inner, re.DOTALL)

paras  = [t for t in tokens if t.startswith('<w:p')]
sectPr = next((t for t in tokens if t.startswith('<w:sectPr')), '')

print(f'Total paragraphs found: {len(paras)}')

# ── template XML for each paragraph style ────────────────────────────────────
# These are taken verbatim from the extracted XML snippets in the spec.

# Section heading: larger (16pt), bold, dark navy color, generous spacing above/below
SECTION_HEADING_XML = '<w:p w14:paraId="44000001" w14:textId="44000002" w:rsidR="00FF0008" w:rsidRDefault="00FF0008" w:rsidP="00371342"><w:pPr><w:spacing w:before="320" w:after="100" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:b/><w:bCs/><w:color w:val="1B3A6B"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:b/><w:bCs/><w:color w:val="1B3A6B"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>Session Overview</w:t></w:r></w:p>'

# Bullet: normal weight (not bold), 12pt, relaxed line + item spacing
BULLET_XML = '<w:p w14:paraId="4400000E" w14:textId="4400000F" w:rsidR="00FF0008" w:rsidRDefault="00FF0008" w:rsidP="00FF0008"><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="89"/></w:numPr><w:spacing w:before="40" w:after="100" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:color w:val="auto"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Target score confirmed and adjustable at any time</w:t></w:r></w:p>'

# Owner label: bold, 13pt, dark navy, space above to separate groups
OWNER_XML = '<w:p w14:paraId="440000A3" w14:textId="440000A4" w:rsidR="00FF0008" w:rsidRDefault="00FF0008" w:rsidP="00FF0008"><w:pPr><w:spacing w:before="200" w:after="60" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:b/><w:bCs/><w:color w:val="1B3A6B"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Barlow" w:eastAsia="Times New Roman" w:hAnsi="Barlow" w:cs="Times New Roman"/><w:b/><w:bCs/><w:color w:val="1B3A6B"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>Christopher to:</w:t></w:r></w:p>'

# ── build template paragraph list ─────────────────────────────────────────────
# Paragraph indices are 0-based per the spec.

def p(idx):
    """Return original paragraph at index (with bounds check)."""
    if idx >= len(paras):
        print(f'WARNING: paragraph index {idx} out of range (only {len(paras)} paras)')
        return paras[-1]
    return paras[idx]

out = []

# 0-14 unchanged (logos/images/decorative)
for i in range(15):
    out.append(p(i))

# 15 → title
out.append(set_para_text(p(15), '{session_type}  Overview  |  {session_label}'))

# 16 → client
out.append(set_para_text(p(16), '{client}'))

# 17 → date
out.append(set_para_text(p(17), '{date}'))

# 18-23 → empty spacers
for i in range(18, 24):
    out.append(p(i))

# 24 → second title block
out.append(set_para_text(p(24), '{session_label}'))

# 25 → second client+date
out.append(set_para_text(p(25), '{client}   {date}'))

# 26-28 unchanged
for i in range(26, 29):
    out.append(p(i))

# Sections loop
out.append(ctrl_para('{#sections}'))
out.append(set_para_text(SECTION_HEADING_XML, '{heading}'))
out.append(ctrl_para('{#bullets}'))
out.append(set_para_text(BULLET_XML, '{.}'))
out.append(ctrl_para('{/bullets}'))
out.append(ctrl_para('{/sections}'))

# Para 113 — "Next Steps" heading (unchanged)
out.append(p(113))

# nextSteps loop
out.append(ctrl_para('{#nextSteps}'))
out.append(set_para_text(OWNER_XML, '{owner}'))
out.append(ctrl_para('{#items}'))
out.append(set_para_text(BULLET_XML, '{.}'))
out.append(ctrl_para('{/items}'))
out.append(ctrl_para('{/nextSteps}'))

# Para 126 — "Key Takeaways" heading (unchanged)
out.append(p(126))

# keyTakeaways loop
out.append(ctrl_para('{#keyTakeaways}'))
out.append(set_para_text(BULLET_XML, '{.}'))
out.append(ctrl_para('{/keyTakeaways}'))

# 133-147 — footer images + GQ support
for i in range(133, min(148, len(paras))):
    out.append(p(i))

# ── reassemble document.xml ───────────────────────────────────────────────────

new_body_inner = '\n'.join(out) + ('\n' + sectPr if sectPr else '')
new_body = raw_xml[:body_m.start(1)] + new_body_inner + raw_xml[body_m.end(1):]

# ── write new docx (copy everything, replace document.xml) ────────────────────

with zipfile.ZipFile(SRC, 'r') as zin, zipfile.ZipFile(DEST, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == 'word/document.xml':
            zout.writestr(item, new_body.encode('utf-8'))
        else:
            zout.writestr(item, zin.read(item.filename))

print(f'Template written to: {DEST}')
print(f'Paragraphs in output: {len(out)}')
