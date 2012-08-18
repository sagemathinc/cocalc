import admin

HOSTS = ['salvus0', 'blastoff1',
         'bsd0', 'bsd1', 'bsd2',  
         'combinat0', 'combinat1', 'combinat2', 'combinat3', 'combinat4',
         'geom0',
         'servedby1', 'servedby2']


def vpn_status(timeout=2):
    for hostname in HOSTS:
        alive = admin.is_alive(hostname + '.salv.us', timeout)
        print '%-15s%-10s'%(hostname, 'alive' if alive else '*missing*')
    
