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



vm_hosts = ['%02dsalvus'%k for k in [1,2,3,4,5,6,7,8]] + ['%s.math.washington.edu'%h for h in ['geom','combinat']]

persistent_hosts = vm_hosts + ['servedby%s.salv.us'%k for k in [1]] + ['bsd%s.salv.us'%k for k in ['', 1]] 

# they run sage
unsafe_hosts = ['servedby%s.salv.us'%k for k in [2]] + ['bsd%s.salv.us'%k for k in [2]] 

