#!/usr/bin/env python3
"""
Either env-variable COCALC_THEME is 'cocalc' (default) or 'kucalc', or a path to a theme file.
"""

import os

DEFAULT = 'cocalc'
THEME = os.environ.get('COCALC_THEME', DEFAULT)
# where symlink is set
target = 'smc-util/theme.coffee'

print(f"cocalc_setup_theme: THEME = {THEME}")

if os.path.exists(target):
    os.unlink(target)

if THEME == DEFAULT:
    os.system(f"cp -l smc-util/theme-cocalc.coffee {target}")
elif THEME == 'kucalc':
    os.system(f"cp -l smc-util/theme-kucalc.coffee {target}")
else:
    print(f"attempting to hardlink file '{THEME}' to {target}")
    os.system(f"cp -l '{THEME}' {target}")
