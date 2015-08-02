# Installation and configuration of SMC cluster

August 2015

Our SMC cluster will consist of the following:

- db0, db1, ...           -- hostnames of database nodes
- web0, web1, ...         -- hostnames of web server nodes
- compute0, compute1, ... -- hostnames of compute vm's
- admin0, admin1, ...     -- hostnames of admin nodes
- storage                 -- hostname of *the* storage node (yes, single point of failure)

You an configure things so they all run on the same node, but if
you do this and expose it to other users, see the *CRITICAL* db remark below.

## Firewall rules

- the compute vm's should traffic from anything in our cluster
- the web vm's should allow allow traffic from compute (not sure exactly why yet!)
- the db vm's should allow internode db traffic on port 29015
- the db vm's should allow connections from the web nodes on port 28015
- everybody should allow anything from the admin nodes

## Database Nodes

Configure a clean minimal Ubuntu 15.04 install (db0, db1, ...) with an assumed account "salvus" to run Rethinkdb as follows:

	sudo su
	apt-get update && apt-get upgrade && apt-get install libprotobuf9

    # See https://github.com/rethinkdb/rethinkdb/releases for downloads
	cd /tmp; wget http://download.rethinkdb.com/dev/2.1.0-0BETA2/rethinkdb_2.1.0%2b0BETA2~0vivid_amd64.deb && dpkg -i rethinkdb_2.1.0+0BETA2~0vivid_amd64.deb

    # Configure rethinkdb
    cp /etc/rethinkdb/default.conf.sample /etc/rethinkdb/instances.d/default.conf
    echo "bind=all" >> /etc/rethinkdb/instances.d/default.conf
    echo "server-name=`hostname`" >> /etc/rethinkdb/instances.d/default.conf
    echo "join=db0" >> /etc/rethinkdb/instances.d/default.conf
    service rethinkdb restart

*CRITICAL*: If you do not have a firewall in place to ban connections into
the db nodes, or you are going to run db, web, and compute on the same
machines, then also disable the web admin console or anybody will be
able to trivial access the database without a password!

    echo "no-http-admin" >> /etc/rethinkdb/instances.d/default.conf
    service rethinkdb restart


You will have to make it so `/var/lib/rethinkdb/default/` is mounted so
it has a lot of (fast) disk space at some point.

## Web server nodes

Configure a clean minimal Ubuntu 15.04 install (web0, web1, ...) with an account salvus to run Nginx, Stunnel, Haproxy, and the SMC hub as follows:

    sudo su
    apt-get update && apt-get upgrade
    apt-get install haproxy stunnel nginx dstat ipython python-yaml
    curl --silent --location https://deb.nodesource.com/setup_0.12 | sudo bash -

Then as salvus:

    git clone https://github.com/sagemathinc/smc.git salvus
    cd ~/salvus/salvus; npm install   # DO *not* pass --dev!
    ./scripts/update

Put this at end of ~/.bashrc:

    export EDITOR=vim; export PATH=$HOME/bin:$PATH
	PWD=`pwd`; cd $HOME/salvus/salvus; . salvus-env; cd "$PWD"

### Setup Nginx

Make this file `/etc/nginx/sites-available/default` and then `service nginx restart`:
```
server {
        root /home/salvus/salvus/salvus/static/;  # where SMC repo's static directory is
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

### Setup Stunnel


### Setup Haproxy

### Setup Rethinkdb password

From and admin or web node, in `/home/salvus/salvus/salvus`, run coffee and type

    coffee> db=require('rethink').rethinkdb()
    coffee> db.set_random_password(cb: console.log)

Then copy the file `/home/salvus/salvus/salvus/salvus/data/secrets/rethinkdb` to
each of the web nodes (careful about permissions), so they can access the database.

## Setup Compute

Configure a clean minimal Ubuntu 15.04 install (web0, web1, ...) with an account salvus to run the compute daemon as follows:

    git clone https://github.com/sagemathinc/smc.git salvus
    cd ~/salvus/salvus; npm install
    ./scripts/update

This is ugly:

    crontab -e

    @reboot /home/salvus/salvus/salvus/compute start > /home/salvus/.compute.log 2>/home/salvus/.compute.err
    */3 * * * * /home/salvus/salvus/salvus/compute start > /home/salvus/.compute.log 2>/home/salvus/.compute.err


### Jupyter Kernels

### Sage

Just install Sage however you want so it is available system-wide.

## Storage

You only need this if you will have more than one compute node and/or want snapshot support.

Setup a /projects path using btrfs.

(TODO)