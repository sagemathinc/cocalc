#!/usr/bin/env python

"""
This script runs tests to verify that a given SMC machine has all claimed software installed, and that it maybe
even works a little bit.
"""

import os, sys, time
from subprocess import Popen, PIPE


def test_atlas():
    for f in ['libatlas.so', 'libcblas.so', 'libf77blas.so']:
        if not os.path.exists('/usr/lib/%s'%f):
            return "/usr/lib/%s doesn't exists"%f

def test_sage_packages():
    imports = """
    h5py
    clawpack
    tornado
    virtualenv
    pandas
    statsmodels
    numexpr
    tables
    sklearn  # this is for scikit-learn
    theano
    scikits-image
    Shapely
    SimPy
    xlrd xlwt
    pyproj
    bitarray
    h5py
    netcdf4
    patsy
    lxml
    munkres
    oct2py
    psutil
    plotly
    mahotas
    snappy
    """
    imports = sum([x.split('#')[0].split() for x in imports.splitlines()],[])

    p = Popen(["sage"], shell=True,  stdin=PIPE, stdout=PIPE, close_fds=True)
    (child_stdout, child_stdin) = (p.stdout, p.stdin)
    child_stdin.write('\n'.join('import %s'%m for m in imports))
    child_stdin.close()
    bad = [out.split()[-1] for out in child_stdout.readlines() if 'No module' in out]
    return ','.join(bad)



def main():
    g = globals()
    for k, t in sorted(g.items()):
        if k.startswith("test_"):
            print k,"...",
            sys.stdout.flush()
            t0 = time.time()
            a = t()
            sys.stdout.write(" (%s seconds)"%(time.time()-t0))
            if a:
                print "FAIL!: %s"%a
            else:
                print


if __name__ == "__main__":
    main()