"""Build the embedded diagram font from Noto Sans KR (SIL OFL 1.1).

Documentation tooling only: fonttools==4.60.1, brotli==1.1.0.
Usage: python scripts/subset-diagram-font.py /path/to/NotoSansKR-VF.ttf
Then run: node scripts/render-doc-diagrams.mjs
"""
import sys
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
options = subset.Options()
options.flavor = 'woff2'
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
font = subset.load_font(sys.argv[1], options)
subsetter = subset.Subsetter(options=options)
text = (root / 'scripts/render-doc-diagrams.mjs').read_text(encoding='utf-8')
subsetter.populate(text=text + ''.join(chr(i) for i in range(32, 127)))
subsetter.subset(font)
subset.save_font(font, str(root / 'docs/fonts/flowruntime-sans.woff2'), options)
