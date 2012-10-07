
# import admin, deploy2; reload(admin); reload(deploy2); s=deploy2.services; h = s._hosts

import admin

hosts = admin.Hosts('conf/deploy2/hosts', username='salvus')

services = admin.Services('conf/deploy2/', username='salvus')



        
    
    
