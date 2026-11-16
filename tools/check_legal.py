"""Verify every original paragraph against its published HTML, plus legal links."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
from build_legal import DOCUMENTS, ROOT, paragraphs


class LegalParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_article = False
        self.block = None
        self.blocks = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article':
            self.in_article = True
        if tag == 'a':
            self.links.append(attrs.get('href'))
        if self.in_article and tag in ('h1', 'h2', 'p'):
            self.block = ''
        if self.block is not None and tag == 'br':
            self.block += '\n'

    def handle_endtag(self, tag):
        if tag == 'article':
            self.in_article = False
        if self.block is not None and tag in ('h1', 'h2', 'p'):
            self.blocks.append(self.block)
            self.block = None

    def handle_data(self, data):
        if self.block is not None:
            self.block += data


def check():
    manifest = json.loads((ROOT / 'site/legal-manifest.json').read_text())
    total = 0
    for slug, (filename, title) in DOCUMENTS.items():
        original = paragraphs(ROOT / filename)
        page = (ROOT / 'site' / f'{slug}.html').read_text()
        parser = LegalParser()
        parser.feed(page)
        assert parser.blocks[:len(original)] == original, f'Text differs from original: {slug}'
        assert len(parser.blocks) == len(original) + (1 if slug == 'requisites' else 0)
        assert f'<title>{title} - HEN HÃO</title>' in page
        for target in DOCUMENTS:
            assert f'/{target}.html' in parser.links
        assert hashlib.sha256(page.encode()).hexdigest() == manifest[slug]['html_sha256']
        assert hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == manifest[slug]['source_sha256']
        total += len(original)
    for filename in ('index.html', '404.html'):
        page = (ROOT / 'site' / filename).read_text()
        parser = LegalParser()
        parser.feed(page)
        for target in DOCUMENTS:
            assert f'/{target}.html' in parser.links
    index = (ROOT / 'site/index.html').read_text()
    for name in ('consent', 'privacy_acknowledged'):
        checkbox = re.search(r'<input[^>]*name="' + name + r'"[^>]*>', index).group()
        assert 'required' in checkbox and ' checked' not in checkbox
    for slug in ('consent', 'privacy'):
        assert f'data-{slug}-version="{manifest[slug]["version"]}"' in index
        assert f'data-{slug}-document-id="{manifest[slug]["document_id"]}"' in index
    print(f'OK: {total} original paragraphs preserved; 4 documents, hashes, 6 footers and consent metadata verified.')


if __name__ == '__main__':
    check()
