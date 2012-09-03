
# import admin, deploy; reload(admin); reload(deploy); h = deploy.hosts; s=deploy.services

import admin

hosts = admin.Hosts('conf/deploy/hosts', username='salvus')

def git_pull(query, timeout=5):
    return hosts.git_pull(query, 'git@combinat1.salv.us:.', timeout=timeout)

services = admin.Services('conf/deploy/', username='salvus')



        
    
    
