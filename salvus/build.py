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

Supported Platform: Ubuntu 14.04

Steps:

    salvus@cloud3:~/iso$ wget http://releases.ubuntu.com/14.04/ubuntu-14.04-beta2-server-amd64.iso
    salvus@cloud3:~/vm/images/base3$ qemu-img create -f qcow2 salvus-2014-04-17-14-4630.img 100G
    salvus@cloud3:~/vm/images/base3$ virt-install --connect=qemu:///system --ram 16000 -n salvus-2014-04-17-14-4630 --cdrom ~/iso/ubuntu-14.04-beta2-server-amd64.iso  --cpu=host --network=network:default,model=virtio --vcpus=16 --noautoconsole --graphics=vnc,port=13389  --disk=salvus-2014-04-17-14-4630.img,device=disk,bus=virtio,format=qcow2,cache=writeback

Install with 100GB disk with 32GB /, 10GB /tmp, and /usr/local a ZFS dedup,compressed filesystem.  No encryption, since base vm doesn't host user data.

    apt-get update; apt-get upgrade

Add this to /etc/apt/sources.list then "apt-get update; apt-get install ubuntu-zfs":

    deb http://ppa.launchpad.net/zfs-native/stable/ubuntu trusty main
    deb-src http://ppa.launchpad.net/zfs-native/stable/ubuntu trusty main

Setup a ZFS pool with compress and dedup.

    root@salvus-base:/etc/apt# zpool create pool /dev/vda3
    root@salvus-base:/etc/apt# zpool list pool
    NAME   SIZE  ALLOC   FREE    CAP  DEDUP  HEALTH  ALTROOT
    pool    60G   133K  60.0G     0%  1.00x  ONLINE  -
    root@salvus-base:/etc/apt# zpool set dedup=on pool
    cannot set property for 'pool': 'dedup' is readonly
    root@salvus-base:/etc/apt# zfs set dedup=on pool
    root@salvus-base:/etc/apt# zfs set compression=lz4 pool
    root@salvus-base:/etc/apt# zfs create pool/local
    root@salvus-base:/etc/apt# zfs set mountpoint=/usr/local pool/local
    cannot mount '/usr/local': directory is not empty
    property may be set but unable to remount filesystem
    root@salvus-base:/etc/apt# mv /usr/local /usr/local.orig
    root@salvus-base:/etc/apt# zfs mount pool/local
    root@salvus-base:/etc/apt# rsync -axvH /usr/local.orig/ /usr/local/

    root@salvus-base:/# mv home home.orig
    root@salvus-base:/# zfs create pool/home
    root@salvus-base:/# zfs set mountpoint=/home pool/home
    root@salvus-base:/# zfs set compression=lz4 pool/home
    root@salvus-base:/# zfs set dedup=on pool/home
    root@salvus-base:/# rsync -axvH /home.orig/ /home/


Before building, do:

    Change this line in /etc/login.defs:  "UMASK           077"

Up the number of watches (mainly for bup watch):

    echo fs.inotify.max_user_watches=100000 | sudo tee -a /etc/sysctl.conf; sudo sysctl -p

Install https://github.com/williamstein/python-inotify and https://github.com/williamstein/bup-1 systemwide.

# ATLAS:

         apt-get install libatlas3gf-base liblapack-dev
         cd /usr/lib/
         ln -s libatlas.so.3gf libatlas.so
         ln -s libcblas.so.3gf libcblas.so
         ln -s libf77blas.so.3gf libf77blas.so

   This line is in the .sagemathcloud env, so building sage is fast for users (though not as performant)

         export SAGE_ATLAS_LIB="/usr/lib/"


# Install critical packages:

         apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  ipython python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev

# Critical to get rid of certain packages that just cause trouble:

         apt-get remove mlocate


# ZFSNAP:

  git clone https://github.com/zfsnap/zfsnap.git
  cd zfsnap
  #git fetch origin legacy
  #git branch legacy
  #git checkout legacy
  cp sbin/zfsnap.sh /usr/local/bin/; cp -rv share/zfsnap/ /usr/local/share/


# For VM hardware hosts only (?):  chmod a+rw /dev/fuse


# Add this to /etc/ssh/sshd_config

MaxStartups 128


