#!/usr/bin/env python

"""
Building the main components of cloud.sagemath.com from source, ensuring that all
important (usually security-related) options are compiled in.

The components are:

    * python -- build managements and some packages
    * node.js -- dynamic async; most things
    * nginx -- static web server
    * haproxy -- proxy and load balancer
    * stunnel -- ssl termination
    * tinc -- p2p vpn
    * cassandra -- distributed database
    * bup -- git-ish backup
    * sage -- we do *not* build or include Sage; it must be available system-wide or for
      user in order for worksheets to work (everything but worksheets should work without Sage).

Supported Platform: Ubuntu 12.04

Before building, do:

   0. Change this line in /etc/login.defs:  "UMASK           077"

   1. ATLAS:

         apt-get install libatlas3gf-base liblapack-dev
         cd /usr/lib/
         ln -s libatlas.so.3gf libatlas.so
         ln -s libcblas.so.3gf libcblas.so
         ln -s libf77blas.so.3gf libf77blas.so

   This line is in the .sagemathcloud env, so building sage is fast for users.

         export SAGE_ATLAS_LIB="/usr/lib/"



   2. Install critical packages:

         sudo apt-get install iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre

# old java times...
         sudo apt-get install iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev oracle-java6-installer libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc

         update-alternatives --config java  # select "oracle java 6"    # NOT 7!


   3. Additional packages (mainly for users, not building).

   sudo apt-get install emacs vim texlive texlive-* gv imagemagick octave mercurial flex bison unzip libzmq-dev uuid-dev scilab axiom yacas octave-symbolic quota quotatool dot2tex python-numpy python-scipy python-pandas python-tables libglpk-de vlibnetcdf-de vpython-netcdf python-h5py zsh python3 python3-zmq python3-setuptools cython htop ccache python-virtualenv clang libgeos-devs sloccount racket libxml2-dev libxslt-dev irssi libevent-dev tmux sysstat sbcl gawk noweb libgmp3-dev ghc  ghc-doc ghc-haddock ghc-mod ghc-prof haskell-mode haskell-doc subversion cvs bzr rcs subversion-tools git-svn markdown lua5.2 encfs

   sudo add-apt-repository ppa:pippijn/ppa
   sudo apt-get update; sudo apt-get install aldor

   4. Ensure tmux is at least 1.8 and if not:

       wget http://downloads.sourceforge.net/tmux/tmux-1.8.tar.gz && tar xvf tmux-1.8.tar.gz && cd tmux-1.8/ &&  ./configure && make -j40 && sudo make install



# SAGE SCRIPTS:
  Do "install_scripts('/usr/local/bin/')" from within Sage (as root).

# POLYMAKE system-wide:

  # From http://www.polymake.org/doku.php/howto/install

  * sudo apt-get install ant default-jdk g++ libboost-dev libgmp-dev libgmpxx4ldbl libmpfr-dev libperl-dev libsvn-perl libterm-readline-gnu-perl libxml-libxml-perl libxml-libxslt-perl libxml-perl libxml-writer-perl libxml2-dev w3c-dtd-xhtml xsltproc

  # Then... get latest from http://www.polymake.org/doku.php/download/start and do
  * ./configure; make -j32; sudo make install

  # Then delete the polymake build directory.

# MACAULAY2:

Install Macaulay2 system-wide from here: http://www.math.uiuc.edu/Macaulay2/Downloads/

  wget http://www.math.uiuc.edu/Macaulay2/Downloads/Common/Macaulay2-1.6-common.deb
  wget http://www.math.uiuc.edu/Macaulay2/Downloads/GNU-Linux/Ubuntu/Macaulay2-1.6-amd64-Linux-Ubuntu-12.04.deb
  sudo apt-get install libntl-5.4.2 libpari-gmp3
  sudo dpkg -i Macaulay2-1.6-common.deb Macaulay2-1.6-amd64-Linux-Ubuntu-12.04.deb

# Build Sage (as usual)

umask 022   # always do this so that the resulting build is usable without painful permission hacking.

export SAGE_ATLAS_LIB=/usr/lib/
export MAKE="make -j20"
make

# Non-sage Python packages into Sage

./sage -sh

easy_install pip

# pip install each of these in a row: unfortunately "pip install <list of packages>" doesn't work at all.
# Execute this inside of sage:

[os.system("pip install %s"%s) for s in 'virtualenv pandas statsmodels numexpr tables scikit_learn scikits-image scimath Shapely SimPy xlrd xlwt pyproj bitarray h5py netcdf4 patsy lxml'.split()]

(Mike Hansen remarks: You can just have a text file with a list of the package names (with or without versions) in say extra_packages.txt and do "pip install -r extra_packages.txt")

# basemap -- won't install through pip/easy_install, so we do this:

    sage -sh
    wget http://downloads.sourceforge.net/project/matplotlib/matplotlib-toolkits/basemap-1.0.6/basemap-1.0.6.tar.gz; tar xf basemap-1.0.6.tar.gz; cd basemap-1.0.6; python setup.py install; cd ..; rm -rf basemap-1.0.6*

# Also, edit the banner:

  local/bin/sage-banner

        +--------------------------------------------------------------------+
        | Sage Version 5.10.beta5, Release Date: 2013-05-26                  |
        | Enhanced for the Sagemath Cloud                                    |
        | Type "help()" for help.                                            |
        +--------------------------------------------------------------------+

# OPTIONAL SAGE PACKAGES

./sage -i biopython-1.61  database_cremona_ellcurve database_odlyzko_zeta database_pari biopython brian cbc cluster_seed coxeter3 cryptominisat cunningham_tables database_gap database_jones_numfield database_kohel database_sloane_oeis database_symbolic_data dot2tex gap_packages gnuplotpy guppy kash3  lie lrs nauty normaliz nose nzmath p_group_cohomology phc pybtex pycryptoplus pyx pyzmq qhull  TOPCOM zeromq

# EXPERIMENTAL PACKAGES

   ./sage -i chomp


# Then delete stupidly wasted space

   rm spkg/optional/*


# 4ti2 into sage: until the optional spkg gets fixed:


  ./sage -sh
  cd /tmp; wget http://wstein.org/home/wstein/cloud/4ti2-1.5.tar.gz && tar xf 4ti2-1.5.tar.gz && cd 4ti2-1.5 ; ./configure --prefix=/usr/local/sage/current/local/; time make -j16
  make install      # this *must* be a separate step!!
  cd ..; rm -rf 4ti2*


# Copy over the newest SageTex, so it actually works (only do this with the default sage):

   sudo cp /usr/local/sage/current/local/share/texmf/tex/generic/sagetex/sagetex.sty /usr/share/texmf-texlive/tex/latex/sagetex/


# Fix permissions, just in case!

  chmod -R a+r /usr/local/sage/sage-5.11

# Run sage one lst time

  ./sage

"""

