#!/usr/bin/env python3

import os, tempfile, time, subprocess, sys

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

def init_projects_path():
    log("initialize /projects path")
    if not os.path.exists('/projects'):
        log("WARNING: container data will be EPHEMERAL -- in /projects")
        os.makedirs('/projects')
    for path in ['conf', 'rethinkdb']:
        full_path = join('/projects', path)
        if not os.path.exists(full_path):
            log("creating ", full_path)
            os.makedirs(full_path)

def start_services():
    run(['service', 'haproxy', 'start'])
    run(['service', 'nginx', 'start'])
    run(['service', 'rethinkdb', 'start'])

def start_hub():
    run(". smc-env; service_hub.py --host=localhost --single  start & ", path='/smc/src')

def start_compute():
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


def main():
    self_signed_cert('/nopassphrase.pem')
    init_projects_path()
    init_sage()
    start_services()
    start_hub()
    start_compute()
    while True:
        time.sleep(3600)

if __name__ == "__main__":
    main()