# Additional packages (mainly for users, not building).


   sudo apt-get install dstat emacs vim texlive texlive-* gv imagemagick octave mercurial flex bison unzip libzmq-dev uuid-dev scilab axiom yacas octave-symbolic quota quotatool dot2tex python-numpy python-scipy python-pandas python-tables libglpk-dev python-h5py zsh python3 python3-zmq python3-setuptools cython htop ccache python-virtualenv clang libgeos-dev libgeos++-dev sloccount racket libxml2-dev libxslt-dev irssi libevent-dev tmux sysstat sbcl gawk noweb libgmp3-dev ghc  ghc-doc ghc-haddock ghc-mod ghc-prof haskell-mode haskell-doc subversion cvs bzr rcs subversion-tools git-svn markdown lua5.2 lua5.2-*  encfs auctex vim-latexsuite yatex spell cmake libpango1.0-dev xorg-dev gdb valgrind doxygen haskell-platform haskell-platform-doc haskell-platform-prof  mono-devel mono-tools-devel ocaml ocaml-doc tuareg-mode ocaml-mode libgdbm-dev mlton sshfs sparkleshare fig2ps epstool libav-tools python-software-properties software-properties-common h5utils libnetcdf-dev netcdf-doc netcdf-bin tig libtool iotop asciidoc autoconf bsdtar attr  libicu-dev iceweasel xvfb tree bindfs liblz4-tool tinc  python-scikits-learn python-scikits.statsmodels python-skimage python-skimage-doc  python-skimage-lib python-sklearn  python-sklearn-doc  python-sklearn-lib python-fuse cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup cgmanager cgmanager-utils cgroup-lite  cgroup-bin r-recommended libquantlib0 libquantlib0-dev quantlib-examples quantlib-python quantlib-refman-html quantlib-ruby r-cran-rquantlib  libf2c2-dev libpng++-dev libcairomm-1.0-dev r-cran-cairodevice x11-apps mesa-utils libpangox-1.0-dev octave-signal octave-audio octave-benchmark octave-bim octave-biosig octave-communications octave-communications-common octave-data-smoothing octave-dataframe octave-dbg octave-doc octave-econometrics octave-epstk octave-financial octave-fpl octave-ga octave-gdf octave-geometry  octave-gmt octave-gsl octave-htmldoc octave-image octave-info octave-io octave-lhapdf octave-linear-algebra octave-mapping octave-miscellaneous octave-missing-functions octave-mpi octave-msh octave-nan octave-nlopt octave-nnet octave-nurbs octave-ocs octave-octcdf octave-octgpr octave-odepkg octave-openmpi-ext octave-optim octave-optiminterp  octave-parallel octave-pfstools octave-pkg-dev octave-plot octave-psychtoolbox-3 octave-quaternion octave-secs1d octave-secs2d octave-sockets octave-splines octave-statistics octave-strings octave-struct octave-sundials octave-tsa octave-vlfeat octave-vrml octave-zenity gnugo libapr1-dev  libcap2-bin npm coffeescript lbzip2 mosh

# NOTE: as of April 27 the quantlib python indings that get installed above don't work in Ubuntu 14.04 (e.g., 'import QuantLib' fails)

# Cgroups configuration (!!) -- very important!

   echo "session optional pam_cgroup.so" >> /etc/pam.d/common-session
   pam-auth-update  # select defaults -- this probably isn't needed.

# Aldor, have to modify /etc/apt/sources.list.d/pippijn-ppa-*.list and replace version with "precise"

   sudo add-apt-repository ppa:pippijn/ppa
   sudo apt-get update; sudo apt-get install aldor open-axiom*


# Octave: needed by octave for plotting:

      cd /usr/share/fonts/truetype; ln -s liberation ttf-liberation


# Dropbox --
  so it's possible to setup dropbox to run in projects... at some point (users could easily do this anyways, but making it systemwide is best).

      Get it here: https://www.dropbox.com/install?os=lnx

# Build Sage (as usual)

    Get Sage and pull my patches from this repo!

           https://github.com/sagemath/sagesmc/commits/develop

    umask 022
    #export SAGE_ATLAS_LIB=/usr/lib/   #<--- too slow!
    export MAKE="make -j20"
    make

# SAGE SCRIPTS -- once only, ever.  Not needed when sage is upgraded.

  Do from within Sage (as root):

      install_scripts('/usr/local/bin/',ignore_existing=True)

# POLYMAKE system-wide:

  # From http://www.polymake.org/doku.php/howto/install

     sudo apt-get install ant default-jdk g++ libboost-dev libgmp-dev libgmpxx4ldbl libmpfr-dev libperl-dev libsvn-perl libterm-readline-gnu-perl libxml-libxml-perl libxml-libxslt-perl libxml-perl libxml-writer-perl libxml2-dev w3c-dtd-xhtml xsltproc

  # Then... get latest from http://www.polymake.org/doku.php/download/start and build:

      sudo su
      cd /tmp/&& wget http://www.polymake.org/lib/exe/fetch.php/download/polymake-2.13.tar.bz2&& tar xvf polymake-2.13.tar.bz2; cd polymake-2.13 && ./configure && make -j8 && make install
      rm -rf /tmp/polymake*

# Neovim system-wide:

    cd /tmp; rm -rf neovim; unset MAKE; git clone https://github.com/neovim/neovim; cd neovim; make
    umask 022
    sudo make install

