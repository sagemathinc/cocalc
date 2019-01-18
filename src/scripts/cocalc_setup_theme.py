#!/usr/bin/env python3
"""
Either env-variable COCALC_THEME is 'cocalc' (default) or 'kucalc', or a path to a theme file.
"""

import os

DEFAULT = 'cocalc'
THEME = os.environ.get('COCALC_THEME', DEFAULT)

print(f"cocalc_setup_theme: THEME = {THEME}")

os.unlink('smc-util/theme.coffee')

if THEME == DEFAULT:
    os.system("cp -l smc-util/theme-cocalc.coffee smc-util/theme.coffee")
elif THEME == 'kucalc':
    os.system("cp -l smc-util/theme-kucalc.coffee smc-util/theme.coffee")
else:
    print("attempting to hardlink file '{THEME}' to smc-util/theme.coffee")
    os.system("cp -l '{THEME}' smc-util/theme.coffee")
