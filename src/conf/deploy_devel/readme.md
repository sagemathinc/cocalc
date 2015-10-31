import admin; reload(admin); a = admin.Services('conf/deploy_devel/', password='')

[a.start(s) for s in 'stunnel haproxy cassandra hub nginx'.split()]
[a.status(s) for s in 'stunnel haproxy cassandra hub nginx'.split()]
[a.stop(s) for s in 'stunnel haproxy cassandra hub nginx'.split()]

