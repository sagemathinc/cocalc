# start all the other daemons by doing this in ipython, run from salvus/salvus

cd salvus/salvus
ipython

[1]:  import admin; reload(admin); s = admin.Services('conf/deploy_local/'); s.start('all')

# Once things are running do this (also in salvus/salvus) to watch the coffeescript/css/html for changes and automatically build:

./w
