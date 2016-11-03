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



# Run bup_storage.py chown <project_id> for all projects on this host, with a little delay between
# each to not monopolize io
import time, os

delay = 0.25

print "Getting list of all projects"
v = os.listdir('/projects')
print "Got %s projects"%len(v)

for project_id in sorted(v):
    c = "bup_storage.py chown %s"%project_id
    print c
    os.system(c)
    time.sleep(delay)