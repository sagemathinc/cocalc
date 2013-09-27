# Deployment for doing complete development of cloud.sagemath inside a cloud.sagemath project.

## Setup Instructions.

How to make a keyspace.

1. Start the cassandra daemon:

    ipython
    import os, admin; reload(admin); s = admin.Services('conf/deploy_project/', passwd=False); h=s._hosts
    s.start('cassandra')
    import cassandra
    cassandra.init_salvus_schema()

