#!/usr/bin/env python3

"""
Launch control
"""

import logging, os, stat, time

log_files = {'postgresql':'postgres.log',
             }

ports = {'postgresql':5432,  # also coded into postgresql.conf
         }  

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO


DATA = os.path.abspath('data')
LOGS = os.path.join(DATA, 'logs')
def init_data_directory():
    log.info("ensuring that the data directory exist")
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    if not os.path.exists(LOGS):
        os.makedirs(LOGS)

    log.info("ensuring that the data directory has restrictive permissions")
    if os.stat(DATA)[stat.ST_MODE] != 0o40700:
        os.chmod(DATA, 0o40700)

    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']

DATABASE = os.path.join(DATA, 'db')

def read_configuration_file():
    log.info('reading configuration file')



def cmd(s, path='.'):
    s = 'cd "%s" && '%path + s
    log.info("cmd: %s", s)
    if os.system(s):
        raise RuntimeError('command failed: "%s"'%s)


def launch_nginx_servers():
    log.info('launching nginx servers')
    cmd('nginx -c "%s"'%os.path.abspath('nginx.conf'),'')

def launch_haproxy_servers():
    log.info('launching haproxy servers')
    cmd('sudo haproxy -f haproxy.conf', '')

def start_postgresql():
    cmd('pg_ctl start -D "%s" -l data/logs/%s'%(DATABASE, log_files['postgresql']), '')
    
def initialize_postgresql_database():    
    # on OS X this initdb can fail.  The fix (see http://willbryant.net/software/mac_os_x/postgres_initdb_fatal_shared_memory_error_on_leopard) is to type "sudo sysctl -w kern.sysv.shmall=65536" and also create /etc/sysctl.conf with content "kern.sysv.shmall=65536".
    cmd('initdb -D "%s"'%DATABASE, '')
    cmd('rm postgresql.conf', 'data/db')
    cmd('ln -s ../../postgresql.conf .', 'data/db')
    start_postgresql()
    for i in range(5):
        time.sleep(0.5)
        try:
            cmd('createdb -p %s sagews'%ports['postgresql'])
            break
        except:
            pass

def launch_postgresql_servers():
    log.info('launching postgresql servers')
    if not os.path.exists(DATABASE):
        initialize_postgresql_database()
    else:
        start_postgresql()

def launch_database_servers():
    log.info('launching database servers')        

def launch_memcached_servers():
    log.info('launching memcached servers')        

def launch_backend_servers():
    log.info('launching backend servers')        

def launch_worker_servers():
    log.info('launching worker servers')            

def launch_servers():
    launch_nginx_servers()
    launch_haproxy_servers()
    launch_database_servers()
    launch_memcached_servers()
    launch_backend_servers()
    launch_worker_servers()

def monitor_servers():
    # TODO
    import time
    time.sleep(1e6)

def quit_servers():
    # TODO
    return

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Launch components of sagews")

    parser.add_argument('--launch_nginx', dest='launch_nginx', action='store_const', const=True, default=False,
                        help="launch the NGINX server")

    parser.add_argument('--launch_haproxy', dest='launch_haproxy', action='store_const', const=True, default=False,
                        help="launch the haproxy server")

    parser.add_argument('--launch_postgresql', dest='launch_postgresql', action='store_const', const=True, default=False,
                        help="launch the postgresql database server")

    args = parser.parse_args()
    
    init_data_directory()
    read_configuration_file()

    if args.launch_nginx:
        launch_nginx_servers()

    if args.launch_haproxy:
        launch_haproxy_servers()

    if args.launch_postgresql:
        launch_postgresql_servers()
