# Installation and configuration of SMC cluster

November 2015

For a video discussion of installing SMC watch https://www.youtube.com/watch?v=GOuy07Kift4 at minute 12.

Our SMC cluster consists of the following:

- db0, db1, db2           -- hostnames of database nodes
- web0, web1              -- hostnames of web server nodes
- compute0, compute1, ... -- hostnames of compute vm's
- admin0, admin1, ...     -- hostnames of admin nodes
- storage0                -- hostname of *the* storage node (yes, single point of failure)

You an configure things so they all run on the same node, but if
you do this and expose it to other users, see the *CRITICAL* db remark below.

## Firewall rules

- the compute vm's should traffic from anything in our cluster
- the web vm's should allow allow traffic from compute (not sure exactly why yet!)
- the db vm's should allow internode db traffic on port 29015
- the db vm's should allow connections from the web nodes on port 28015
- everybody should allow anything from the admin nodes

## All Nodes require Node.js:

    curl --silent --location https://deb.nodesource.com/setup_5.x | sudo bash - && sudo apt-get install nodejs

## All Database/Web Nodes

Settings in /etc/security/limits.conf file:

```
* - memlock unlimited
* - nofile 100000
* - nproc 32768
* - as unlimited
```

## Database Nodes

Configure a clean minimal Ubuntu 15.10 install (db0, db1, ...)


    export H="db0"; gcloud compute --project "sage-math-inc" instances create "$H" --zone "us-central1-c" --machine-type "n1-standard-1" --network "default" --maintenance-policy "MIGRATE" --scopes "https://www.googleapis.com/auth/devstorage.read_write" "https://www.googleapis.com/auth/logging.write" --tags "db" --image "https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-1504-vivid-v20150616a" --boot-disk-size "50" --no-boot-disk-auto-delete --boot-disk-type "pd-ssd" --boot-disk-device-name "$H"



This swap leads to horrible pauses and is a very bad idea, unless you have a fast local disk --  set swap space:

    sudo su
    fallocate -l 8G /swapfile && chmod 0600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap defaults 0 0" >> /etc/fstab


An assumed account "salvus" to run Rethinkdb as follows:

hsy: Is there a need for python2 rethinkdb python package?
I think it's not good to install both of them,
because both install those python scripts in /usr/[local?]/bin
and only the python3 version installs clean without an error.

	sudo su
	apt-get update && apt-get upgrade && apt-get install bup htop fio libprotobuf9 python-pip dstat iotop && pip install rethinkdb && pip3 install rethinkdb && source /etc/lsb-release && echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" | sudo tee /etc/apt/sources.list.d/rethinkdb.list && wget -qO- http://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && apt-get update && apt-get install rethinkdb && sudo apt-mark hold rethinkdb

    # the apt-mark is so we never auto-update

    # Configure rethinkdb
    cp /etc/rethinkdb/default.conf.sample /etc/rethinkdb/instances.d/default.conf
    #echo "direct-io" >> /etc/rethinkdb/instances.d/default.conf # recommended against
    echo "bind=all" >> /etc/rethinkdb/instances.d/default.conf
    echo "server-name=`hostname`" >> /etc/rethinkdb/instances.d/default.conf
    #echo "join=db0" >> /etc/rethinkdb/instances.d/default.conf   # careful with this one!
    service rethinkdb restart

NOTE: it is also very important for serious use to set the `cache-size` parameter to something much closer to available system RAM, and have some swap!

If it is a single-site install, don't include the join line above, but
change the http admin port:

    echo "http-port=8090" >> /etc/rethinkdb/instances.d/default.conf

*CRITICAL*: If you do not have a firewall in place to ban connections into
the db nodes, or you are going to run db, web, and compute on the same
machines, then also disable the web admin console or anybody will be
able to trivial access the database without a password!

    echo "no-http-admin" >> /etc/rethinkdb/instances.d/default.conf
    service rethinkdb restart



You will have to make it so `/var/lib/rethinkdb/default/` is mounted so
it has a lot of (fast) disk space at some point.

