#!/usr/bin/env python

"""
Building the main components of sagews from source, ensuring that all
important (usually security-related) options are compiled in.

The components of sagews are:

    * openssl  
    * memcached
    * python
    * nginx
    * haproxy
    * openvpn 
    * postgreSQL
    * protobuf

For security and flexibility reasons, we want the option to regularly
update or possibly modify components.

Also, Sage is pre-installed in the worker VM.  

"""

import logging, os, shutil, subprocess, sys, time

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO

OS     = os.uname()[0]
DATA   = os.path.abspath('data')
SRC    = os.path.abspath('src')
PATCHES= os.path.join(SRC, 'patches')
BUILD  = os.path.abspath(os.path.join(DATA, 'build'))
TARGET = os.path.abspath(os.path.join(DATA, 'local'))

PYTHON_PACKAGES = [
    'ipython',            # a usable command line  
    'tornado',            # async webserver
    'sockjs-tornado',     # websocket support
    'python-memcached',   # memcached for database
    'python-daemon',      # daemonization of python modules
    'psycopg2',           # postgreSQL support for ORM
    'momoko',             # async postgreSQL support
    ]

if not os.path.exists(BUILD):
    os.makedirs(BUILD)

os.environ['PATH'] = os.path.join(TARGET, 'bin') + ':' + os.environ['PATH']

# number of cpus
try:
    NCPU = os.sysconf("SC_NPROCESSORS_ONLN")
except:
    NCPU = int(subprocess.Popen("sysctl -n hw.ncpu", shell=True, stdin=subprocess.PIPE,
                 stdout = subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True).stdout.read())

log.info("detected %s cpus", NCPU)


def cmd(s, path):
    s = 'cd "%s" && '%path + s
    log.info("cmd: %s", s)
    if os.system(s):
        raise RuntimeError('command failed: "%s"'%s)

def extract_package(basename):
    # find tar ball in SRC directory, extract it in build directory, and return resulting path
    for filename in os.listdir(SRC):
        if filename.startswith(basename):
            i = filename.rfind('.tar.')
            path = os.path.join(BUILD, filename[:i])
            if os.path.exists(path):
                shutil.rmtree(path)
            cmd('tar xvf "%s"'%os.path.abspath(os.path.join(SRC, filename)), BUILD)
            return path

