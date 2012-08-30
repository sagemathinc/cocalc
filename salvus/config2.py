
# import admin, config2; reload(admin); reload(config2); h = config2.hosts

import admin

hosts = admin.Hosts('conf/deploy/hosts2', username='salvus')

def git_pull(query, timeout=5):
    return hosts.git_pull(query, 'git@combinat1.salv.us:.', timeout=timeout)

        
    
    
