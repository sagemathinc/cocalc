#!/usr/bin/env python
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

from __future__ import absolute_import
import json, os, sys
from .py23 import cPickle, text_type
from uuid import uuid4

MARKERS = {'cell': u"\uFE20", 'output': u"\uFE21"}


def uuid():
    return text_type(uuid4())


def process_html(html):
    if '"div-interact-1"' in html:
        # probably an interact
        return ""
    else:
        return html


def process_output(s):
    s = s.strip()
    if not s:
        return []
    i = s.find("Traceback (most recent call last):")
    if i != -1:
        s0 = s[:i]
        s1 = s[i:]
        if s0:
            return [{'stdout': s0}, {'stderr': s1}]
        else:
            return [{'stderr': s1}]
    else:
        return [{'stdout': s}]


DISPLAY_MATH = {
    'open': '<html><script type=\"math/tex; mode=display\">',
    'close': '</script></html>',
    'display': True
}
INLINE_MATH = {
    'open': '<html><script type=\"math/tex\">',
    'close': '</script></html>',
    'display': False
}
INLINE_MATH_2009 = {
    'open': '<html><span class=\"math\">',
    'close': '</span></html>',
    'display': False
}
HTML = {'open': '<html>', 'close': '</html>'}
mnames = ['DISPLAY_MATH', 'INLINE_MATH', 'INLINE_MATH_2009']


def output_messages(output):
    messages = []

    while len(output) > 0:
        found = False
        for ii, marker in enumerate(
            [DISPLAY_MATH, INLINE_MATH, INLINE_MATH_2009]):
            i = output.find(marker['open'])
            if i != -1:
                #print('found',mnames[ii])
                messages.extend(process_output(output[:i]))
                j = output.find(marker['close'])
                if j != -1:
                    messages.append({
                        'tex': {
                            'tex': output[i + len(marker['open']):j],
                            'display': marker['display']
                        }
                    })
                    output = output[j + len(marker['close']):]
                    found = True
                    break
        if found: continue

        i = output.find(HTML['open'])
        if i != -1:
            messages.extend(process_output(output[:i]))
            j = output.find(HTML['close'])
            if j != -1:
                messages.append(
                    {'html': process_html(output[i + len(HTML['open']):j])})
                output = output[j + len(HTML['close']):]
                continue

        messages.extend(process_output(output))
        output = ''

    return MARKERS['output'].join(text_type(json.dumps(x)) for x in messages)


def migrate_input(s):
    # Given the input to a cell, possibly make modifications heuristically to it to make it more
    # Sagemath Cloud friendly.
    return s


def sws_body_to_sagews(body):

    out = u""
    i = 0
    while i != -1 and i < len(body):
        j = body.find("{{{", i)
        if j == -1:
            j = len(body)
        html = body[i:j]
        k = body.find("\n", j + 3)
        if k == -1:
            break
        k2 = body.find("///", k)
        if k2 == -1:
            output = ""
            k2 = body.find("}}}", k)
            if k2 == -1:
                input = ""
                k2 = len(body)
                i = len(body)
            else:
                input = body[k + 1:k2]
                i = k2 + 4
        else:
            input = body[k + 1:k2]
            k3 = body.find("}}}", k2 + 4)
            if k3 == -1:
                output = ""
                i = len(body)
            else:
                output = body[k2 + 4:k3]
                i = k3 + 4

        html = text_type(html.strip(), encoding='utf8')
        input = text_type(migrate_input(input.strip()), encoding='utf8')
        output = text_type(output.strip(), encoding='utf8')

        if html:
            out += MARKERS['cell'] + uuid() + 'i' + MARKERS['cell'] + u'\n'
            out += '%html\n'
            out += html + u'\n'
            out += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                    json.dumps({'html': html}) + MARKERS['output']) + u'\n'

        if input or output:
            modes = ''
            if '%auto' in input:
                modes += 'a'
            if '%hide' in input:
                modes += 'i'
            if '%hideall' in input:
                modes += 'o'
            out += MARKERS['cell'] + uuid() + modes + MARKERS['cell'] + u'\n'
            out += input
            out += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                    output_messages(output) + MARKERS['output']) + u'\n'

    return out


