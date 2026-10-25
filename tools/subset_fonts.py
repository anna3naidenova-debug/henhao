#!/usr/bin/env python3
"""
Пересборка шрифтов сайта.
Запуск из папки проекта:  python3 tools/subset_fonts.py
Нужен fonttools:          pip3 install fonttools brotli

Иероглифы собираются автоматически из всех .html и .js сайта (включая site.config.js),
поэтому после добавления нового иероглифа просто перезапустите скрипт.
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SRC = ROOT / "tools" / "fonts-src"
OUT = SITE / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

text = ""
for p in list(SITE.rglob("*.html")) + list(SITE.rglob("*.js")):
    if p.name == "qrcode.js":
        continue
    text += p.read_text(encoding="utf-8")
cjk = sorted(set(re.findall(r"[⺀-鿿　-〿＀-￯]", text)))
cjk_str = "".join(cjk)
print("Иероглифы и знаки на сайте (%d): %s" % (len(cjk), cjk_str))

LATIN_CYR = ",".join([
    "U+0020-007E", "U+00A0-00FF", "U+0100-017F", "U+01CD-01DC",  # латиница + пиньинь (ǎ ǐ ǒ ǔ ǖ ǘ ǚ ǜ)
    "U+0300-0304", "U+030C",                                     # комбинируемые тоны
    "U+0400-045F", "U+0490-0491", "U+2010-2027", "U+202F", "U+2030-203A",
    "U+20AC", "U+20BD", "U+2116", "U+2190-2193", "U+2248", "U+00A5",
])

def run(src, out, unicodes=None, text=None):
    cmd = [sys.executable, "-m", "fontTools.subset", str(SRC / src), "--flavor=woff2",
           "--output-file=" + str(OUT / out), "--layout-features=*", "--no-hinting", "--desubroutinize"]
    if unicodes: cmd.append("--unicodes=" + unicodes)
    if text: cmd.append("--text=" + text)
    subprocess.run(cmd, check=True)
    print("  %-20s %6.1f КБ" % (out, (OUT / out).stat().st_size / 1024))

run("Unbounded.ttf", "unbounded.woff2", unicodes=LATIN_CYR)
run("Onest.ttf", "onest.woff2", unicodes=LATIN_CYR)
run("Caveat.ttf", "caveat.woff2", unicodes=LATIN_CYR)
run("NotoSansSC.ttf", "notosanssc.woff2", text=cjk_str + "0123456789+=!?.,")
run("ZhiMangXing.ttf", "zhimangxing.woff2", text=cjk_str)
print("Готово.")
