# Based on See https://gist.github.com/damianavila/5305869

import sys, io, os
from nbformat.v4 import reads, writes

def remove_outputs(nb):
    """
    Remove the outputs from a notebook.
    """
    for cell in nb.cells:
        if cell.cell_type == 'code':
            cell.outputs = []

def main():
    for fname in sys.argv[1:]:
        nb = reads(io.open(fname, 'r').read())
        remove_outputs(nb)
        base, ext = os.path.splitext(fname)
        new_ipynb = "%s-no-output%s" % (base, ext)
        io.open(new_ipynb, 'w', encoding='utf8').write(writes(nb))

if __name__ == "__main__":
    main()