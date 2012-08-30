
# import admin, config2; reload(admin); reload(config2); h = config2.hosts

import admin

hosts = admin.Hosts('conf/hosts2', username='salvus')

def gitpull(query, timeout=5):
    return hosts.exec_command(query, 'cd salvus && git pull git@combinat1.salv.us:.', timeout=timeout)

def public_ssh_keys(query, timeout=5):
    return '\n'.join([x['stdout'] for x in hosts.exec_command(query, 'cat .ssh/id_rsa.pub', timeout=timeout).values()])
        
    
    