def build_openssl():
    log.info("building openssl..."); start = time.time()
    try:
        path = extract_package('openssl')
        cmd('./Configure %s shared --prefix="%s"'%(
            'linux-x86_64' if os.uname()[0]=="Linux" else 'darwin64-x86_64-cc', TARGET), path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_openvpn():
    log.info('building openvpn'); start = time.time()
    try:
        path = extract_package('openvpn')
        # patch from http://thread.gmane.org/gmane.network.openvpn.devel/4953
        cmd('patch -p0 < %s/openvpn.patch'%PATCHES, path)  # diff -Naur syshead.h  ~/syshead.h > ../patches/openvpn.patch
        cmd('./configure --prefix="%s" --disable-lzo --with-ssl-headers=%s --with-ssl-lib=%s'%(
            TARGET, os.path.join(TARGET, 'include/openssl'), os.path.join(TARGET, 'lib')), path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_memcached():
    log.info("building memcached..."); start = time.time()
    try:
        path = extract_package('memcached')
        cmd('./configure --prefix="%s" --enable-sasl'%TARGET, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_python():
    log.info('building python'); start = time.time()
    try:
        path = extract_package('Python')
        cmd('./configure --prefix="%s"  --libdir="%s"/lib --enable-shared'%(TARGET,TARGET), path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_nginx():
    log.info('building nginx'); start = time.time()
    try:
        path = extract_package('nginx')
        cmd('./configure --without-http_rewrite_module --prefix="%s"'%TARGET, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
        cmd('mv sbin/nginx bin/', TARGET)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_haproxy():
    log.info('building haproxy'); start = time.time()
    try:
        path = extract_package('haproxy')

        # patch log.c so it can write the log to a file instead of syslog
        cmd('patch -p0 < %s/haproxy.patch'%PATCHES, path)  # diff -Naur src/log.c  ~/log.c > ../patches/haproxy.patch
        cmd('make -j %s TARGET=%s'%(NCPU, 'linux2628' if OS=="Linux" else 'generic'), path)
        cmd('cp haproxy "%s"/bin/'%TARGET, path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_stunnel():
    log.info('building stunnel'); start = time.time()
    try:
        path = extract_package('stunnel')
        cmd('./configure --prefix="%s"'%TARGET, path)        
        cmd('make -j %s'%NCPU, path)
        cmd('make install < /dev/null', path)  # make build non-interactive -- I don't care about filling in a form for a demo example
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_postgresql():
    log.info('building postgreSQL'); start = time.time()
    try:
        path = extract_package('postgresql')
        cmd('./configure --prefix="%s"'%TARGET, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        


def build_protobuf():
    log.info('building protobuf'); start = time.time()
    try:
        path = extract_package('protobuf')
        cmd('./configure --prefix="%s"'%TARGET, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
        cmd('python setup.py install', os.path.join(path, 'python'))
        cmd('sage setup.py install', os.path.join(path, 'python'))
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

def build_python_packages():
    log.info('building python_packages'); start = time.time()
    try:
        path = extract_package('distribute')
        cmd('python setup.py install', path)
        cmd('easy_install ' + ' '.join(PYTHON_PACKAGES), os.path.join(TARGET, 'bin'))
        path = extract_package('tornado-memcache')
        cmd('python setup.py install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start        

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build packages from source")

    parser.add_argument('--build_all', dest='build_all', action='store_const', const=True, default=False,
                        help="build everything")

    parser.add_argument('--build_openssl', dest='build_openssl', action='store_const', const=True, default=False,
                        help="build the openssl library")

    parser.add_argument('--build_openvpn', dest='build_openvpn', action='store_const', const=True, default=False,
                        help="build openvpn")

    parser.add_argument('--build_memcached', dest='build_memcached', action='store_const', const=True, default=False,
                        help="build memcached")

    parser.add_argument('--build_python', dest='build_python', action='store_const', const=True, default=False,
                        help="build the python interpreter")

    parser.add_argument('--build_nginx', dest='build_nginx', action='store_const', const=True, default=False,
                        help="build the nginx web server")

    parser.add_argument('--build_haproxy', dest='build_haproxy', action='store_const', const=True, default=False,
                        help="build the haproxy server")

    parser.add_argument('--build_stunnel', dest='build_stunnel', action='store_const', const=True, default=False,
                        help="build the stunnel server")
    
    parser.add_argument('--build_postgresql', dest='build_postgresql', action='store_const', const=True, default=False,
                        help="build the postgresql database server")

    parser.add_argument('--build_protobuf', dest='build_protobuf', action='store_const', const=True, default=False,
                        help="build Google's protocol buffers compiler")

    parser.add_argument('--build_python_packages', dest='build_python_packages', action='store_const', const=True, default=False,
                        help="install all Python packages")

    args = parser.parse_args()

    try:
        times = {}
        if args.build_all or args.build_openssl:
            times['openssl'] = build_openssl()

        if args.build_all or args.build_openvpn:
            times['openvpn'] = build_openvpn()

        if args.build_all or args.build_memcached:
            times['memcached'] = build_memcached()

        if args.build_all or args.build_python:
            times['python'] = build_python()

        if args.build_all or args.build_nginx:
            times['nginx'] = build_nginx()

        if args.build_all or args.build_haproxy:
            times['haproxy'] = build_haproxy()

        if args.build_all or args.build_stunnel:
            times['stunnel'] = build_stunnel()

        if args.build_all or args.build_postgresql:
            times['postgresql'] = build_postgresql()

        if args.build_all or args.build_protobuf:
            times['protobuf'] = build_protobuf()

        if args.build_all or args.build_python_packages:
            times['python_packages'] = build_python_packages()

    finally:
        if times:
            log.info("Times: %s", times)
