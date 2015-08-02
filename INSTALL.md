# Installation and configuration of SMC cluster

August 2015

Our SMC cluster will consist of the following:

- db0, db1, db2           -- hostnames of database nodes
- web0, web1              -- hostnames of web server nodes
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
    # For testing the auto-fail-over beta -- data format not compatible with stable use:
	cd /tmp; wget http://download.rethinkdb.com/dev/2.1.0-0BETA2/rethinkdb_2.1.0%2b0BETA2~0vivid_amd64.deb && dpkg -i rethinkdb_2.1.0+0BETA2~0vivid_amd64.deb

    # For stable use:
    source /etc/lsb-release && echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" | sudo tee /etc/apt/sources.list.d/rethinkdb.list && wget -qO- http://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && apt-get update && apt-get install rethinkdb

    # Configure rethinkdb
    cp /etc/rethinkdb/default.conf.sample /etc/rethinkdb/instances.d/default.conf
    echo "bind=all" >> /etc/rethinkdb/instances.d/default.conf
    echo "server-name=`hostname`" >> /etc/rethinkdb/instances.d/default.conf
    echo "join=db0" >> /etc/rethinkdb/instances.d/default.conf
    service rethinkdb restart

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

Configure a clean minimal Ubuntu 15.04 install (web0, web1, ...) with an account salvus to run Nginx, Stunnel, Haproxy, and the SMC hub as follows:

    sudo su
    apt-get update && apt-get upgrade && apt-get install haproxy stunnel nginx dstat ipython python-yaml dpkg-dev && curl --silent --location https://deb.nodesource.com/setup_0.12 | sudo bash - && apt-get install nodejs

Put this at end of ~/.bashrc:

    export EDITOR=vim; export PATH=$HOME/bin:$PATH; PWD=`pwd`; cd $HOME/salvus/salvus; . salvus-env; cd "$PWD"

Then as salvus:

    git clone https://github.com/sagemathinc/smc.git salvus
    source ~/.bashrc
    cd ~/salvus/salvus
    time update    # about a minute



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

### Setup Hub

Put this in the `crontab -e` for the salvus user (this is really horrible):

    */2 * * * * /home/salvus/salvus/salvus/hub start --host='`hostname`' --port=5000 --database_nodes db0,db1,db2

NOTE: specifying the port is required, even though it looks optional.

### Setup Stunnel

1. Set ENABLED to 1 in `/etc/default/stunnel4`

2. Make this file `/etc/stunnel/sagemathcloud.conf`:

```
cert = /home/salvus/salvus/salvus/data/secrets/sagemath.com/nopassphrase.pem
[https]
accept  = 443
connect = 8000
protocol = proxy
sslVersion = all
options = NO_SSLv2
options = NO_SSLv3
```

Note: obviously you will need your own

    /home/salvus/salvus/salvus/data/secrets/sagemath.com/nopassphrase.pem

with your own site for this to work for you...  These costs money.
You can also create a self-signed cert, but it will scare users.

3. Doing `sudo service stunnel restart` doesn't seem to work at all.
Just reboot, which does seem to work fine.

### Setup Haproxy

```
salvus@web0:~$ more /etc/haproxy/haproxy.cfg
defaults
    log global
    option httplog
    mode http
    timeout connect 5000ms
    timeout client 5000ms
    timeout server 5000ms
    timeout tunnel 120s

listen http1
    bind 127.0.0.1:8000 accept-proxy
    timeout client 120s
    option forwardfor
    option http-server-close
    # replace "/policies/" with "/static/policies/" at the beginning of any request path.
    reqrep ^([^\ :]*)\ /policies/(.*)     \1\ /static/policies/\2
    acl is_static path_beg /static
    use_backend static if is_static
    acl is_hub path_beg /hub /cookies /blobs /invoice /upload /alive /auth /stats /registration /projects /help /settings
    use_backend hub if is_hub
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/port
    acl is_proxy path_reg ^/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/raw
    use_backend proxy if is_proxy
    default_backend static

backend static
    balance roundrobin
    timeout server 45s
    server nginx0 web0:8080 maxconn 10000 check
    server nginx1 web1:8080 maxconn 10000 check

backend hub
    balance leastconn
    cookie SMCSERVERID3 insert nocache
    option httpclose
    option forwardfor
    timeout server 60s
    option httpchk /alive
    server hub0 web0:5000 cookie server:web0:5000 check inter 4000 maxconn 10000
    server hub1 web1:5000 cookie server:web1:5000 check inter 4000 maxconn 10000

backend proxy
    balance leastconn
    cookie SMCSERVERID2 insert nocache
    option httpclose
    option forwardfor
    timeout server 60s
    server proxy0 web0:5001 cookie server:web0:5000 check inter 4000 maxconn 10000
    server proxy1 web1:5001 cookie server:web1:5000 check inter 4000 maxconn 10000

frontend unsecured *:80
    redirect location https://cloud.sagemath.com
```


### Setup Rethinkdb password

From and admin or web node, in `/home/salvus/salvus/salvus`, run coffee and type

    coffee> db=require('rethink').rethinkdb()
    coffee> # this will cause an error as the old password
    coffee> db.set_random_password(cb: console.log)



Then copy the file `/home/salvus/salvus/salvus/salvus/data/secrets/rethinkdb` to
each of the web nodes (careful about permissions), so they can access the database.

## Setup Compute

Configure a clean minimal Ubuntu 15.04 install (web0, web1, ...) with an account salvus.

    sudo mkdir -p /projects/conf /projects/sagemathcloud; sudo chown salvus. /projects/conf


To run the compute daemon as follows:

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

    sudo apt-get install m4; sudo mkdir sage; sudo chown salvus. sage; cd sage; wget http://files.sagemath.org/src/sage-6.8.tar.gz; tar xf sage-6.8.tar.gz; cd sage-6.8; make

## Storage

You only need this if you will have more than one compute node and/or want snapshot support.

Setup a /projects path using btrfs.

(TODO)


## Contributing

Start by doing something like this :-)

    git config --global push.default simple; git config --global user.email "wstein@sagemath.com"; git config --global user.name "William Stein"