## Web server nodes

Configure a clean minimal Ubuntu 15.10 install (web0, web1, ...) with an account salvus to run Nginx, Haproxy, and the SMC hub as follows:

    apt-get install software-properties-common && add-apt-repository ppa:vbernat/haproxy-1.6 && apt-get update && apt-get install haproxy

    sudo su
    apt-get update && apt-get upgrade && apt-get install haproxy nginx dstat ipython python-yaml dpkg-dev

Put this at end of ~/.bashrc:

    export EDITOR=vim; export PATH=$HOME/bin:$PATH; PWD=`pwd`; cd $HOME/smc/src; . smc-env; cd "$PWD"

If doing development also put

    export DEVEL=true

Then as salvus (this takes nearly 1GB):

    git clone https://github.com/sagemathinc/smc.git smc && source ~/.bashrc && cd ~/smc/src && ./install.py all --web # few minutes

Test it:

    cd ~/smc/src
    npm test


### Setup Nginx

Make this file `/etc/nginx/sites-available/default` and then `service nginx restart`:
```
server {
        root /home/salvus/smc/src/static/;  # where SMC repo's static directory is
        listen 8080 default_server;
        server_name _;
        index index.html;
        location /static/ {
                rewrite ^/static/(.*) /$1;
                try_files $uri $uri/ =404;
        }
        location / {}  # Needed for access to the index.htm
}
```

### Setup Hub

Put this in the `crontab -e` for the salvus user (this is really horrible):

    */2 * * * * /home/salvus/smc/src/hub start --host='`hostname`' --port=5000 --database_nodes db0,db1,db2,db3,db4

NOTE: specifying the port is required, even though it looks optional.


### Setup Haproxy

    salvus@web0:~$ more /etc/haproxy/haproxy.cfg

```
defaults
    log global
    option httplog
    mode http
    option forwardfor
    option http-server-close
    timeout connect 5000ms
    timeout client 5000ms
    timeout server 5000ms
    timeout tunnel 120s

    stats enable
    stats uri /haproxy
    stats realm Haproxy\ Statistics

backend static
    balance roundrobin
    timeout server 15s
    server nginx0 web0:8080 maxconn 10000 check
    server nginx1 web1:8080 maxconn 10000 check

backend hub
    balance leastconn
    cookie SMCSERVERID3 insert nocache
    option httpclose
    timeout server 20s
    option httpchk /alive
    server hub0 web0:5000 cookie server:web0:5000 check inter 4000 maxconn 10000
    server hub1 web1:5000 cookie server:web1:5000 check inter 4000 maxconn 10000

backend proxy
    balance leastconn
    cookie SMCSERVERID2 insert nocache
    option httpclose
    timeout server 20s
    server proxy0 web0:5001 cookie server:web0:5000 check inter 4000 maxconn 10000
    server proxy1 web1:5001 cookie server:web1:5000 check inter 4000 maxconn 10000

frontend https
    bind *:443 ssl crt /home/salvus/smc/src/data/secrets/sagemath.com/nopassphrase.pem no-sslv3
    reqadd X-Forwarded-Proto:\ https
    timeout client 120s
    # replace "/policies/" with "/static/policies/" at the beginning of any request path.
    reqrep ^([^\ :]*)\ /policies/(.*)     \1\ /static/policies/\2
    acl is_static path_beg /static
    use_backend static if is_static
    acl is_hub path_beg /customize /hub /cookies /blobs /invoice /upload /alive /auth /stats /registration /projects /help /settings
    use_backend hub if is_hub
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/port
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/raw
    use_backend proxy if is_proxy
    default_backend static

frontend http *:80
    redirect scheme https if !{ ssl_fc }
```


or, on a single-machine testing install of SMC:

