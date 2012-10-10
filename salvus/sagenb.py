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

import logging, os, shutil, subprocess, sys

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
    log.info('output = ', p.stdout.read())
    log.info('err = ', p.stderr.read())
    return p.returncode

def create_user(basename):
    i = 0
    name = basename + str(i)
    while run(['useradd', '-m', name]):
        i += 1
        name = basename + str(i)
    return name

def serve(path, port, address, timeout):
    log.info("served")

    # create two new unix users: 'server' and 'user'
    server = create_user('server')
    try:
        user = create_user('user')
        try:
            # make 'server' user own path
            run(['chown', '-R', server + '.', path])
            
            # make it so server can ssh without a password to be user
            run(['su', server, '-c', '"ssh-keygen -b 2048 -N \'\' -f ~/.ssh/id_rsa"'])  # generate ssh key for server
            run(['su', user, '-c', '"ssh-keygen -b 2048 -N \'\' -f ~/.ssh/id_rsa"'])  # generate ssh key for user
            shutil.copyfile(os.path.join('/home', server, '.ssh/id_rsa.pub'),
                            os.path.join('/home', user, '.ssh/authorized_keys'))
            run(['chown', user+'.', os.path.join('/home', user, '.ssh/authorized_keys')])
            run(['su', server, '-c', '"ssh -o \'StrictHostKeyChecking no\' %s@localhost ls"'%user]) # host key verification...
            
            # launch sage notebook server
            # TODO -- pass options!!!!
            run(['su', server, '-c', '"sage --notebook directory=%s port=%s interface=%s accounts=True open_viewer=False --timeout=%s --server_pool=[\"%s@localhost\"]"'%(path, port, address, timeout, user)])
            
        finally:
            run(['deluser', '--remove-all-files', 'user'])

    finally:
        # delete users
        run(['deluser', '--remove-home',  server])
            
def run_sagenb(path, port, address, pidfile, logfile):
    if pidfile:
        open(pidfile,'w').write(str(os.getpid()))
    if logfile:
        log.addHandler(logging.FileHandler(logfile))
    log.info("port=%s, address=%s, pidfile='%s', logfile='%s'", port, address, pidfile, logfile)
    try:
        serve(path, port, address, timeout=3600)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Create two users, and run a Sage notebook server, with code evaluated by one user and the notebook server process run as the other user.")
    
    parser.add_argument("--port", dest="port", type=int, default=8080, help="port to listen on (default: 8080)")
    parser.add_argument("--path", dest="path", type=int, help="path in which to store sage notebook files")
    parser.add_argument("--daemon", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--address", dest="address", type=str,
                        help="address of interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")

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
    
    main = lambda: run_sagenb(args.path, args.port, args.address, pidfile, logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