# MACAULAY2:

   Install Macaulay2 system-wide from here: http://www.math.uiuc.edu/Macaulay2/Downloads/

    sudo su
    apt-get install libntl-dev libntl0  libpari-gmp3
    cd /tmp/ && wget http://www.math.uiuc.edu/Macaulay2/Downloads/Common/Macaulay2-1.6-common.deb && wget  http://www.math.uiuc.edu/Macaulay2/Downloads/GNU-Linux/Ubuntu/Macaulay2-1.6-amd64-Linux-Ubuntu-13.04.deb && sudo dpkg -i Macaulay2-1.6-amd64-Linux-Ubuntu-13.04.deb && rm *.deb



# Install Julia

   sudo su
   umask 022  &&  cd /usr/local/ && git clone git://github.com/JuliaLang/julia.git  &&  cd julia  &&  make -j16 install  &&   cd /usr/local/bin  &&  ln -s /usr/local/julia/julia .

Start Julia and type:

   Pkg.add("IJulia")

# FEnICS -- automated solution of differential equations by finite element methods
  (Test with "import dolfin".)

    add-apt-repository ppa:fenics-packages/fenics
    apt-get update; apt-get install fenics


# System-wide Python packages not through apt:

   sudo su
   umask 022;
   /usr/bin/pip install -U theano
   /usr/bin/pip install -U clawpack




# Setup /usr/local/bin/skel

   rsync -axvHL ~/salvus/salvus/local_hub_template/ ~/.sagemathcloud/
   cd ~/.sagemathcloud
   . sagemathcloud-env
   ./build

   cd /usr/local/bin/
   sudo ln -s /home/salvus/salvus/salvus/scripts/skel/ .

   cd ~/salvus/salvus/scripts/skel/
   mv ~/.sagemathcloud .


# Salvus (needs more!)

   cd /home/salvus/salvus/salvus/
   mkdir local_hub_template/node_modules
   cp scripts/skel/.sagemathcloud/node_modules/*.js local_hub_template/node_modules/
   ./make_coffee --all

#HOSTS

On the VM hosts, some things are critical:


    # Do this or VM's may be unstartable for a very, very long time.
    echo never > /sys/kernel/mm/transparent_hugepage/enabled; echo never > /sys/kernel/mm/transparent_hugepage/defrag

    # put this in cron since it's so critical that the perms are right... or vm's won't start
    */10 * * * * sudo chmod a+r /boot/vmlinuz-*; sudo chmod a+rw /dev/fuse

In /etc/sysctl.conf, put:

    vm.swappiness=1

# Install 4ti2 system-wide...
    sudo su
    umask 022
    export V=1.6.2
    cd /tmp && wget http://www.4ti2.de/version_$V/4ti2-$V.tar.gz && tar xf 4ti2-$V.tar.gz && cd 4ti2-$V && ./configure --prefix=/usr/local/ && time make -j16
    make install      # this *must* be a separate step!!
    rm -rf /tmp/4ti2*





# Delete cached packages

   #cd SAGE_ROOT
   rm -rf upstream local/var/tmp/sage/build/


# Run sage one last time

   ./sage

# Copy over the newest SageTex, so it actually works (only do this with the default sage):

    sudo su
    umask 022
    cp -rv /usr/local/sage/current/local/share/texmf/tex/generic/sagetex /usr/share/texmf/tex/latex/ && texhash




