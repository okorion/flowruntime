# Diagram font

The README SVGs embed a character subset of **Noto Sans KR**, distributed under
the [SIL Open Font License 1.1](OFL.txt). The font's copyright and naming metadata
are preserved in the WOFF2 file.

Source family: https://github.com/notofonts/noto-cjk/tree/main/Sans

`flowruntime-sans.woff2` includes the characters used by the diagram generator.
When adding new text, regenerate it with `scripts/subset-diagram-font.py`, then
run `node scripts/render-doc-diagrams.mjs`. The SVGs embed this font directly so
GitHub image rendering does not depend on fonts installed on the reader's PC.
The app's runtime dependencies are unchanged.
