"""Convert the supplied DOCX originals to HTML without rewriting their text.

Run from any directory: python3 tools/build_legal.py
Standard library only. Numbering in these originals is literal text, not Word lists.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import html
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
DOCUMENTS = {
    'privacy': ('Политика_в_отношении_обработки_персональных_данных_HEN_HAO.docx', 'Политика в отношении обработки персональных данных'),
    'consent': ('Согласие_на_обработку_персональных_данных_HEN_HAO.docx', 'Согласие на обработку персональных данных'),
    'offer': ('Публичная_оферта_HEN_HAO.docx', 'Публичная оферта'),
    'requisites': ('Реквизиты_и_сведения_об_исполнителе.docx', 'Реквизиты и сведения об исполнителе'),
}
LINKS = [('privacy', 'Политика обработки персональных данных'),
         ('consent', 'Согласие на обработку персональных данных'),
         ('offer', 'Публичная оферта'), ('requisites', 'Реквизиты')]


def paragraphs(filename):
    with ZipFile(filename) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
    result = []
    for p in root.iter(W + 'p'):
        if p.find(W + 'pPr/' + W + 'numPr') is not None:
            raise ValueError('Word list numbering requires explicit conversion; refusing to drop it')
        text = ''.join((n.text or '') if n.tag == W + 't' else '\n' if n.tag == W + 'br' else ''
                       for n in p.iter())
        if text.strip():
            result.append(text)
    return result


def linked(text):
    pattern = r'https://henhaoschool\.ru/(?:[a-z]+\.html)?|hellohenhaoschool@gmail\.com'
    parts, last = [], 0
    for match in re.finditer(pattern, text):
        parts.append(html.escape(text[last:match.start()]))
        value = match.group()
        href = 'mailto:' + value if '@' in value else value.replace('https://henhaoschool.ru', '')
        parts.append(f'<a href="{href}">{html.escape(value)}</a>')
        last = match.end()
    parts.append(html.escape(text[last:]))
    return ''.join(parts).replace('\n', '<br>')


def footer():
    links = '\n'.join(f'      <a href="/{slug}.html">{label}</a>' for slug, label in LINKS)
    return f'''<footer class="footer footer--document">
  <div class="wrap footer__grid">
    <div class="footer__brand"><a class="footer__name" href="/">Hěn hǎo</a><p>Онлайн-школа китайского из Гуанчжоу</p></div>
    <div class="footer__contacts"><a href="mailto:hellohenhaoschool@gmail.com">hellohenhaoschool@gmail.com</a></div>
    <nav class="footer__legal" aria-label="Юридические документы">
{links}
      <span>© Hěn hǎo, 2026</span>
    </nav>
  </div>
</footer>'''


def build():
    manifest = {}
    for slug, (filename, title) in DOCUMENTS.items():
        source = ROOT / filename
        ps = paragraphs(source)
        body = []
        for index, text in enumerate(ps):
            if index == 0:
                # Accessible page name; source title (including its line breaks) remains intact.
                body.append(f'<h1 aria-label="{html.escape(title)}">{linked(text)}</h1>')
            elif re.match(r'^\d+\. [^\d]', text):
                number = text.split('.')[0]
                body.append(f'<h2 id="section-{number}">{linked(text)}</h2>')
            elif 'Редакция от 16 ноября 2026 года' in text:
                dated = linked(text).replace('16 ноября 2026 года', '<time datetime="2026-11-16">16 ноября 2026 года</time>')
                body.append(f'<p class="legal-page__date">{dated}</p>')
            else:
                body.append(f'<p>{linked(text)}</p>')
        if slug == 'requisites':
            body.append('<p class="legal-page__related"><a href="/offer.html">Публичная оферта</a></p>')
        content = '\n  '.join(body)
        page = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} - HEN HÃO</title>
<meta name="description" content="{title} проекта HEN HÃO. Полный текст документа.">
<link rel="canonical" href="https://henhaoschool.ru/{slug}.html">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
<link rel="stylesheet" href="/assets/css/style.css?v=3">
</head>
<body>
<main class="wrap page-simple legal-page" id="content">
  <a class="legal-page__back" href="/">← На главную</a>
  <article data-legal-document="{slug}">
  {content}
  </article>
</main>
{footer()}
</body>
</html>
'''
        encoded = page.encode('utf-8')
        (ROOT / 'site' / f'{slug}.html').write_bytes(encoded)
        manifest[slug] = {
            'document_id': f'henhao-{slug}',
            'version': '2026-11-16' if slug != 'requisites' else 'source-2026-11-16',
            'url': f'/{slug}.html',
            'html_sha256': hashlib.sha256(encoded).hexdigest(),
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'text_sha256': hashlib.sha256('\n'.join(ps).encode('utf-8')).hexdigest(),
        }
    (ROOT / 'site/legal-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build()
