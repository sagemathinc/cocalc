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



import os, sys

path = sys.argv[1]
if not os.path.exists(path):
    raise RuntimeError("no such directory -- %s"%path)

dot_ssh = os.path.join(path, '.ssh')

if os.path.exists(dot_ssh) and not os.path.isdir(dot_ssh):
    os.unlink(dot_ssh)

if not os.path.exists(dot_ssh):
    os.makedirs(dot_ssh)

target = os.path.join(dot_ssh, 'authorized_keys')
authorized_keys = '\n' + open(sys.argv[2]).read() + '\n'

if not os.path.exists(target) or authorized_keys not in open(target).read():
    open(target,'w').write(authorized_keys)

s = os.stat(path)

if os.system('chown -R %s:%s %s'%(s.st_uid, s.st_gid, dot_ssh)):
    raise RuntimeError("failed to chown")

if os.system('chmod og-rwx -R %s'%dot_ssh):
    raise RuntimeError("failed to chmod")
