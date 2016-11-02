#!/usr/bin/env python3

import os, tempfile, time, shutil, subprocess, sys

# ensure that everything we spawn has this umask, which is more secure.
os.umask(0o077)

join = os.path.join

def log(*args):
    print(*args)
    sys.stdout.flush()

def run(v, shell=False, path='.', get_output=False, env=None, verbose=1):
    t = time.time()
    if isinstance(v, str):
        cmd = v
        shell = True
    else:
        cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
    if path != '.':
        cur = os.path.abspath(os.curdir)
        if verbose:
            print('chdir %s'%path)
        os.chdir(path)
    try:
        if verbose:
            print(cmd)
        if shell:
            kwds = {'shell':True, 'executable':'/bin/bash', 'env':env}
        else:
            kwds = {'env':env}
        if get_output:
            output = subprocess.Popen(v, stdout=subprocess.PIPE, **kwds).stdout.read().decode()
        else:
            if subprocess.call(v, **kwds):
                raise RuntimeError("error running '{cmd}'".format(cmd=cmd))
            output = None
        seconds = time.time() - t
        if verbose > 1:
            print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)

def self_signed_cert(target= 'nopassphrase.pem'):
    if os.path.exists('/projects/conf/nopassphrase.pem'):
        log("installing cert at '/projects/conf/nopassphrase.pem'")
        run("cp /projects/conf/nopassphrase.pem {target} && chmod og-rwx {target}".format(target=target))
        return
    log("create self_signed_cert")
    with tempfile.TemporaryDirectory() as tmp:
        run(['openssl', 'req', '-new', '-x509', '-nodes', '-out', 'server.crt',
                  '-keyout', 'server.key',
                  '-subj', '/C=US/ST=WA/L=WA/O=Network/OU=IT Department/CN=sagemath'], path=tmp)
        s  = open(join(tmp, 'server.crt')).read() + open(join(tmp, 'server.key')).read()
        open(target,'w').write(s)
        run("chmod og-rwx {target} && mkdir -p /projects/conf && cp {target} /projects/conf/nopassphrase.pem".format(target=target))

def init_projects_path():
    log("initialize /projects path")
    if not os.path.exists('/projects'):
        log("WARNING: container data will be EPHEMERAL -- in /projects")
        os.makedirs('/projects')
    # Ensure that users can see their own home directories:
    os.system("chmod a+rx /projects")
    for path in ['conf', 'rethinkdb']:
        full_path = join('/projects', path)
        if not os.path.exists(full_path):
            log("creating ", full_path)
            os.makedirs(full_path)

def start_services():
    for name in ['haproxy', 'nginx', 'rethinkdb', 'ssh']:
        run(['service', name, 'start'])

def root_ssh_keys():
    run("rm -rf /root/.ssh/")
    run("ssh-keygen -b 2048 -N '' -f /root/.ssh/id_rsa")
    run("cp -v /root/.ssh/id_rsa.pub /root/.ssh/authorized_keys")

def start_hub():
    run(". smc-env; service_hub.py --host=localhost --single  start & ", path='/smc/src')

def start_compute():
    run("mkdir -p /projects/conf && chmod og-rwx -R /projects/conf")
    run(". smc-env; compute --host=localhost --single start 1>/var/log/compute.log 2>/var/log/compute.err &", path='/smc/src')
    # sleep to wait for compute server to start and write port/secret
    run("""sleep 5; . smc-env; echo "require('smc-hub/compute-client').compute_server(cb:(e,s)-> s._add_server_single(cb:->process.exit(0)))" | coffee""", path='/smc/src')

def tail_logs():
    run("tail -f /var/log/compute.log /var/log/compute.err /smc/logs/*")

def init_sage():
    # if /sage/ is mounted as a sage install, then link to /usr/bin and install smc_sagews into it.
    if os.path.exists('/sage/sage'):
        run("ln -s /sage/sage .", path='/usr/bin')
    if os.system("which sage") == 0:
        # Sage is installed one way or another
        # Install packages into our copy of Sage
        run(". smc-env; sage -pip install --upgrade smc_sagews/", path='/smc/src')
        # Install sage scripts
        run("""echo "install_scripts('/usr/local/bin/')" | sage""")

def copy_rethinkdb_password():
    # The password location isn't passed in via the command line, but is currently
    # hard-coded in rethinkdb.coffee to be at
    # (process.env.SALVUS_ROOT ? '.') + '/data/secrets/rethinkdb'
    # Can delete this and use an option if location of pasword file can be set.
    log("copying over rethinkdb password so the hub can use it.")
    run("mkdir -p /smc/src/data/secrets && chmod og-rwx -R /smc/src/data && cp /projects/rethinkdb/password /smc/src/data/secrets/rethinkdb")

def init_rethinkdb_password():
    """
    If there is no /projects/rethinkdb/password, create it (randomly) with
    restrictive permissions, and connect to the database and set it.
    """
    password_file = '/projects/rethinkdb/password'
    if os.path.exists(password_file):
        log("RethinkDB password file '%s' already exists"%password_file)
        return
    log("creating RethinkDB password file '%s'"%password_file)
    import base64
    n = 63 # password length
    password = base64.b64encode(os.urandom(n)).decode()[:n]
    log("wrote Rethinkdb password to disk")
    open(password_file,'w').write(password)
    log("ensure database has restrictive permissions")
    run("chmod og-rwx -R /projects/rethinkdb")
    log("Set the new password in RethinkDB")
    for i in range(100):
        try:
            import rethinkdb as r
            conn = r.connect()
            r.db('rethinkdb').table('users').get('admin').update({'password': password}).run(conn)
            log("Successfully set database password")
            return
        except Exception:
            log("Failed -- waiting...")
            time.sleep(1)
            continue
    log("Failed to set database password; moving old pasword file so will try to create password next time")
    shutil.move(password_file, password_file+"old")

def main():
    self_signed_cert('/nopassphrase.pem')
    init_projects_path()
    init_sage()
    start_services()
    root_ssh_keys()
    init_rethinkdb_password()
    copy_rethinkdb_password()
    start_hub()
    start_compute()
    while True:
        time.sleep(3600)

if __name__ == "__main__":
    main()
