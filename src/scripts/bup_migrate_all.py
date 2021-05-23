#!/usr/bin/env python
###############################################################################
#
#    CoCalc: Collaborative Calculation
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

import os

for x in open('/tmp/projects_on_host').readlines():
    project_id = x.strip()
    if os.path.exists(
            '/projects/%s/.zfs/snapshot' % project_id) and not os.path.exists(
                '/tmp/bup/%s' % project_id):
        os.system("./bup_storage.py migrate_all %s" % project_id)
