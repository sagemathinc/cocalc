#!/usr/bin/env python
"""
sagenb.py -- start a sage notebook server
"""

########################################################################################
#       Copyright (C) 2012 William Stein <wstein@gmail.com>
#
#  Distributed under the terms of the GNU General Public License (GPL), version 2+
#
#                  http://www.gnu.org/licenses/
#########################################################################################

import logging, os, signal, shutil, subprocess, sys, time

# configure logging
logging.basicConfig()
log = logging.getLogger('sage_server')
log.setLevel(logging.INFO)

def drop_privileges(id, home):        
    gid = id
    uid = id
    os.chown(home, uid, gid)
    os.setgid(gid)
    os.setuid(uid)
    os.environ['DOT_SAGE'] = home
    os.environ['IPYTHON_DIR'] = home
    os.chdir(home)

def run(args):
    log.info(' '.join(args))
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                                stderr=subprocess.PIPE)
    p.wait()
    log.info('output = %s'%p.stdout.read())
    log.info('err = %s'%p.stderr.read())
    return p.returncode

def create_user(basename):
    i = 0
    name = basename + str(i)
    while run(['useradd', '-m', name]):
        i += 1
        name = basename + str(i)
    return name

def system(cmd):
    log.info(cmd)
    e = os.system(cmd) 
    if e:
        log.info("WARNING -- nonzero exit from '%s'", cmd)
    return e

def serve(path, port, address, timeout, daemon_mode, pool_size):
    log.info("served")

    if not os.path.exists(path):
         os.makedirs(path)

    users = []; servers = []

    try:
        # create new unix users: 'server' and users
        server = create_user('server')
        servers.append(server)

        # make 'server' user own path
        run(['chown', '-R', server + '.', path])
        system('su %s -c "ssh-keygen -b 2048 -N \'\' -f ~/.ssh/id_rsa"'%server)

        # make pool_size more users
        users = []
        while len(users) < pool_size:
            user = create_user('user')
            users.append(user)
            # make it so server can ssh without a password to be user
            system('su %s -c "ssh-keygen -b 2048 -N \'\' -f ~/.ssh/id_rsa"'%user)
            authorized_keys = os.path.join('/home', user, '.ssh/authorized_keys')
            shutil.copyfile(os.path.join('/home', server, '.ssh/id_rsa.pub'), authorized_keys)
            run(['chown', user+'.', authorized_keys])
            run(['chmod', 'og-rwx', authorized_keys])
            system('su %s -c "ssh -o \'StrictHostKeyChecking no\' %s@localhost ls"'%(server, user))

        # launch sage notebook server
        try:
            system('''su %s -c "sage -c 'notebook(directory=\\"%s\\", port=%s, interface=\\"%s\\", accounts=True, open_viewer=False, timeout=%s, server_pool=[%s])'%s"'''%(server, os.path.join(path, 'notebook'), port, address, timeout, ','.join(['\\"%s@localhost\\"'%user for user in users]), '&' if daemon_mode else ''))

            # wait to receive term signal, and then shutdown sagenb process
            if daemon_mode:
                while True:
                    time.sleep(.1)

        finally:
            # clean up sagenb subprocess
            pid = os.path.join(path, 'notebook.sagenb', 'twistd.pid')
            if os.path.exists(pid):
                p = int(open(pid).read())
                log.info("sending kill signal(s) to process with pid %s", p)
                os.kill(p, signal.SIGTERM)
            else:
                log.info("no sagenb twistd pid file '%s'", pid)
            
    finally:
        # clean up users
        for user in servers + users:
              system('killall -u %s; deluser --remove-home %s >/dev/null 2>/dev/null'%(user, user))
            
def run_sagenb(path, port, address, pidfile, logfile, daemon_mode, pool_size):
    if pidfile:
        open(pidfile,'w').write(str(os.getpid()))
    if logfile:
        log.addHandler(logging.FileHandler(logfile))
    log.info("port=%s, address=%s, pidfile='%s', logfile='%s'", port, address, pidfile, logfile)
    try:
        serve(path, port, address, timeout=3600,daemon_mode=daemon_mode, pool_size=pool_size)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Create two users, and run a Sage notebook server, with code evaluated by one user and the notebook server process run as the other user.")
    
    parser.add_argument("--port", dest="port", type=int, default=8080, help="port to listen on (default: 8080)")
    parser.add_argument("--path", dest="path", type=str, help="path in which to store sage notebook files")
    parser.add_argument("--daemon", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--address", dest="address", type=str,
                        help="address of interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")

    parser.add_argument("--pool_size", dest='pool_size', type=int, default=16,
                        help="number of users to create for the pool")

    parser.add_argument("--log_level", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")

    args = parser.parse_args()

    if os.environ['USER'] != 'root':
        print "%s: this script must be run as root"%sys.argv[0]
        sys.exit(1)
        

    if not args.address:
        print "%s: must specify address to bind to"%sys.argv[0]
        sys.exit(1)

    if args.daemon and not args.pidfile:
        print "%s: must specify pidfile in daemon mode"%sys.argv[0]
        sys.exit(1)
    
    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

    pidfile = os.path.abspath(args.pidfile) if args.pidfile else ''
    logfile = os.path.abspath(args.logfile) if args.logfile else ''
    
    main = lambda: run_sagenb(args.path, args.port, args.address, pidfile, logfile, args.daemon, args.pool_size)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
