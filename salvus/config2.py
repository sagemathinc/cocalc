
# import admin, config2; reload(admin); reload(config2); h = config2.hosts

import admin

hosts = admin.Hosts('conf/deploy/hosts', username='salvus')

def git_pull(query, timeout=5):
    return hosts.git_pull(query, 'git@combinat1.salv.us:.', timeout=timeout)

def start_nginx(query, timeout=10):
    hosts.python_c(query, "import admin; print admin.Nginx(0).start()", sudo=True, timeout=timeout)
    

services = admin.Services('conf/deploy/', username='salvus')



        
    
    