def extra_modes(meta):
    s = ''
    if 'pretty_print' in meta:
        s += u'typeset_mode(True, display=False)\n'
    if 'system' in meta and meta['system'] != 'sage':
        s += u'%%default_mode %s\n' % meta['system']
    if not s:
        return ''
    # The 'a' means "auto".
    return MARKERS['cell'] + uuid() + 'a' + MARKERS['cell'] + u'\n%auto\n' + s


def write_data_files(t, pfx='sage_worksheet'):
    prefix = '{}/data/'.format(pfx)
    data = [p for p in t if p.startswith(prefix)]
    out = []
    target = "foo.data"
    if data:
        if not os.path.exists(target):
            os.makedirs(target)
        for p in data:
            dest = os.path.join(target, p[len(prefix):])
            out.append(dest)
            open(dest, 'wb').write(t.extractfile(p).read())
    return out, target


def sws_to_sagews(filename):
    """
    Convert a Sage Notebook sws file to a SageMath Cloud sagews file.

    INPUT:
    - ``filename`` -- the name of an sws file, say foo.sws

    OUTPUT:
    - creates a file foo[-n].sagews  and returns the name of the output file

    .. NOTE::

        sws files from around 2009 are bzip2 archives with the following layout:
            19/worksheet.txt
            19/data/
            19/conf.sobj
            19/snapshots/1252938265.bz2
            19/snapshots/1252940938.bz2
            19/snapshots/1252940986.bz2
            19/code/
            19/cells/
            19/cells/13/
            19/cells/14/
            ...
        sws files from 2012  and later have a layout like this:
            sage_worksheet/worksheet_conf.pickle
            sage_worksheet/worksheet.html
            sage_worksheet/worksheet.txt
            sage_worksheet/data/fcla.css 

    """
    out = ''

    import os, tarfile
    t = tarfile.open(name=filename, mode='r:bz2', bufsize=10240)
    tfiles = t.getnames()
    fmt_2011 = True
    if 'sage_worksheet/worksheet.html' in tfiles:
        pfx = 'sage_worksheet'
        wkfile = 'sage_worksheet/worksheet.html'
    else:
        # older format files will not have 'sage_worksheet' at top level
        pfx = tfiles[0]
        wkfile = os.path.join(pfx, 'worksheet.txt')
        if wkfile in tfiles:
            fmt_2011 = False  # 2009 format
        else:
            raise ValueError(
                'could not find sage_worksheet/worksheet.html or {} in {}'.
                format(wkfile, filename))

    body = t.extractfile(wkfile).read()
    data_files, data_path = write_data_files(pfx, t)
    if data_files:
        out += MARKERS['cell'] + uuid() + 'ai' + MARKERS[
            'cell'] + u'\n%%hide\n%%auto\nDATA="%s/"\n' % data_path
    out += sws_body_to_sagews(body)

    meta = {}
    if fmt_2011:
        try:
            meta = cPickle.loads(
                t.extractfile('sage_worksheet/worksheet_conf.pickle').read())
        except KeyError:
            if INLINE_MATH['open'] in body:
                meta['pretty_print'] = True
    else:
        if INLINE_MATH_2009['open'] in body:
            meta['pretty_print'] = True
    out = extra_modes(meta) + out

    base = os.path.splitext(filename)[0]
    i = 0
    outfile = base + '.sagews'
    if os.path.exists(outfile):
        sys.stderr.write(
            "%s: Warning --Sagemath cloud worksheet '%s' already exists.  Not overwriting.\n"
            % (sys.argv[0], outfile))
        sys.stderr.flush()
    else:
        sys.stdout.write("%s: Creating Sagemath cloud worksheet '%s'\n" %
                         (sys.argv[0], outfile))
        sys.stdout.flush()
        open(outfile, 'w').write(out.encode('utf8'))


def main():
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Sage Notebook sws file to a SageMath Cloud sagews file.

    Usage: %s path/to/filename.sws [path/to/filename2.sws] ...

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
Also, a data/ directory may be created in the current directory, which contains
the contents of the data path in filename.sws.
""" % sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        sws_to_sagews(path)


if __name__ == "__main__":
    main()
