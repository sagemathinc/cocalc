#!/usr/bin/env python

# Script to initialize a dev machine for use for development.
import os, socket, sys

hostname = socket.gethostname()

if "SALVUS_ROOT" not in os.environ:
    os.environ['SALVUS_ROOT']='/home/salvus/salvus/salvus/'

SALVUS_ROOT=os.environ['SALVUS_ROOT']
os.chdir(SALVUS_ROOT)
sys.path.append(SALVUS_ROOT)

SECRETS = os.path.join(SALVUS_ROOT, 'data', 'secrets')

compute_vm = 'compute4-us'

import admin

sys.path.append(os.path.join(os.environ['SALVUS_ROOT'], 'scripts'))
from smc_firewall import cmd, log

def update_rep():
    log("update repo")
    cmd("git stash save xxx; git pull")

def get_sage_install():
    log("installling packages so that sage and latex will work")
    cmd("sudo apt-get install -y libatlas3gf-base liblapack-dev texlive", system=True)
    log("get copy of sage install (about 5-10 minutes)")
    cmd("sudo mkdir -p /usr/local/sage/current")
    cmd("sudo chown -R salvus. /usr/local/sage")
    cmd("chmod a+rx /usr/local/sage/ /usr/local/sage/current/")
    log("getting local_hub_template from a compute machine")
    cmd('ssh-keyscan -H %s > ~/.ssh/known_hosts'%compute_vm)

    cmd("rsync -axH %s:/home/salvus/salvus/salvus/local_hub_template/ /home/salvus/salvus/salvus/local_hub_template/"%compute_vm)
    v = cmd("ssh %s ls /projects/sage/"%compute_vm).splitlines()
    v.sort()
    v = [x for x in v if x.startswith('sage-')]
    cur = v[-1]
    log("newest version=%s", cur)
    cmd("rsync -axH %s:/projects/sage/%s/ /usr/local/sage/current/"%(compute_vm, cur), system=True)

    log('get jupyter kernel conf')
    cmd("rsync -axH %s:/usr/local/share/jupyter/ /tmp/jupyter && sudo rsync -axH /tmp/jupyter/ /usr/local/share/jupyter/"%compute_vm, system=True)

    log("create link")
    cmd("sudo ln -sf /usr/local/sage/current/sage /usr/local/bin/sage")
    log("run sage once")
    cmd("umask 022; /usr/local/bin/sage -b < /dev/null")

def setup_projects_path():
    log("create paths")
    cmd("sudo mkdir -p /projects")
    cmd("sudo chmod a+x /projects")
    cmd("sudo touch /projects/snapshots; sudo chmod a+r /projects/snapshots")
    cmd("sudo mkdir -p /projects/conf")
    cmd("sudo chown salvus. /projects/conf")
    cmd("sudo mkdir -p /projects/sagemathcloud")
    cmd("sudo rsync -LrxH --delete /home/salvus/salvus/salvus/local_hub_template/ /projects/sagemathcloud/")

def setup_quota():
    log("quota packages")
    cmd("sudo apt-get install -y libatlas3gf-base liblapack-dev  quota quotatool linux-image-extra-virtual cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup cgmanager cgmanager-utils  cgroup-bin smem", system=True)
    log("quota stuff")
    cmd("echo 'LABEL=cloudimg-rootfs /        ext4   defaults,usrquota       0 0' | sudo tee /etc/fstab")
    cmd("sudo mount -o remount /")
    log("initializing quota, which will take a while")
    cmd("sudo quotacheck -fucm /")
    cmd("sudo quotaon /")

def delete_secrets():
    log("delete any possible sensitive info from the production install")
    log("wipe root ssh keys")
    cmd("sudo rm -f /root/.ssh/id_rsa /root/.ssh/id_rsa.pub")
    log("wipe salvus ssh keys")
    cmd("sudo rm -rf /home/salvus/.ssh/id_rsa*")
    log("wipe salvus secrets")
    cmd("sudo rm -rf /home/salvus/salvus/salvus/data/secrets/")
    log("wipe production logs")
    cmd("sudo rm -rf /home/salvus/logs/*")

def create_ssh_keys():
    log("create new secrets for use in this dev image")
    log("generate salvus ssh key")
    cmd('ssh-keygen -b2048 -t rsa -N "" -f ~/.ssh/id_rsa',system=True)
    cmd('cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys')
    cmd('ssh-keyscan -H localhost >> ~/.ssh/known_hosts')
    log("generate root ssh key")
    cmd('sudo ssh-keygen -b2048 -t rsa -N "" -f /root/.ssh/id_rsa', system=True)
    cmd('sudo cat /root/.ssh/id_rsa.pub | sudo tee  /root/.ssh/authorized_keys')
    cmd('sudo ssh-keyscan -H localhost |  sudo tee  /root/.ssh/known_hosts')

def create_data_secrets():
    cmd("mkdir -p %s"%SECRETS)
    log("sendgrid fake password (will not work)")
    cmd("echo 'will-not-work' > %s/sendgrid_email_password"%SECRETS)
    log("generate cassandra passwords")
    cmd("mkdir -p %s/cassandra"%SECRETS)
    cmd("makepasswd -q > %s/cassandra/hub"%SECRETS)
    cmd("makepasswd -q > %s/cassandra/salvus"%SECRETS)
    cmd("mkdir -p %s/sagemath.com"%SECRETS)
    cmd("yes US | openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -nodes -days 10000 && cat key.pem cert.pem > %s/sagemath.com/nopassphrase.pem"%SECRETS)

