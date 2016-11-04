#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



"""
This script runs tests to verify that a given SMC machine has all claimed software installed, and that it maybe
even works a little bit.
"""

import math, os, sys, time
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
    shapely  # for the Shapely package
    simpy
    xlrd xlwt
    pyproj
    bitarray
    h5py
    netCDF4
    patsy
    lxml
    munkres
    oct2py
    psutil
    plotly
    mahotas
    snappy
    scimath
    rpy2
    neuron
    mpl_toolkits.basemap
    Bio
    brian
    Gnuplot
    guppy
    nose
    nzmath
    pybtex
    CryptoPlus
    pyx
    zmq
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
            sys.stdout.write(" (%s seconds)"%(int(time.time()-t0)))
            if a:
                print "FAIL!: %s"%a
            else:
                print


if __name__ == "__main__":
    main()