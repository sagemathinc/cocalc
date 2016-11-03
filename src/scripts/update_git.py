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



import hosts, os, socket, sys

sys.path.append("%s/salvus/salvus/"%os.environ['HOME'])

user = os.environ['USER']

import misc

for hostname in hosts.persistent_hosts + hosts.unsafe_hosts:
    ip = misc.local_ip_address(hostname)
    if ip.startswith('127'): continue
    cmd = 'ssh -t salvus@%s "cd salvus; git pull %s@%s:salvus/"'%(hostname, user, ip)
    print cmd
    os.system(cmd)

#print "Deal with these manually: ", hosts.unsafe_hosts
