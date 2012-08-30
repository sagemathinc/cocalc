import admin

hosts = admin.Hosts('conf/hosts2')

def ping(timeout=2):
    for hostname in hosts.all():
        alive = admin.is_alive(hostname + '.salv.us', timeout)
        print '%-15s%-10s'%(hostname, 'alive' if alive else '*missing*')
    
