#!/usr/bin/env python

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

import json, sys
from uuid import uuid4
def uuid():
    return unicode(uuid4())

# Conversion
def sws_body_to_sagews(body):

    out = u""
    i = 0
    while i!=-1 and i <len(body):
        j = body.find("{{{", i)
        if j == -1:
            j = len(body)
        html = body[i:j]
        k = body.find("\n", j+3)
        if k == -1:
            break
        k2 = body.find("///", k)
        if k2 == -1:
            output = ""
            k2 = body.find("}}}", k)
            if k2 == -1:
                input = ""
                k2 = len(body)
            else:
                input = body[k+1:k2]
            i = k2+1
        else:
            input = body[k+1:k2]
            k3 = body.find("}}}", k2+4)
            if k3 == -1:
                output = ""
                i = len(body)
            else:
                output = body[k2+4:k3]
                i = k3+1

        html   = unicode(html.strip())
        input  = unicode(input.strip())
        output = unicode(output.strip())
        if False and len(html) > 0:  # totally broken
            out += u'\n' + MARKERS['cell'] + uuid() + 'i' + MARKERS['cell'] + u'\n'
            out += '%html\n'
            out += html + u'\n'
            out += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                    json.dumps({'html':html}) + MARKERS['output']) + u'\n'

        if out != "":
            out += u'\n'
        out += MARKERS['cell'] + uuid() + MARKERS['cell'] + u'\n'
        out += input
        if len(output) > 0:
            out += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                    json.dumps({'stdout':output}) + MARKERS['output'])

    return out

def sws_to_sagews(filename):
    """
    Convert a Sage Notebook sws file to a SageMath Cloud sagews file.

    INPUT:
    - ``filename`` -- the name of an sws file, say foo.sws

    OUTPUT:
    - creates a file foo[-n].sagews  and returns the name of the output file
    """
    import os, tarfile
    t = tarfile.open(name=filename, mode='r:bz2', bufsize=10240)
    body = t.extractfile('sage_worksheet/worksheet.html').read()
    out = sws_body_to_sagews(body)
    base = os.path.splitext(filename)[0]
    i = 0
    outfile = base + '.sagews'
    if os.path.exists(outfile):
        sys.stderr.write("%s: Sagemath cloud worksheet '%s' already exists.  Not overwriting.\n"%(sys.argv[0], outfile))
        sys.stderr.flush()
    else:
        sys.stdout.write("%s: Creating Sagemath cloud worksheet '%s'\n"%(sys.argv[0], outfile))
        sys.stdout.flush()
        open(outfile,'w').write(out.encode('utf8'))



if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Sage Notebook sws file to a SageMath Cloud sagews file.

    Usage: %s path/to/filename.sws

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
Also, a data/ directory may be created in the current directory, which contains
the contents of the data path in filename.sws.
"""%sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        sws_to_sagews(path)








