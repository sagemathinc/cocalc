###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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



# import admin, deploy; reload(admin); reload(deploy); h = deploy.hosts; s=deploy.services

import admin

hosts = admin.Hosts('conf/deploy/hosts', username='salvus')

def git_pull(query, timeout=5):
    return hosts.git_pull(query, 'git@combinat1.salv.us:.', timeout=timeout)

services = admin.Services('conf/deploy/', username='salvus')



        
    
    
