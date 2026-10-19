"""Split TT2020 style fonts into one font per glyph variant.

TT2020 picks among 9 versions of each glyph with OpenType contextual
alternates. The app draws every character on its own, so contextual
alternates never fire. Instead we bake each variant into its own small
font by pointing the cmap at that variant's glyphs.

Usage: python3 scripts/split_tt2020.py  (reads fonts-src/, writes public/fonts/tt2020/)
"""
import os
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = os.path.join(os.path.dirname(__file__), '..', 'fonts-src')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts', 'tt2020')
STYLES = ['B', 'D', 'E']

def variant_maps(font):
    """The 8 single-substitution lookups that each map every glyph to one alternate."""
    gsub = font['GSUB'].table
    maps = [l.SubTable[0].mapping for l in gsub.LookupList.Lookup
            if l.LookupType == 1 and len(l.SubTable[0].mapping) > 100]
    assert len(maps) == 8, len(maps)
    return maps

os.makedirs(OUT, exist_ok=True)
for style in STYLES:
    src = os.path.join(SRC, f'TT2020Style{style}.woff2')
    maps = [None] + variant_maps(TTFont(src))
    for v, mapping in enumerate(maps):
        font = TTFont(src)
        cmap = font.getBestCmap()
        if mapping:
            for table in font['cmap'].tables:
                if table.isUnicode():
                    table.cmap = {u: mapping.get(g, g) for u, g in table.cmap.items()}
        keep = sorted(set(font.getBestCmap().values()))
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = []
        opts.notdef_outline = True
        opts.name_IDs = ['*']
        sub = subset.Subsetter(opts)
        sub.populate(glyphs=keep, unicodes=list(cmap.keys()))
        sub.subset(font)
        if 'GSUB' in font:
            del font['GSUB']
        path = os.path.join(OUT, f'TT2020{style}-{v}.woff2')
        font.flavor = 'woff2'
        font.save(path)
        print(path, os.path.getsize(path))