"""

TINC_VERSION       = '1.0.23'    # options here -- http://tinc-vpn.org/packages/
CASSANDRA_VERSION  = '2.0.8'     # options here -- http://downloads.datastax.com/community/
NODE_VERSION       = '0.10.29'   # options here -- http://nodejs.org/dist/   -- 0.[even].* is STABLE version.
PYTHON_VERSION     = '2.7.6'     # options here -- https://www.python.org/ftp/python/
SETUPTOOLS_VERSION = '3.4.4'     # options here (bottom!) -- https://pypi.python.org/pypi/setuptools
NGINX_VERSION      = '1.7.0'     # options here -- http://nginx.org/download/
HAPROXY_VERSION    = '1.5-dev24' # options here -- http://haproxy.1wt.eu/download/1.5/src/devel/
STUNNEL_VERSION    = '5.01'      # options here -- https://www.stunnel.org/downloads.html

import logging, os, shutil, subprocess, sys, time, urllib2

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

if 'MAKE' in os.environ:
    del os.environ['MAKE']

# WARNING--as of Sept 1, 2013, start-stop-daemon's install is broken, even though no versions (and no dep versions) have changed,
# due to some packages cheating npm.  So I'm typically just copying over node_modules/start-stop-daemon from previous installs.

NODE_MODULES = [
    'commander',
    'start-stop-daemon',
    'winston',
    'sockjs',
    'node-cassandra-cql',
    'sockjs-client-ws',
    'coffee-script',
    'node-uuid',
    'browserify@1.16.4',
    'uglify-js2',
    'passport',
    'passport-github',
    'express',
    'nodeunit',
    'validator',
    'async',
    'password-hash',
    'nodemailer',
    'cookies',
    'htmlparser',
    'mime',
    'pty.js',
    'posix',
    'mkdirp',
    'walk',
    'temp',
    'googlediff',
    'formidable@latest',
    'moment',
    'underscore',
    'read',
    'hashring',
    'rimraf',
    'net-ping',
    'marked',
    'http-proxy'     # https://github.com/nodejitsu/node-http-proxy
    ]

PYTHON_PACKAGES = [
    'readline',
    'ipython',            # a usable command line  (ipython uses readline)
    'python-daemon',      # daemonization of python modules
    'paramiko',           # ssh2 implementation in python
    'cql'                 # interface to Cassandra
    ]

SAGE_PIP_PACKAGES = [
    'mpld3',              # D3 Renderings of Matplotlib Graphics -- https://github.com/jakevdp/mpld3
    'mercurial',          # used when installing neuron
    'backports.ssl-match-hostname',   # a dependency of tornado (we don't install deps automatically right now)
    'tornado',            # used by IPython notebook
    'pandas',
    'pandasql',
    'patsy',
    'statsmodels',
    'numexpr',
    'tables',
    'scikit_learn',
    'theano',
    'scikits-image',
    'Shapely',
    'SimPy',
    'xlrd',
    'xlwt',
    'pyproj',
    'bitarray',
    'h5py',
    'netcdf4',
    'patsy',
    'lxml',
    'munkres',
    'oct2py',
    'psutil',
    'requests', # Python HTTP for Humans. (NOTE: plotly depends on requests)
    'plotly',
    'mahotas',
    'rpy2',     # We have to upgrade rpy2, since the one in sage is so old, and it breaks IPython Notebook's R interface.
    'clawpack',
    'psycopg2', # Python-PostgreSQL Database Adapter
    'nose',     # nose extends unittest to make testing easier
    'redis',    # Python client for Redis key-value store
    'pymongo',  # Python driver for MongoDB
    'fabric',   # Fabric is a simple, Pythonic tool for remote execution and deployment.
    'MySQL-python', # Python interface to MySQL
    'paramiko', # SSH2 protocol library
    'httplib2', # A comprehensive HTTP client library.
    'greenlet',  # Lightweight in-process concurrent programming
    'gmpy2',
    'mmh3',
    'joblib'
    ]

SAGE_PIP_PACKAGES_ENV = {'clawpack':{'LDFLAGS':'-shared'}}

R_PACKAGES = [
    'ggplot2',
    'stringr',
    'plyr',
    'reshape2',
    'zoo',
    'car',
    'mvtnorm',
    'e1071',
    'Rcpp',
    'lattice',
    'KernSmooth',
    'Matrix',
    'cluster',
    'codetools',
    'mgcv',
    'rpart',
    'survival',
    'fields',
    'circular',
    'glmnet',
    'cairo'
]

SAGE_OPTIONAL_PACKAGES = [
    'biopython',
    'chomp',
    'database_cremona_ellcurve',
    'database_odlyzko_zeta',
    'database_pari',
    'biopython',
    'brian',
    'cbc',
    'cluster_seed',
    'coxeter3',
    'cryptominisat',
    'cunningham_tables',
    'database_gap',
    'database_jones_numfield',
    'database_kohel',
    'database_symbolic_data',
    'dot2tex',
    'gap_packages',
    'gnuplotpy',
    'guppy',
    'kash3',
    'lie',
    'lrs',
    'nauty',
    'normaliz',
    'nose',
    'nzmath',
    'p_group_cohomology',
    'phc',
    'pybtex',
    'pycryptoplus',
    'pyx',
    'pyzmq',
    'qhull',
    'topcom',
    'zeromq',
    'stein-watkins-ecdb'
]

ENTHOUGHT_PACKAGES = [
    'pyface',
    'traits',
    'scimath',
]

if not os.path.exists(BUILD):
    os.makedirs(BUILD)

if 'SAGE_ROOT' not in os.environ:
    log.info("Building salvus user code (so updating PATHs...)")
    os.environ['PATH'] = os.path.join(PREFIX, 'bin') + ':' + os.environ['PATH']
    os.environ['LD_LIBRARY_PATH'] = os.path.join(PREFIX, 'lib') + ':' + os.environ.get('LD_LIBRARY_PATH','')
else:
    log.info("Building/updating a Sage install")

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
    t0 = time.time()
    if os.system(s):
        raise RuntimeError('command failed: "%s" (%s seconds)'%(s, time.time()-t0))
    else:
        log.info("cmd %s took %s seconds", s, time.time()-t0)

def download(url):
    # download target of given url to SRC directory
    import urllib
    t0 = time.time()
    target = os.path.join(SRC, os.path.split(url)[-1].split('?')[0])
    log.info("Downloading %s to %s..."%(url, target))
    urllib.urlretrieve(url, target)
    log.info("Took %s seconds"%(time.time()-t0))
    return target

def extract_package(basename):
    log.info("extracting package %s by finding tar ball in SRC directory, extract it in build directory, and return resulting path",
             basename)
    for filename in os.listdir(SRC):
        if filename.startswith(basename):
            i = filename.rfind('.tar.')
            if i == -1:
                i = filename.rfind('.tgz')
            path = os.path.join(BUILD, filename[:i])
            if os.path.exists(path):
                log.info("removing existing path %s", path)
                shutil.rmtree(path)
            cmd('tar xf "%s"'%os.path.abspath(os.path.join(SRC, filename)), BUILD)
            return path
    raise RuntimeError("unable to extract package %s"%basename)

#######################$###################################################
# Functions that install extra packages and bug fixes to turn a standard
# Sage install into the one used in SMC.
###########################################################################
class BuildSage(object):
    def __init__(self):
        try:
            from sage.all import SAGE_ROOT
        except:
            raise RuntimeError("BuildSage must be run from within a Sage install")
        self.SAGE_ROOT = SAGE_ROOT

    def path(self, path):
        """
        Turn a path relative to SAGE_ROOT into an absolute path.
        """
        return os.path.join(self.SAGE_ROOT, path)

    def cmd(self, s):
        cmd(s, self.SAGE_ROOT)

    def everything(self):
        """
        Do everything to patch/update/install/enhance this Sage install.
        """
        self.unextend_sys_path()
        self.patch_sage_location()
        self.patch_pexpect()
        self.patch_banner()
        self.patch_sage_env()
        self.octave_ext()
        self.install_projlib()
        self.install_pip()
        self.install_pip_packages()
        self.install_R_packages()
        self.install_optional_packages()
        self.install_snappy()
        self.install_enthought_packages()
        self.install_quantlib()
        self.install_neuron()
        self.install_basemap()
        self.install_4ti2()
        self.clean_up()
        self.extend_sys_path()
        self.fix_permissions()

    def patch_sage_location(self):
        """
        Since we build Sage in-place and never move it, the sage-location script
        is a total waste of time, which only gets worse the more optional packages
        we install. Thus we disable it completely.
        """
        target = self.path("local/bin/sage-location")
        f = open(target).read()
        before = "'__main__':"
        after  = "'__main__' and False:"
        if before in f:
            log.info("patching %s"%target)
            f = f.replace(before, after)
            open(target,'w').write(f)
        else:
            if after not in f:
                raise RuntimeError("unable to patch %s"%target)
            log.info("already patched %s"%target)


    def patch_pexpect(self):
        """
        Patch around pexpect bug in sage -- see http://trac.sagemath.org/ticket/15178
        """
        path = self.path("local/lib/python2.7/site-packages/pexpect.py")
        f = open(path).read()
        before = "if os.access (filename, os.X_OK) and not os.path.isdir(f):"
        after  = "if os.access (filename, os.X_OK) and not os.path.isdir(filename):"
        if before in f:
            log.info("pexpect still has bug: patching")
            open(path,'w').write(f.replace(before, after))
        else:
            log.info("pexpect bug already patched")

    def patch_banner(self):
        """
        The default Sage banner is too verbose, frightening (since I always run devel versions),
        and misleading -- since notebook() doesn't work on SMC, and help(...) is basically useless.
        """
        path = self.path("local/bin/sage-banner")
        v = open(path).readlines()
        if len(v) < 5:
            log.info("Sage banner already patched.")
        else:
            log.info("Patching the Sage banner.")
            v[3] = '\xe2\x94\x82 Enhanced for SageMathCloud.                                        \xe2\x94\x82\n'
            w = [v[i] for i in [0,1,3,4]]
            open(path,'w').write(''.join(w))

    def patch_sage_env(self):
        """
        Many optional Sage packages are still up as optional packages, but they **DON'T work**
        due to Andrew/Volker/whoever deprecating SAGE_DATA before they updated our optional
        packages accordingly (which sucks).  Anyways, this works around the issue for now, which is
        at least present in sage-6.2.rc0.
        """
        path = self.path("src/bin/sage-env")
        f = open(path).read()
        target = 'export SAGE_DATA="$SAGE_SHARE"'
        if target not in f:
            log.info("patching %s"%path)
            open(path,'a').write('\n'+target)
        else:
            log.info("%s already patched"%path)
        data = self.path("data")
        if not os.path.exists(data):
            # absolute paths are fine, since we will NEVER be moving this sage install
            os.symlink(self.path("local/share"), data)
        os.environ['SAGE_DATA'] = os.environ['SAGE_SHARE']

    def octave_ext(self):
        """
        The /usr/local/sage/current/local/share/sage/ext/octave must be writeable by all, which is
        a stupid horrible bug/shortcoming in Sage that people constantly hit.   As a workaround,
        we link it to a constrained filesystem for this purpose.
        """
        target = self.path("local/share/sage/ext/octave")
        src = "/pool/octave"

        if not (os.path.exists(src) and os.path.isdir(src)):
            raise RuntimeError("please create a limited ZFS pool mounted as /pool/octave, with read-write access to all:\n\n\tzfs create pool/octave && chmod a+rwx /pool/octave && zfs set quota=1G pool/octave\n")

        if os.path.exists(target):
            try:
                shutil.rmtree(target)
            except:
                os.unlink(target)
        os.symlink(src, target)

    def install_projlib(self):
        """
        Install the proj cartographic transformations and geodetic computations library
        into Sage, which is a dep for the pyproj pip package.
        """
        version_base = "4.9.0"
        version = version_base + "b2"  # find newest version at http://download.osgeo.org/proj/?C=M;O=D
        download("http://download.osgeo.org/proj/proj-%s.tar.gz"%version)
        path = extract_package("proj-%s"%version)
        # their tarball if annoying, with path not what is before .tar.gz. UGH.
        i = path.find(version_base)
        path = path[:i+len(version_base)]
        cmd("./configure --prefix=%s"%self.SAGE_ROOT, path)
        cmd("make -j%s install"%NCPU, path)

    def install_pip(self):
        """Install pip itself into Sage; it should come with Sage, but doesn't yet."""
        self.unextend_sys_path()
        download("https://raw.githubusercontent.com/pypa/pip/master/contrib/get-pip.py")
        cmd("python get-pip.py", SRC)

    def extend_sys_path(self):
        """
        Make this Sage install able to import modules installed in the system-wide
        Python, e.g., make it so there is some hope that maybe
        'import dolfin' works, even though dolfin is some
        complicated FEM library installed system-wide via Ubuntu packages
        This MUST be done *after* pip is installed.
        """
        target = self.path("local/lib/python/sitecustomize.py")
        paths = ['/usr/lib/python2.7/dist-packages/', '/usr/lib/pymodules/python2.7']
        # sanity check
        for p in paths:
            if not os.path.exists(p):
                raise RuntimeError("path %s does not exist"%p)
        f = open(target).read() if os.path.exists(target) else ""
        to_add = "import sys; sys.path.extend(%r)"%paths
        if to_add not in f:
            log.info("patching %s by appending '%s'"%(target, to_add))
            open(target, 'a').write('\n' + to_add)
        else:
            log.info("%s already patched"%target)

    def unextend_sys_path(self):
        for f in ["local/lib/python/sitecustomize.py", "local/lib/python/sitecustomize.pyc"]:
            target = self.path(f)
            if os.path.exists(target):
                os.unlink(target)

    def install_pip_packages(self, upgrade=True):
        """Install each pip-installable package."""
        self.unextend_sys_path()

        os.environ['PROJ_DIR']=os.environ['NETCDF4_DIR']=os.environ['HDF5_DIR']='/usr/'
        os.environ['C_INCLUDE_PATH']='/usr/lib/openmpi/include'

        for package in SAGE_PIP_PACKAGES:
            log.info("** Installing/upgrading %s **"%package)
            # NOTE: the "--no-deps" is critical below; otherwise, pip will do things like install a version of numpy that is
            # much newer than the one in Sage, and incompatible (due to not having patches), which if it installs at all, will
            # break Sage (i.e. lots of doctests fail, etc.).
            e = ' '.join(["%s=%s"%x for x in SAGE_PIP_PACKAGES_ENV[package].items()]) if package in SAGE_PIP_PACKAGES_ENV else ''
            self.cmd("%s pip install %s --no-deps %s"%(e, '--upgrade' if upgrade else '', package))

    def install_R_packages(self):
        s = ','.join(['"%s"'%name for name in R_PACKAGES])
        c = 'install.packages(c(%s), repos="http://cran.cs.wwu.edu/")'%s
        self.cmd("echo '%s' | R --no-save"%c)

    def install_optional_packages(self):
        from sage.all import install_package
        if 'MAKE' not in os.environ:
            # some packages, e.g., chomp, won't build without MAKE being set.
            os.environ['MAKE'] = "make -j%s"%NCPU
        for package in SAGE_OPTIONAL_PACKAGES:
            log.info("** Installing/upgrading %s **"%package)
            #install_package(package)
            # We have to do this (instead of use install_package) because Sage's install_package
            # command is completely broken in rc0 at least (April 27, 2014).
            self.cmd("sage -i %s"%package)

    def install_snappy(self):
        """
        Install snappy -- see http://www.math.uic.edu/t3m/SnapPy/doc/installing.html
        """
        self.cmd("python -m easy_install -U -f http://snappy.computop.org/get snappy")

    def install_enthought_packages(self):
        """
        Like Sage does, Enthought has a bunch of packages that are not easily available
        from pypi...
        """
        # We grab the list of tarball names from the website, so we can determine
        # the newest version of each that we want below.
        repo = 'https://www.enthought.com/repo/ets/'
        packages = [x.split('"')[1] for x in urllib2.urlopen(repo).readlines() if '.tar.gz"' in x]
        for pkg in ENTHOUGHT_PACKAGES:
            v = [x for x in packages if x.lower().startswith(pkg)]
            v.sort()
            newest = v[-1]
            log.info("installing %s..."%newest)
            download(os.path.join(repo, newest))
            path = extract_package(newest)
            cmd("python setup.py install", path)

    def install_quantlib(self):
        # See http://sourceforge.net/projects/quantlib/
        VERSION = "1.4"
        try:
            # check if already installed
            import QuantLib
            if QuantLib.__version__ == VERSION:
                log.info("QuantLib version %s is already installed"%VERSION)
                return
        except:
            pass
        pkg = "QuantLib-SWIG-%s.tar.gz"%VERSION
        url = "http://downloads.sourceforge.net/project/quantlib/QuantLib/%s/other%%20languages/%s"%(VERSION, pkg)
        # I got this url from the "direct link" think in source forge.  I don't know if is stable over time; if not... Bummer.
        url +="?r=http%3A%2F%2Fsourceforge.net%2Fprojects%2Fquantlib%2Ffiles%2FQuantLib%2F1.4%2Fother%2520languages%2F&ts=1398645275&use_mirror=softlayer-dal"
        download(url)
        path = extract_package(pkg)
        cmd("./configure", path)
        cmd("make -j%s -C Python install"%NCPU, path)

    def install_neuron(self):
        """
        Neuron -- for empirically-based simulations of neurons and networks of neurons

        (requested by Jose Guzman)
        """
        def clean_up():
            if os.path.exists('/tmp/iv'): shutil.rmtree("/tmp/iv")
            if os.path.exists('/tmp/nrn'): shutil.rmtree("/tmp/nrn")
        from sage.all import SAGE_LOCAL
        clean_up()
        cmd("hg clone http://www.neuron.yale.edu/hg/neuron/iv", "/tmp")
        cmd("hg clone http://www.neuron.yale.edu/hg/neuron/nrn", "/tmp")
        cmd("./build.sh && ./configure --prefix=%s && make -j%s && make install"%(SAGE_LOCAL, NCPU), "/tmp/iv")
        cmd("./build.sh && ./configure --prefix=%s --with-iv=%s --with-nrnpython && make -j%s && make install && cd src/nrnpython/ && python setup.py install"%(SAGE_LOCAL, SAGE_LOCAL, NCPU), "/tmp/nrn")
        clean_up()

    def install_basemap(self):
        """
        basemap -- Plot data on map projections with matplotlib
        """
        try:
            import mpl_toolkits.basemap
            installed_version = mpl_toolkits.basemap.__version__
            version = [x for x in urllib2.urlopen("https://raw.githubusercontent.com/matplotlib/basemap/master/setup.py").readlines()
                        if x.startswith('__version__')][0].split('=')[1].strip(' \'"\n')
            log.info("version=%s, installed_version=%s", version, installed_version)
            if version == installed_version:
                log.info("basemap version %s already installed", version)
                return
        except Exception, msg:
            pass
        cmd("/usr/bin/git clone https://github.com/matplotlib/basemap", "/tmp")
        cmd("python setup.py install", "/tmp/basemap")
        shutil.rmtree("/tmp/basemap")

    def install_4ti2(self):
        """
        """
        site = "http://www.4ti2.de/"
        target = [x for x in urllib2.urlopen("%s/download_4ti2.html"%site).readlines() if 'source code</a>' in x][0].split('"')[1]
        version = target.split("_")[1].split('/')[0]
        z = [x for x in sorted(os.listdir(self.path("local/var/lib/sage/installed"))) if x.startswith('4ti2')]
        if len(z) == 0:
            installed_version = ''
        else:
            installed_version = z[-1].split('-')[1]
        if version == installed_version:
            log.info("4ti2 version %s already installed", version)
            return
        download(site + target)
        pkg = target.split('/')[-1]
        path = extract_package(pkg)
        cmd("./configure --prefix=/usr/local/sage/current/local/ && time make -j%s"%NCPU, path)
        cmd("make install", path)
        open(self.path("local/var/lib/sage/installed/4ti2-%s"%version),'w')
        shutil.rmtree(path)

    def clean_up(self):
        # clean up packages downloaded and extracted using the download command
        src = os.path.join(os.environ['HOME'], 'salvus', 'salvus', 'src')
        for s in os.listdir(src):
            if s != 'patches':
                target = os.path.join(src, s)
                log.info("removing %s"%target)
                os.unlink(target)
        build =  os.path.join(os.environ['HOME'], 'salvus', 'salvus', 'data', 'build')
        for s in os.listdir(build):
            target = os.path.join(build, s)
            log.info("removing %s"%target)
            shutil.rmtree(target)


        # clean up packages left over from optional Sage package installs
        # This should be a make target, but isn't (in sage-6.2, at least).
        for p in ['upstream', 'local/var/tmp/sage/build']:
            path = self.path(p)
            if os.path.exists(path):
                log.info("deleting %s"%path)
                shutil.rmtree(path)

    def fix_permissions(self):
        self.cmd("chmod a+r -R .; find . -perm /u+x -execdir chmod a+x {} \;")



