#!/usr/bin/python
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



import os, shutil, sys

if len(sys.argv) != 3:
    sys.stderr.write("%s src target\n\n   if target doesn't exist, copy src to it and chown target to have permissions of contain dir\n\n"%sys.argv[0])
    sys.exit(1)

_, src, target = sys.argv

if not os.path.exists(target):
    shutil.copyfile(src, target)
    s = os.stat(os.path.split(target)[0])
    os.chown(target, s.st_uid, s.st_gid)