def start_cassandra():
    log("start_cassandra...")
    services = admin.Services('conf/deploy_devel/', password='')
    services.start('cassandra')
    cmd("ln -sf %s/data/cassandra-0/logs/system.log %s/logs/cassandra.log"%(SALVUS_ROOT, os.environ['HOME']))
    log("cassandra started")
    log("waiting 10 seconds...")
    import time; time.sleep(10)

def init_cassandra_users():
    pw_hub = open("%s/cassandra/hub"%SECRETS).read()
    cmd("""echo "CREATE USER hub WITH PASSWORD '%s' SUPERUSER;" | cqlsh localhost -u cassandra -p cassandra"""%pw_hub, verbose=0)
    rc = "%s/.cqlshrc"%os.environ['HOME']
    log("writing %s", rc)
    open(rc, 'w').write("""
[authentication]
username=hub
password=%s
"""%pw_hub)
    pw_salvus = open("%s/cassandra/salvus"%SECRETS).read()
    cmd("""echo "CREATE USER salvus WITH PASSWORD '%s' SUPERUSER;" | cqlsh localhost -u cassandra -p cassandra"""%pw_salvus, verbose=0)
    cmd("""echo "ALTER USER cassandra WITH PASSWORD '%s';" | cqlsh localhost -u cassandra -p cassandra"""%pw_hub, verbose=0)

def init_cassandra_schema():
    log("create keyspace")
    cmd(r"""echo "CREATE KEYSPACE salvus WITH replication = {'class': 'NetworkTopologyStrategy',  'DC0': '1'};" | cqlsh""")
    log("create schema")
    cmd(r"""echo "a = new (require('cassandra').Salvus)(hosts:['localhost'], keyspace:'salvus', username:'hub', password:fs.readFileSync('data/secrets/cassandra/hub').toString(), cb:()->a.create_schema(()->process.exit(0)))" | coffee """)
    log("done creating schema")

def init_compute_server():
    log("starting compute server")
    cmd("compute start")
    log("making log link: ~/logs/compute.log")
    cmd("ln -sf /projects/conf/compute.log %s/logs/compute.log"%os.environ['HOME'])
    log("waiting a few seconds")
    import time; time.sleep(5)
    log("adding compute server to database")
    cmd(r"""echo "require('compute').compute_server(keyspace:'salvus', cb:(e,s)->console.log(e); s.add_server(host:'%s', cb:(e)->console.log('done',e);process.exit(0)))" | coffee """%hostname)

def install_startup_script():
    # startup:
    #   - run udpate script part that involves building stuff (not downloading)
    #   - start compute daemon
    #   - start all services
    cmd("crontab %s/scripts/dev/crontab.bak"%SALVUS_ROOT)

def dev_hints():
    ip = os.popen('gce-external-ip').read()
    open("/home/salvus/dev-hints.md",'w').write("""
# Developer hints:

- Email help@sagemath.com if you have any trouble and we'll pop in and help.

- To get the current external IP address of this VM, run the following command: 

        gce-external-ip

  The ip address can change when the machine is restarted. 

- ssh keys: The ssh key for the salvus user was generated specifically for this machine, 
  so you may want to add it to your github account so you can push to the 
  smc repo (https://github.com/sagemathinc/smc), or your fork of it.

- To rebuild all the modified coffeescript, etc., code:

        make_coffee

To run a process that watches for changes to files and runs make_coffee when
they change, type
 
        w

NOTE: You have to restart this if you add new files.

- WARNING: This is a GCE pre-empt instance, so it may stop at *any time*, and 
will definitely stop within 24 hours of starting.    Your files should not 
be impacted or lost by the instance stopping!  That said, don't depend on
backups of these dev instances.  Also, this instance has about 4GB RAM with no
swap, so running all services, the database, and a bunch of projects at once
may cause you to run out of memory -- watch out.  The ip address can change
when the machine restarts.

- This instances does NOT have all of the same Ubuntu packages or system-wide
stuff installed as the production compute machines, since that uses a lot more
disk space.  To install something, use "sudo apt-get", etc. 

- This instances serves both as a compute and web server machine.
It has no snapshots and no remote server to rsync files to, so of
course it is less robust, and not everything can be tested here.
      
- The services that run on a non-compute machine are: 

      hub, stunnel, haproxy, nginx and cassandra.

To control them, do this:

cd ~/salvus/salvus
ipython

Then 

     import admin; reload(admin); a = admin.Services('conf/deploy_devel/', password='')

and do stuff like this:

     a.restart("hub')

Every minute all services are started, just in case they went down, via a crontab.

- The service that runs on a compute machine is: compute
To stop/start it do this:

    compute stop;  comput start   # don't use "compute restart", which is broken
""")

def all():
    update_rep()

    get_sage_install()

    setup_projects_path()
    setup_quota()

    delete_secrets()
    create_ssh_keys()
    create_data_secrets()

    start_cassandra()
    init_cassandra_users()
    init_cassandra_schema()

    init_compute_server()
    install_startup_script()

    dev_hints()

if __name__ == "__main__":
    all()
