#!/usr/bin/env python

# Script to initialize a dev machine for use for development.
import os, sys

if "SALVUS_ROOT" not in os.environ:
    os.environ['SALVUS_ROOT']='/home/salvus/salvus/salvus/'

SALVUS_ROOT=os.environ['SALVUS_ROOT']
os.chdir(SALVUS_ROOT)

sys.path.append(os.path.join(os.environ['SALVUS_ROOT'], 'scripts'))
from smc_firewall import cmd, log

def update_rep():
    log("update repo")
    cmd("git stash save xxx; git pull")

def get_sage_install():
    log("installling packages so that sage will work")
    cmd("sudo apt-get install -y libatlas3gf-base liblapack-dev", system=True)
    log("get sage install (about 5-10 minutes)")
    cmd("sudo mkdir -p /usr/local/sage/current")
    cmd("sudo chown -R salvus. /usr/local/sage")
    v = cmd("ssh compute4-us ls /projects/sage/").splitlines()
    v.sort()
    v = [x for x in v if x.startswith('sage-')]
    cur = v[-1]
    log("newest version=%s", cur)
    cmd("rsync -axH compute4-us:/projects/sage/%s/ /usr/local/sage/current/"%cur, system=True)
    log("create link")
    cmd("sudo ln -sf /usr/local/sage/current/sage /usr/local/bin/sage")
    log("run sage once")
    cmd("umask 022; /usr/local/bin/sage -b < /dev/null")

def setup_paths():
    log("create paths")
    cmd("sudo mkdir -p /projects")
    cmd("sudo mkdir -p /projects/conf")
    cmd("sudo chown salvus. /projects/conf")
    cmd("sudo mkdir -p /projects/sagemathcloud")
    cmd("sudo rsync -LrxH --delete /home/salvus/salvus/salvus/local_hub_template/ /projects/sagemathcloud/")

def setup_quota():
    log("quota packages")
    cmd("sudo apt-get install -y libatlas3gf-base liblapack-dev  quota quotatool linux-image-extra-virtual", system=True)
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
    cmd('ssh-keyscan -H localhost > ~/.ssh/known_hosts')
    log("generate root ssh key")
    cmd('sudo ssh-keygen -b2048 -t rsa -N "" -f /root/.ssh/id_rsa', system=True)
    cmd('sudo cat /root/.ssh/id_rsa.pub | sudo tee  /root/.ssh/authorized_keys')
    cmd('sudo ssh-keyscan -H localhost |  sudo tee  /root/.ssh/known_hosts')

def create_data_secrets():
    secrets = os.path.join(SALVUS_ROOT, 'data', 'secrets')
    cmd("mkdir -p %s"%secrets)
    log("sendgrid fake password (will not work)")
    cmd("echo 'will-not-work' > %s/sendgrid_email_password"%secrets)
    log("generate cassandra passwords")
    cmd("mkdir -p %s/cassandra"%secrets)
    cmd("makepasswd -q > %s/cassandra/hub"%secrets)
    cmd("makepasswd -q > %s/cassandra/salvus"%secrets)
    cmd("mkdir -p %s/sagemath.com"%secrets)
    cmd("openssl req -new -x509 -days 2000 -nodes -out stunnel.pem -keyout %s/sagemath.com/nopassphrase.pem < /dev/null"%secrets)

def init_db_schema():
    pass

def install_startup_script():
    pass

def all():
    update_rep()
    get_sage_install()
    setup_paths()
    setup_quota()
    delete_secrets()
    create_ssh_keys()
    create_data_secrets()
    init_db_scheme()
    install_startup_script()

#all()

delete_secrets()
create_ssh_keys()
create_data_secrets()
