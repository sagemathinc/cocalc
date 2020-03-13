#!/usr/bin/python
"""
Convert ipynb files to pdf using nbconvert's html generating
and headless chromium, instead of using LaTeX.  This is much
faster and more reliable, but potentially doesn't "look" as good,
depending on your tastes.  It also has a dependency on chromium.
"""

import os, sys, time


def cmd(s):
    print(s)
    sys.stdout.flush()
    if os.system(s):
        raise RuntimeError("ERROR: failed to run '%s'" % s)


def ipynb_to_pdf(path):
    t = time.time()
    print("-" * 70)
    print("Convert %s..." % path)
    if not path.endswith('.ipynb'):
        raise ValueError("every path must end in '.ipynb' but '%s' does not" %
                    (path))
    path = os.path.abspath(path)
    base = path[:-len('ipynb')]
    pdf = base + 'pdf'
    html = base + 'tmp.html'
    cmd("time jupyter nbconvert %s --to html --output=%s" % (path, html))
    cmd('time chromium-browser --headless --disable-gpu --print-to-pdf="%s" --run-all-compositor-stages-before-draw   --virtual-time-budget=10000 %s'
        % (pdf, html))
    os.unlink(html)
    print("Converted %s to %s in %s seconds" % (path, pdf, time.time() - t))
    print("-" * 70)


def main():
    if len(sys.argv) == 1:
        print("Usage: cc-ipynb-to-pdf [filename1.ipynb] [filename2.ipynb] ...")
        print(
            "Converts filename1.ipynb to filename1.pdf, etc., using nbconvert first"
        )
        print(
            "to convert to HTML, then using headless chromium to convert that to PDF."
        )
        print(
            "This is *vastly* more robust and faster than  using nbconvert directly,"
        )
        print("since that uses LaTeX.")
    else:
        for path in sys.argv[1:]:
            ipynb_to_pdf(path)


if __name__ == "__main__":
    main()