```
defaults
    log global
    option httplog
    mode http
    option forwardfor
    option http-server-close
    timeout connect 5000ms
    timeout client 5000ms
    timeout server 5000ms
    timeout tunnel 120s

    stats enable
    stats uri /haproxy
    stats realm Haproxy\ Statistics

backend static
    balance roundrobin
    timeout server 15s
    server nginx localhost:8080 maxconn 10000 check

backend hub
    balance leastconn
    cookie SMCSERVERID3 insert nocache
    option httpclose
    timeout server 20s
    option httpchk /alive
    server hub localhost:5000 cookie server:localhost:5000 check inter 4000 maxconn 10000

backend proxy
    balance leastconn
    cookie SMCSERVERID3 insert nocache
    option httpclose
    timeout server 20s
    server proxy localhost:5001 cookie server:localhost:5000 check inter 4000 maxconn 10000

frontend https
    #bind *:443 ssl crt /home/salvus/smc/src/data/secrets/sagemath.com/nopassphrase.pem no-sslv3
    bind *:80
    reqadd X-Forwarded-Proto:\ https
    timeout client 120s
    # replace "/policies/" with "/static/policies/" at the beginning of any request path.
    reqrep ^([^\ :]*)\ /policies/(.*)     \1\ /static/policies/\2
    acl is_static path_beg /static
    use_backend static if is_static
    acl is_hub path_beg /customize /hub /cookies /blobs /invoice /upload /alive /auth /stats /registration /projects /help /settings
    use_backend hub if is_hub
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/port
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/raw
    use_backend proxy if is_proxy
    default_backend static
```

Note: obviously you will need your own

    /home/salvus/smc/src/data/secrets/sagemath.com/nopassphrase.pem

with your own site for this to work for you...  These costs money.
You can also create a self-signed cert, but it will scare users.





### Setup Rethinkdb password

From and admin or web node, in `/home/salvus/smc/src`, run coffee and type

    coffee> db=require('rethink').rethinkdb()
    coffee> # this will cause an error as the old password will no longer be valid
    coffee> db.set_random_password(cb: console.log)



Then copy the file `/home/salvus/smc/src/data/secrets/rethinkdb` to
each of the web nodes (careful about permissions), so they can access the database.

## Setup Compute

Configure a clean minimal Ubuntu 15.10 install (web0, web1, ...) with an account salvus.

    sudo su
    mkdir -p /projects/conf; chown salvus. /projects/conf
    apt-get install libssl-dev m4 dpkg-dev cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup quota quotatool smem linux-image-extra-virtual
    # edit /etc/fstab -- add the usrquota option to the / mount:
    #    UUID=fcee768a-8d63-4a26-aabd-ae79af101874 /               ext4    usrquota,errors=remount-ro 0       1
    mount -o remount /&& quotacheck -cum / && quotaon /       # this will take minutes


Run the compute daemon as follows:

    git clone https://github.com/sagemathinc/smc.git salvus
    cd ~/smc/src/
    ./install.py compute --all

Start daemon on boot:

    crontab -e

    @reboot /home/salvus/smc/src/compute start > /home/salvus/.compute.log 2>/home/salvus/.compute.err

If on a single-node deploy (optional -- you could also just type a password below):

    ssh-keygen -b 2048; cd ~/.ssh; cat id_rsa.pub  >> authorized_keys

Then:

    $ cd ~/smc/src/
    # export SMC_DB_HOSTS='localhost'
    $ coffee
    coffee> require 'c'; compute_server()
    coffee> s.add_server(host:os.hostname(), cb:done())


For backups on a multi-node setup, put smc_compute.py in /root and add this to *root* crontab via `crontab -e`:

    */3 * * * * ls -1 /snapshots/ > /projects/snapshots
    */5 * * * * fusermount -u /snapshots; mkdir -p /snapshots; sshfs -o allow_other,default_permissions smcbackup:/projects/.snapshots/ /snapshots/


#### Restrict UMASK:

Put UMASK=077 in `/etc/default/login` and in `/etc/login.defs`

#### Enable swap accounting for cgroups:

1. Add file `/etc/default/grub.d/99-smc.cfg` with the content `GRUB_CMDLINE_LINUX="swapaccount=1"`
1. `update-grub` and reboot.

### Jupyter Kernels

