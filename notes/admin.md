# Upgrade web-only part:

    new_vm_image.py
    ssh localhost -p 2222
    cd salvus/salvus &&  git pull &&  ./make_coffee && sleep 3 && ./make_coffee
    sudo apt-get update; sudo apt-get upgrade
    # if changes, reboot
    shutdown_this_computer
    cd ~/vm/images/base/
    virsh_list
    virsh_undefine
    ./push
    cd ~/salvus/salvus/conf/deploy_storm
    replace x y services
    cd ../..; . salvus-env; ipython
    import admin; s = admin.Services('conf/deploy_storm/')
    time s.restart_web()

    cd ~/salvus/salvus/conf/deploy_cloud
    replace x y services
    cd ../../
    . salvus-env
    ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    time s.restart_web()
    # start the bup ls on 10.1.1.3 for now
    # check that all bups working: keep_fresh

# Restart only web part:

s.restart_web()

# How to snapshot all nodes:
time s._hosts.nodetool('snapshot salvus', wait=True)

# How to initiaite repair all nodes (once a week, takes a long time)
time s._hosts.nodetool('snapshot repair', wait=False)

# How to control memory usage for development:

Edit the file

    /home/wstein/salvus/salvus/data/local/cassandra/conf/cassandra-env.sh


# Java -- cassandra wants v6
update-alternatives --config java

2            /usr/lib/jvm/java-6-oracle/jre/bin/java          1063      manual mode


# Disk space

    salvus@web1:/mnt/snap$ more dfall
    #!/usr/bin/env python

    import os

    for x in ['10.1.1.2', '10.1.1.3', '10.1.1.4',
              '10.1.2.2', '10.1.2.3', '10.1.2.4',
              '10.1.3.2', '10.1.3.3', '10.1.3.4',
              '10.1.4.2', '10.1.4.3', '10.1.4.4']:
        s = "ssh %s 'df -h'|grep mnt"%x
        print x, os.popen(s).read().strip()


