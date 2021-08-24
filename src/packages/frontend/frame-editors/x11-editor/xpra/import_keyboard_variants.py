# This is a little stand-alone support script to import all
# *keyboard variants* from a global linux config file.
# Hence this only works in Linux, and in particular only tested on Ubuntu 18.04
# The output is only useful to insert into keyboards.ts.
#
# Usage: $ python3 import_keyboard_variants.py  > tmp
#        and then copy/paste the content of tmp into keyboards.ts for "keyboard_variants" and reformat the file

from pprint import pprint
from collections import defaultdict
import re
spaces = re.compile(r'\s+')
import json

fn = '/usr/share/X11/xkb/rules/evdev.lst'
variants = defaultdict(list)

reading_variants = False


def parse(line):
    # line: 'extd            gb: English (UK, extended, with Win keys)'
    data, descr = line.split(':')  # exactly 2 or fail
    name, lang = spaces.split(data)  # --"--
    descr = descr.strip()
    # extract info between brackets, if there is one
    if '(' in descr:
        descr = descr.split('(', 1)[1].rsplit(')', 1)[0]
    variants[lang].append({'value': name, 'display': descr})


with open(fn) as input:
    for line in input:
        line = line.strip()
        if line == '! variant':
            reading_variants = True
            continue
        if reading_variants and len(line) == 0:
            reading_variants = False
            break
        if not reading_variants:
            continue
        parse(line)

# sort
for k ,v in variants.items():
    v = sorted(v, key = lambda x : x['display'].lower())
    variants[k] = v


print(json.dumps(variants, indent=2))
