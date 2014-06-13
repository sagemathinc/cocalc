# start the bup server

cd salvus/salvus
export BUP_POOL="pool"; bup_server start

# start all the other daemons by doing this in ipython, run from salvus/salvus

import admin; reload(admin); s = admin.Services('conf/deploy_local/'); s.start('all')

# Once things are running do this (also in salvus/salvus) to watch the coffeescript/css/html for changes and automatically build:

./w
