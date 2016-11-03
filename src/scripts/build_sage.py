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



## DEPRECATED -- not used at all

import os

def cmd(s):
    print s
    if not os.system(s):
        raise RuntimeError("Error executing '%s'"%s)

available_disk = int(os.popen("df /").read().split()[-3])
if available_disk < 5000000:
    raise RuntimeError("There is insufficient disk space to build Sage; ensure 5GB free on /.")

cmd("export MAKE='make -j20'; make; unset MAKE; make")

cmd("rm -rf spkg/build/*")

cmd("echo 'easy_install markdown2' | ./sage -sh")

cmd("./sage -i 4ti2-1.3.2.p1 biopython-1.60 brian-1.2.1.p0 cbc-2.7.5 cluster_seed-1.0 coxeter3-1.1 cryptominisat-2.9.6 cunningham_tables-1.0 database_cremona_ellcurve-20121022 database_gap-4.5.7 database_jones_numfield-v4 database_kohel-20060803 database_odlyzko_zeta database_sloane_oeis-2005-12 database_symbolic_data-20070206 dot2tex-2.8.7-2 gap_packages-4.5.7 gmpy-1.0.1 gnuplotpy-1.8 guppy-0.1.8 kash3-2008-07-31.p0 lie-2.2.2.p5 lrs-4.2b.p1 nauty-24 normaliz-2.8.p0 nose-1.1.2 nzmath-1.1.0 p_group_cohomology-2.1.3 phc-2.3.65.p0 pybtex-20120618 pycryptoplus-20100809-git pyx-0.10 pyzmq-2.1.11.p1 qhull-2010.1 sage-mode-0.7 TOPCOM-0.17.4 zeromq-2.2.0.p0")

cmd("rm -rf spkg/optional/*")
cmd("rm -rf spkg/build/*")

cmd("make ptestlong")