CASSANDRA_VERSION='1.2.4'   # options here -- http://downloads.datastax.com/community/

import logging, os, shutil, subprocess, sys, time

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO

OS     = os.uname()[0]
PWD    = os.path.abspath('.')
DATA   = os.path.abspath('data')
SRC    = os.path.abspath('src')
PATCHES= os.path.join(SRC, 'patches')
BUILD  = os.path.abspath(os.path.join(DATA, 'build'))
PREFIX = os.path.abspath(os.path.join(DATA, 'local'))
os.environ['PREFIX'] = PREFIX

NODE_MODULES = [
    'commander', 'start-stop-daemon', 'winston', 'sockjs', 'helenus',
    'sockjs-client-ws', 'coffee-script', 'node-uuid', 'browserify@1.16.4', 'uglify-js2',
    'passport', 'passport-github', 'express', 'nodeunit', 'validator', 'async',
    'password-hash', 'emailjs', 'cookies', 'htmlparser', 'mime', 'pty.js', 'posix',
    'mkdirp', 'walk', 'temp', 'portfinder', 'googlediff', 'formidable@latest',
    'moment', 'underscore', 'read'
    ]

PYTHON_PACKAGES = [
    'ipython','readline', # a usable command line  (ipython uses readline)
    'python-daemon',      # daemonization of python modules
    'paramiko',           # ssh2 implementation in python
    'cql',                # interface to Cassandra
    'fuse-python',        # used by bup: Python bindings to "filesystem in user space"
    'pyxattr',            # used by bup
    'pylibacl'            # used by bup
    ]

if not os.path.exists(BUILD):
    os.makedirs(BUILD)

os.environ['PATH'] = os.path.join(PREFIX, 'bin') + ':' + os.environ['PATH']
os.environ['LD_LIBRARY_PATH'] = os.path.join(PREFIX, 'lib') + ':' + os.environ.get('LD_LIBRARY_PATH','')

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

def download(url):
    # download target of given url to SRC directory
    cmd("wget '%s'"%url, SRC)

def extract_package(basename):
    # find tar ball in SRC directory, extract it in build directory, and return resulting path
    for filename in os.listdir(SRC):
        if filename.startswith(basename):
            i = filename.rfind('.tar.')
            path = os.path.join(BUILD, filename[:i])
            if os.path.exists(path):
                shutil.rmtree(path)
            cmd('tar xf "%s"'%os.path.abspath(os.path.join(SRC, filename)), BUILD)
            return path

