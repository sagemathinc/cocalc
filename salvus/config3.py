
# import admin, config2; reload(admin); reload(config2); h = config2.hosts

import admin

hosts = admin.Hosts('conf/deploy3/hosts', username='wstein')

services = admin.Services('conf/deploy3/', username='wstein')



        
    
    
