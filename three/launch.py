#!/usr/bin/env python3

"""
Launch control
"""

import logging, os, stat

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO


DATA = os.path.abspath('data')
def init_data_directory():
    log.info("ensuring that the data directory exist")
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    log.info("ensuring that the data directory has restrictive permissions")
    if os.stat(DATA)[stat.ST_MODE] != 0o40700:
        os.chmod(DATA, 0o40700)

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

    args = parser.parse_args()
    
    init_data_directory()
    read_configuration_file()

    if args.launch_nginx:
        launch_nginx_servers()

    if args.launch_haproxy:
        launch_haproxy_servers()