def build_tinc():
    log.info('building tinc'); start = time.time()
    try:
        path = extract_package('tinc')
        cmd('./configure --prefix="%s"'%PREFIX, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_python():
    log.info('building python'); start = time.time()
    try:
        path = extract_package('Python')
        cmd('./configure --prefix="%s"  --libdir="%s"/lib --enable-shared'%(PREFIX,PREFIX), path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_node():
    log.info('building node'); start = time.time()
    try:
        path = extract_package('node')
        cmd('./configure --prefix="%s"'%PREFIX, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
        cmd('git clone git://github.com/isaacs/npm.git && cd npm && make install', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_nginx():
    log.info('building nginx'); start = time.time()
    try:
        path = extract_package('nginx')
        cmd('./configure --without-http_rewrite_module --prefix="%s"'%PREFIX, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
        cmd('mv sbin/nginx bin/', PREFIX)
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
        cmd('cp haproxy "%s"/bin/'%PREFIX, path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_stunnel():
    log.info('building stunnel'); start = time.time()
    try:
        path = extract_package('stunnel')
        cmd('./configure --prefix="%s"'%PREFIX, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install < /dev/null', path)  # make build non-interactive -- I don't care about filling in a form for a demo example
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_cassandra():
    log.info('installing cassandra'); start = time.time()
    try:
        target = 'dsc-cassandra-%s.tar.gz'%CASSANDRA_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd('rm -f dsc-cassandra-*.tar.*', SRC)  # remove any source tarballs that might have got left around
            download('http://downloads.datastax.com/community/dsc-cassandra-%s-bin.tar.gz'%CASSANDRA_VERSION)
            cmd('mv dsc-cassandra-%s-bin.tar.gz dsc-cassandra-%s.tar.gz'%(CASSANDRA_VERSION, CASSANDRA_VERSION), SRC)
        path = extract_package('dsc-cassandra')
        target2 = os.path.join(PREFIX, 'cassandra')
        print target2
        if os.path.exists(target2):
            shutil.rmtree(target2)
        os.makedirs(target2)
        print "copying over"
        cmd('cp -rv * "%s"'%target2, path)
        cmd('cp -v "%s/start-cassandra" "%s"/'%(PATCHES, os.path.join(PREFIX, 'bin')), path)
        print "making symlink so can use fast JNA java native thing"
        cmd("ln -sf /usr/share/java/jna.jar %s/local/cassandra/lib/"%DATA, path)

        print "building python library"
        cmd("cd pylib && python setup.py install", path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_python_packages():
    log.info('building python_packages'); start = time.time()
    try:
        path = extract_package('distribute')
        cmd('python setup.py install', path)
        for pkg in PYTHON_PACKAGES:
            cmd('easy_install %s'%pkg, '/tmp')
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_bup():
    log.info('building bup'); start = time.time()
    try:
        path = extract_package('bup')
        cmd('./build', path)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_node_modules():
    log.info('building node_modules'); start = time.time()
    try:
        cmd('npm install %s'%(' '.join(NODE_MODULES)), PWD)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build packages from source")

    parser.add_argument('--build_all', dest='build_all', action='store_const', const=True, default=False,
                        help="build everything")

    parser.add_argument('--build_tinc', dest='build_tinc', action='store_const', const=True, default=False,
                        help="build tinc")

    parser.add_argument('--build_python', dest='build_python', action='store_const', const=True, default=False,
                        help="build the python interpreter")

    parser.add_argument('--build_node', dest='build_node', action='store_const', const=True, default=False,
                        help="build node")

    parser.add_argument('--build_nginx', dest='build_nginx', action='store_const', const=True, default=False,
                        help="build the nginx web server")

    parser.add_argument('--build_haproxy', dest='build_haproxy', action='store_const', const=True, default=False,
                        help="build the haproxy server")

    parser.add_argument('--build_stunnel', dest='build_stunnel', action='store_const', const=True, default=False,
                        help="build the stunnel server")

    parser.add_argument('--build_cassandra', dest='build_cassandra', action='store_const', const=True, default=False,
                        help="build the cassandra database server")

    parser.add_argument('--build_node_modules', dest='build_node_modules', action='store_const', const=True, default=False,
                        help="install all node packages")

    parser.add_argument('--build_python_packages', dest='build_python_packages', action='store_const', const=True, default=False,
                        help="install all Python packages")

    parser.add_argument('--build_bup', dest='build_bup', action='store_const', const=True, default=False,
                        help="install bup (git-style incremental compressed snapshots)")

    args = parser.parse_args()

    try:
        times = {}
        if args.build_all or args.build_tinc:
            times['tinc'] = build_tinc()

        if args.build_all or args.build_python:
            times['python'] = build_python()

        if args.build_all or args.build_node:
            times['node'] = build_node()

        if args.build_all or args.build_node_modules:
            times['node_modules'] = build_node_modules()

        if args.build_all or args.build_nginx:
            times['nginx'] = build_nginx()

        if args.build_all or args.build_haproxy:
            times['haproxy'] = build_haproxy()

        if args.build_all or args.build_stunnel:
            times['stunnel'] = build_stunnel()

        if args.build_all or args.build_cassandra:
            times['cassandra'] = build_cassandra()

        if args.build_all or args.build_python_packages:
            times['python_packages'] = build_python_packages()

        if args.build_all or args.build_bup:
            times['bup'] = build_bup()

    finally:
        if times:
            log.info("Times: %s", times)
