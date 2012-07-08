"""
Launch control
"""

import logging, os

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # warning, info


DATA = 'data'
def init_data_directory():
    log.info("ensuring that the data directory exist")
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    log.info("ensuring that the data directory has restrictive permissions")
    if os.stat(DATA) != 040700:
        os.chmod(DATA, 040700)

def read_configuration_file():
    log.info('reading configuration file')

def launch_nginx_servers():
    log.info('launching nginx servers')

def launch_haproxy_servers():
    log.info('launching haproxy servers')    

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
    init_data_directory()
    read_configuration_file()
    launch_servers()
    try:
        monitor_servers()
    finally:
        quit_servers()



