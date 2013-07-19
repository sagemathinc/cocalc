
# Upgrade web-only part:  

    new_vm_image.py
    ssh localhost -p 2222
    cd salvus/salvus &&  git pull
    ./update_version
    ./make_coffee && sleep 3 && ./make_coffee
    sudo apt-get update; sudo apt-get upgrade
    # if changes, reboot_this_computer
    shutdown_this_computer
    cd ~/vm/images/base/
    virsh_list
    virsh_undefine      # name of vm
    ./push
    cd ~/salvus/salvus/conf/deploy_storm
    replace x y services
    cd ~/salvus/salvus; . salvus-env; ipython
    import admin; s = admin.Services('conf/deploy_storm/')

    # If web stuff only
    time s.restart_web()

    # If more than just web:
    time s.stop_system(); s.start_system()

    # Check that the snap server isn't hosed... (for now!) -- this step will go away very soon.

    # TEST

    cd ~/salvus/salvus/conf/deploy_cloud
    replace x y services
    cd ~/salvus/salvus; . salvus-env; ipython
    import admin; s = admin.Services('conf/deploy_cloud/')
    time s.restart_web()

# Restart only web part:

s.restart_web()

# How to snapshot all nodes:
time s._hosts.nodetool('snapshot salvus', wait=True)

# How to initiaite repair all nodes (once a week, takes a long time)

!!! WAIT -- best to do one at a time; doing all at once leads to major performance issues! !!!

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



# Manual testing before release of storm until I have something better:

    https://128.95.242.135:8443/

- make an account
- create project
- create worksheet
- check sage version, plot, 2+2, latex, md, html, add william stein collab
- create md file
- create latex file
- file search
- open another account and edit worksheet by two people "at once"


# Mounting a backup img:

This works on cloud's since they have guestmount; not possible on disk.math, which makes those backups worth less (?).

salvus@cloud2:~/vm/images/backup/bup/fuse/cloud1/latest/home/salvus/vm/images/persistent$ guestmount -a web1-snap.img -m/dev/
vda1 --ro ~/mnt

salvus@cloud2:~/vm/images/backup/bup/fuse/cloud1/latest/home/salvus/vm/images/persistent$
salvus@cloud2:~/vm/images/backup/bup/fuse/cloud1/latest/home/salvus/vm/images/persistent$ ls ~/mnt/
backup  backup_snap  dfall~  idea  keep_fresh  lost+found  snap0  status