###########################################################################
#
# Functions to build each of the main from-source components of SMC.
# These are super-important so we don't trust the ones in Ubuntu. (And
# in some cases we want to install on OS X, say.)
# Also, we do some small amount of patching.
#
###########################################################################


def build_tinc():
    log.info('building tinc'); start = time.time()
    try:
        target = 'tinc-%s.tar.gz'%TINC_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd("rm -f tinc-*.tar.*", SRC)
            download("http://tinc-vpn.org/packages/tinc-%s.tar.gz"%TINC_VERSION)
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
        target = 'Python-%s.tgz'%PYTHON_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd("rm -f Python-*", SRC)
            download("https://www.python.org/ftp/python/%s/Python-%s.tgz"%(PYTHON_VERSION, PYTHON_VERSION))
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
        target = "node-v%s.tar.gz"%NODE_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd('rm -f node-v*.tar.*', SRC)  # remove any source tarballs that might have got left around
            download("http://nodejs.org/dist/v%s/node-v%s.tar.gz"%(NODE_VERSION, NODE_VERSION))
        path = extract_package('node')
        if NODE_VERSION == "0.8.25":
            cmd('patch -p1 < %s/node-patch-backported-to-fix-hex-issue.patch'%PATCHES, path)
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
        target = "nginx-%s.tar.gz"%NGINX_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd('rm -f nginx-v*.tar.*', SRC)  # remove any source tarballs that might have got left around
            download("http://nginx.org/download/nginx-%s.tar.gz"%NGINX_VERSION)

        path = extract_package('nginx')
        cmd('./configure --prefix="%s"'%PREFIX, path)
        cmd('make -j %s'%NCPU, path)
        cmd('make install', path)
        cmd('mv sbin/nginx bin/', PREFIX)
    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_haproxy():
    log.info('building haproxy'); start = time.time()
    try:
        target = "haproxy-%s.tar.gz"%HAPROXY_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd('rm -f haproxy*', SRC)  # remove any source tarballs that might have got left around
            download("http://haproxy.1wt.eu/download/1.5/src/devel/haproxy-%s.tar.gz"%HAPROXY_VERSION)

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
        target = "stunnel-%s.tar.gz"%STUNNEL_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd('rm -f stunnel*', SRC)  # remove any source tarballs that might have got left around
            download("https://www.stunnel.org/downloads/stunnel-%s.tar.gz"%STUNNEL_VERSION)
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
        log.info(target2)
        if os.path.exists(target2):
            shutil.rmtree(target2)
        os.makedirs(target2)
        log.info("copying over")
        cmd('cp -rv * "%s"'%target2, path)
        cmd('cp -v "%s/start-cassandra" "%s"/'%(PATCHES, os.path.join(PREFIX, 'bin')), path)
        log.info("making symlink so can use fast JNA java native thing")
        cmd("ln -sf /usr/share/java/jna.jar %s/local/cassandra/lib/"%DATA, path)

        log.info("building python library")
        cmd("cd pylib && python setup.py install", path)

    finally:
        log.info("total time: %.2f seconds", time.time()-start)
        return time.time()-start

def build_python_packages():
    log.info('building python_packages'); start = time.time()
    try:
        target = 'setuptools-%s.tar.gz'%SETUPTOOLS_VERSION
        if not os.path.exists(os.path.join(SRC, target)):
            cmd("rm -f setuptools-*.tar.*", SRC)
            download("https://pypi.python.org/packages/source/s/setuptools/%s"%target)
        os.system("rm -rf %s/local/lib/python2.7/site-packages/setuptools-*"%DATA)
        path = extract_package('setuptools')
        cmd('python setup.py install', path)
        cmd('easy_install pip', path)
        for pkg in PYTHON_PACKAGES:
            log.info("***", pkg)
            cmd('pip install %s'%pkg, '/tmp')
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

    finally:
        if times:
            log.info("Times: %s", times)