### Sage

Just install Sage however you want so it is available system-wide.

    sudo su
    apt-get install m4 libatlas3gf-base liblapack-dev && cd /usr/lib/ && ln -s libatlas.so.3gf libatlas.so && ln -s libcblas.so.3gf libcblas.so && ln -s libf77blas.so.3gf libf77blas.so

    cd /projects
    export VER=6.8    # but see http://files.sagemath.org/devel/index.html
    mkdir sage; sudo chown salvus. sage; cd sage; wget http://files.sagemath.org/src/sage-$VER.tar.gz; tar xf sage-$VER.tar.gz; cd sage-$VER; export SAGE_ATLAS_LIB="/usr/lib/"; make
    sudo ln -s /projects/sage/sage-$VER/sage /usr/local/bin/
    sage -sh
    pip install jsonschema

## Storage

You only need this if you will have more than one compute node and/or want snapshot support.

Setup a `/projects` path using btrfs.

     mkdir /projects; mkfs.btrfs /dev/vdb

Add this to `/etc/fstab`:

     /dev/vdb /projects btrfs compress-force=lzo,noatime,nobootwait 0 2

Then do `mount -a`.

Add this to `/etc/ssh/sshd_config`:

    Ciphers arcfour,aes128-ctr,aes192-ctr,aes256-ctr,arcfour256,arcfour128,aes128-cbc,3des-cbc,blowfish-cbc,cast128-cbc,aes192-cbc,aes256-cbc,arcfour

Put smc_compute.py in /root and add this to *root* crontab via `crontab -e`:

    */5 * * * * /root/smc_compute.py snapshot  >> /root/snapshot.cron.log 2>> /root/snapshot.cron.err

## Admin nodes

Configure a clean minimal Ubuntu 15.10 install with an account salvus to run admin as follows:

    sudo su
    apt-get update && apt-get upgrade && apt-get install dstat ipython dpkg-dev && curl --silent --location https://deb.nodesource.com/setup_0.12 | sudo bash - && apt-get install nodejs

Put this at end of ~/.bashrc:

    export EDITOR=vim; export SAGE_ATLAS_LIB="/usr/lib/"; export PATH=$HOME/bin:$PATH; PWD=`pwd`; cd $HOME/smc/src; . smc-env; cd "$PWD"

Then as salvus, which will take a few minutes:

    git clone https://github.com/sagemathinc/smc.git smc && source ~/.bashrc && cd ~/smc/src && npm run install-all


## Automated backup of the database

### Complete dumps to nearline Google Cloud Storage twice a day:

    salvus@admin0:~/backups/db$ more backup
    #!/bin/bash

    set -e
    set -v

    cd $HOME/backups/db/

    time rethinkdb dump -c db0 -a `cat $HOME/smc/src/data/secrets/rethinkdb`

    time gsutil rsync ./ gs://smc-db-backup/

Then in crontab:


    0 */12 * * * /home/salvus/backups/db/backup  > /home/salvus/.db_backups.log     2>/home/salvus/.db_backups.err

Regularly offsite the above database dumps.

These backups are easy to look at by hand to see they aren't nonsense.  It's
a zip file full of plain JSON documents.  It's also fairly efficiently compressed.


### Local bup snapshots on the database machines every 3 hours:

In crontab: `0 */3 * * * /var/lib/rethinkdb/default/bup/backup`
the script is:

    salvus@db0:/var/lib/rethinkdb/default/bup$ more backup
    cd /var/lib/rethinkdb/default/
    export BUP_DIR=`pwd`/bup
    bup index data
    bup save data -n master

These mean are a snapshot of the files of the database every 3 hours, so
if the database is corrupted, at most 3 hours of work is lost.

### Snapshots of the disk images

The gce.py script gets GCE to snapshot the underlying disk images of the
machines running the database a few times a day, and keeps these snapshots for
about 2 weeks.

## Contributing

Start by doing something like this :-)

    git config --global push.default simple; git config --global user.email "wstein@sagemath.com"; git config --global user.name "William Stein"
