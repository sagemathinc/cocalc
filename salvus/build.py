#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

# NOTE:
# There's a hack I'm using around line 171 of
#   /usr/local/sage/current/local/lib/python/site-packages/IPython/html/notebookapp.py
# to get it to use my local static/ipython directory, for much better speed.


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

Supported Platform:  Ubuntu 14.10

Steps:

    salvus@cloud3:~/iso$ wget http://releases.ubuntu.com/14.04/ubuntu-14.04-beta2-server-amd64.iso
    salvus@cloud3:~/vm/images/base3$ qemu-img create -f qcow2 salvus-2014-04-17-14-4630.img 100G
    salvus@cloud3:~/vm/images/base3$ virt-install --connect=qemu:///system --ram 16000 -n salvus-2014-04-17-14-4630 --cdrom ~/iso/ubuntu-14.04-beta2-server-amd64.iso  --cpu=host --network=network:default,model=virtio --vcpus=16 --noautoconsole --graphics=vnc,port=13389  --disk=salvus-2014-04-17-14-4630.img,device=disk,bus=virtio,format=qcow2,cache=writeback

Install with 100GB disk with 32GB /, 10GB /tmp, and /usr/local a ZFS dedup,compressed filesystem.  No encryption, since base vm doesn't host user data.

    apt-get update; apt-get upgrade


# Install critical packages needed for building SMC source code:

        apt-get update && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  ipython python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev


# JAVA

Add to /etc/sources.list:

   deb http://ppa.launchpad.net/webupd8team/java/ubuntu utopic main

Then:

    apt-get install oracle-java8-set-default


# For VM hardware hosts only (?):  chmod a+rw /dev/fuse


# Compute VM's


# Critical to get rid of certain packages that just cause trouble:

apt-get update && apt-get upgrade && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  ipython python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev

apt-get remove mlocate

# ZFS: Add this to /etc/apt/sources.list then "apt-get update; apt-get install ubuntu-zfs":

    deb http://ppa.launchpad.net/zfs-native/stable/ubuntu utopic  main
    deb-src http://ppa.launchpad.net/zfs-native/stable/ubuntu utopic  main


# ZFSNAP:

    cd /tmp && rm -rf zfsnap && git clone https://github.com/zfsnap/zfsnap.git && cd zfsnap && cp sbin/zfsnap.sh /usr/local/bin/ && cp -rv share/zfsnap/ /usr/local/share/ && rm -rf zfsnap


Up the number of watches (mainly for bup watch):

    echo fs.inotify.max_user_watches=100000 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

# Install https://github.com/williamstein/python-inotify and https://github.com/williamstein/bup-1 systemwide.

   sudo su
   cd /tmp && rm -rf python-inotify && git clone https://github.com/williamstein/python-inotify && cd python-inotify && python setup.py install && cd /tmp && rm -rf python-inotify bup-1 && git clone https://github.com/williamstein/bup-1 && cd bup-1 && make install && cd .. && rm -rf bup-1

# BASH

Add this to the top of /etc/bash.bashrc, at least for now, due to bugs in Ubuntu and vim?!

   TERM=screen

# OBSPY --

Add this to /etc/apt/sources.list then "apt-get update; apt-get install python-obspy":

    echo $'\n'"deb http://deb.obspy.org trusty main"$'\n' >> /etc/apt/sources.list && apt-get update && apt-get install python-obspy

# ATLAS:

     apt-get install libatlas3gf-base liblapack-dev && cd /usr/lib/ && ln -s libatlas.so.3gf libatlas.so && ln -s libcblas.so.3gf libcblas.so && ln -s libf77blas.so.3gf libf77blas.so

This line is in the .sagemathcloud env, so building sage is fast for users (though not as performant)

     export SAGE_ATLAS_LIB="/usr/lib/"

# Add this to /etc/ssh/sshd_config

    MaxStartups 128


# Additional packages (mainly for users, not building).


    apt-get install  libmed1 libhdf5-openmpi-7 gmsh dstat emacs vim texlive texlive-* gv imagemagick octave mercurial flex bison unzip libzmq-dev uuid-dev scilab axiom yacas octave-symbolic quota quotatool dot2tex python-numpy python-scipy python-pandas python-tables libglpk-dev python-h5py zsh python3 python3-zmq python3-setuptools cython htop ccache python-virtualenv clang libgeos-dev libgeos++-dev sloccount racket libxml2-dev libxslt-dev irssi libevent-dev tmux sysstat sbcl gawk noweb libgmp3-dev ghc  ghc-doc ghc-haddock ghc-mod ghc-prof haskell-mode haskell-doc subversion cvs bzr rcs subversion-tools git-svn markdown lua5.2 lua5.2-*  encfs auctex vim-latexsuite yatex spell cmake libpango1.0-dev xorg-dev gdb valgrind doxygen haskell-platform haskell-platform-doc haskell-platform-prof  mono-devel mono-tools-devel ocaml ocaml-native-compilers camlp4-extra proofgeneral proofgeneral-doc tuareg-mode ocaml-mode libgdbm-dev mlton sshfs sparkleshare fig2ps epstool libav-tools python-software-properties software-properties-common h5utils libnetcdf-dev netcdf-doc netcdf-bin tig libtool iotop asciidoc autoconf bsdtar attr  libicu-dev iceweasel xvfb tree bindfs liblz4-tool tinc python-scikits-learn python-scikits.statsmodels python-skimage python-skimage-doc  python-skimage-lib python-sklearn  python-sklearn-doc  python-sklearn-lib python-fuse cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup cgmanager cgmanager-utils cgroup-lite  cgroup-bin  r-recommended libquantlib0 libquantlib0-dev quantlib-examples quantlib-python quantlib-refman-html r-cran-rquantlib  libpng++-dev libcairomm-1.0-dev r-cran-cairodevice x11-apps  mesa-utils libpangox-1.0-dev    libf2c2-dev gnugo libapr1-dev libcap2-bin npm coffeescript  coffeescript-doc lbzip2 mosh smem libcurl4-openssl-dev jekyll lynx-cur root-system-bin libroot-bindings-python-dev libroot-graf2d-postscript5.34  csh x11vnc x11-apps meld aspell-* inkscape libopencv-dev build-essential checkinstall cmake pkg-config yasm libjpeg-dev libjasper-dev libavcodec-dev libavformat-dev libswscale-dev libdc1394-22-dev libxine2-dev libgstreamer0.10-dev libgstreamer-plugins-base0.10-dev libv4l-dev python-dev python-numpy libtbb-dev libqt4-dev libgtk2.0-dev  libmp3lame-dev libopencore-amrnb-dev libopencore-amrwb-dev libtheora-dev libvorbis-dev libxvidcore-dev x264 v4l-utils r-cran-rgl libgtk2.0-dev yi php5 python-docutils pdftk smlnj  ml-lex ml-yacc p7zip-full check  unison-all fonts-ocr-a libwebp-dev libpari-dev libpari-dbg pari-gp2c pari-galpol lzip ncompress ipython3


# SAGE


  Before building sage do:

    Change this line in /etc/login.defs:  "UMASK           077"



# Cgroups configuration (!!) -- very important!

   echo "session optional pam_cgroup.so" >> /etc/pam.d/common-session
   pam-auth-update  # select defaults -- this probably isn't needed.

# Open Axiom --- see https://launchpad.net/~pippijn/+archive/ubuntu/ppa

   echo $'\n'"deb http://ppa.launchpad.net/pippijn/ppa/ubuntu precise main"$'\n' >> /etc/apt/sources.list && apt-get update && sudo apt-get install open-axiom*


# Primesieve

As root do

    cd /tmp && wget http://dl.bintray.com/kimwalisch/primesieve/primesieve-5.4.1.tar.gz && tar xf primesieve-5.4.1.tar.gz && cd primesieve-5.4.1 && ./configure && make -j 10 && make install && rm -rf /tmp/primesieve*

Check http://primesieve.org/build.html for the latest version.


# OpenCV Computer Vision:

    # See http://stackoverflow.com/questions/26592577/installing-opencv-in-ubuntu-14-10

    # Test: "import cv2"

    iptables -F && cd /tmp&& rm -rf libvpx && git clone https://chromium.googlesource.com/webm/libvpx && cd libvpx/ && ./configure --disable-static --enable-shared  && make -j20 install && chmod a+r /usr/local/lib/*libvpx* && rm /usr/lib/x86_64-linux-gnu/*libvpx* && cp -av /usr/local/lib/*libvpx* /usr/lib/x86_64-linux-gnu/ && cd .. && rm -rf libvpx  && rm -rf opencv && mkdir opencv && cd opencv && git clone git://source.ffmpeg.org/ffmpeg.git && cd ffmpeg && ./configure  --enable-libvpx --enable-shared --disable-static && make -j20 install && cd .. && rm -rf ffmpeg && wget http://downloads.sourceforge.net/project/opencvlibrary/opencv-unix/2.4.10/opencv-2.4.10.zip && unzip opencv-2.4.10.zip && cd opencv-2.4.10 && mkdir build && cd build && time cmake -D CMAKE_BUILD_TYPE=RELEASE -D CMAKE_INSTALL_PREFIX=/usr/local -D WITH_TBB=ON -D BUILD_NEW_PYTHON_SUPPORT=ON -D WITH_V4L=ON -D INSTALL_C_EXAMPLES=ON -D INSTALL_PYTHON_EXAMPLES=ON -D BUILD_EXAMPLES=ON -D WITH_QT=ON -D WITH_OPENGL=ON .. && time make -j12 && make install && sh -c 'echo "/usr/local/lib" > /etc/ld.so.conf.d/opencv.conf' && sudo ldconfig && cd /tmp && rm -rf opencv


# KWANT

  apt-add-repository ppa:kwant-project/ppa && apt-get update && apt-get install python-kwant python-kwant-doc


# Octave: needed by octave for plotting:

    # I tediously got this list of things that would install by not installing 'msh', 'bim', 'secs1d'

    apt-get install octave-audio octave-biosig octave-common octave-communications octave-communications-common octave-control octave-data-smoothing octave-dataframe octave-dbg octave-doc octave-econometrics octave-epstk octave-financial octave-fpl octave-ga octave-gdf octave-general octave-geometry octave-gmt octave-gsl octave-htmldoc octave-image octave-info octave-io octave-lhapdf octave-linear-algebra octave-miscellaneous octave-missing-functions octave-mpi octave-nan octave-nlopt octave-nurbs octave-ocs octave-octcdf octave-odepkg octave-openmpi-ext octave-optim octave-optiminterp octave-parallel octave-pfstools octave-pkg-dev octave-psychtoolbox-3 octave-quaternion octave-secs2d octave-signal octave-sockets octave-specfun octave-splines octave-statistics octave-strings octave-struct octave-sundials octave-symbolic octave-tsa octave-vlfeat octave-vrml octave-zenity

    cd /usr/share/fonts/truetype && ln -s liberation ttf-liberation


# Dropbox: so it's possible to setup dropbox to run in projects... at some point (users could easily do this anyways, but making it systemwide is best).

      Get it here: https://www.dropbox.com/install?os=lnx



# Neovim system-wide:

    cd /tmp && rm -rf neovim && unset MAKE && git clone https://github.com/neovim/neovim && cd neovim && make && umask 022 && sudo make install && rm -rf /tmp/neovim

# MACAULAY2: Install Macaulay2 system-wide from here: http://www.math.uiuc.edu/Macaulay2/Downloads/

    apt-get install libntl-dev libntl0  libpari-gmp-tls4 libpari-dev pari-gp2c && cd /tmp/ && rm -rf m2 && mkdir m2 && cd m2 && wget http://www.math.uiuc.edu/Macaulay2/Downloads/Common/Macaulay2-1.7-common.deb && wget  http://www.math.uiuc.edu/Macaulay2/Downloads/GNU-Linux/Ubuntu/Macaulay2-1.7-amd64-Linux-Ubuntu-14.10.deb && sudo dpkg -i *.deb  && rm -rf /tmp/m2


# Julia: from http://julialang.org/downloads/

    add-apt-repository ppa:staticfloat/juliareleases && add-apt-repository ppa:staticfloat/julia-deps && apt-get update && apt-get install julia julia-doc

# FEnICS: automated solution of differential equations by finite element methods
  (Test with "import dolfin".)

    add-apt-repository ppa:fenics-packages/fenics && apt-get update && apt-get install fenics


# System-wide Python packages not through apt:

   apt-get install python-pip python3-pip &&   umask 022 && /usr/bin/pip install -U theano && /usr/bin/pip install -U clawpack


# POLYMAKE system-wide

  # From http://www.polymake.org/doku.php/howto/install
  # Get latest from http://www.polymake.org/doku.php/download/start and build:

      apt-get install ant default-jdk g++ libboost-dev libgmp-dev libgmpxx4ldbl libmpfr-dev libperl-dev libsvn-perl libterm-readline-gnu-perl libxml-libxml-perl libxml-libxslt-perl libxml-perl libxml-writer-perl libxml2-dev w3c-dtd-xhtml xsltproc && cd /tmp/&& wget http://www.polymake.org/lib/exe/fetch.php/download/polymake-2.13.tar.bz2&& tar xvf polymake-2.13.tar.bz2 && cd polymake-2.13 && ./configure && make && make install && rm -rf /tmp/polymake*

# Make ROOT data analysis ipython notebook support system-wide work.

   cd /usr/lib/x86_64-linux-gnu/root5.34 && wget https://gist.githubusercontent.com/mazurov/6194738/raw/67e851fdac969e670a11296642478f1801324b8d/rootnotes.py && chmod a+r * && echo "import sys; sys.path.extend(['/usr/lib/python2.7/dist-packages/', '/usr/lib/pymodules/python2.7', '/usr/lib/x86_64-linux-gnu/root5.34/', '/usr/local/lib/python2.7/dist-packages'])"$'\n' >  /usr/local/sage/current/local/lib/python/sitecustomize.py


# Install 4ti2 system-wide...

    export V=1.6.2 && cd /tmp && rm -rf 4ti2 && mkdir 4ti2 && cd 4ti2 && wget http://www.4ti2.de/version_$V/4ti2-$V.tar.gz && tar xf 4ti2-$V.tar.gz && cd 4ti2-$V && ./configure --prefix=/usr/local/ && time make -j8
    make install  &&  rm -rf /tmp/4ti2    # this *must* be a separate step!! :-(



# Add to /etc/security/limits.conf

Add these two lines two `/etc/security/limits.conf` so that bup works with large number of commits.

  echo $'\n'"root     soft    nofile          20000"$'\n' >> /etc/security/limits.conf
  echo "root     hard    nofile          20000"$'\n' >> /etc/security/limits.conf

# These to avoid fork-bombs:

   echo "* soft nproc 1000"$'\n' >> /etc/security/limits.conf
   echo "* hard nproc 1100"$'\n' >> /etc/security/limits.conf
   echo "root soft nproc 20000"$'\n' >> /etc/security/limits.conf
   echo "root hard nproc 20000"$'\n' >> /etc/security/limits.conf


# Setup /usr/local/bin/skel

   rsync -axvHL ~/salvus/salvus/local_hub_template/ ~/.sagemathcloud/
   cd ~/.sagemathcloud && . sagemathcloud-env && ./build

   cd /usr/local/bin/ && sudo ln -s /home/salvus/salvus/salvus/scripts/skel/ . && cd ~/salvus/salvus/scripts/skel/ && rm -rf .sagemathcloud && mv ~/.sagemathcloud .


# Salvus (needs more!)

   cd /home/salvus/salvus/salvus/
   mkdir local_hub_template/node_modules
   cp scripts/skel/.sagemathcloud/node_modules/*.js local_hub_template/node_modules/
   ./make_coffee --all

# KVM HOSTS

On the VM hosts, some things are critical:


    # Do this or VM's may be unstartable for a very, very long time.
    echo never > /sys/kernel/mm/transparent_hugepage/enabled; echo never > /sys/kernel/mm/transparent_hugepage/defrag

    # put this in cron since it's so critical that the perms are right... or vm's won't start
    */10 * * * * sudo chmod a+r /boot/vmlinuz-*; sudo chmod a+rw /dev/fuse

In /etc/sysctl.conf, put:

    vm.swappiness=1


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

TINC_VERSION       = '1.0.25'    # options here -- http://tinc-vpn.org/packages/
CASSANDRA_VERSION  = '2.1.3'     # options here -- http://downloads.datastax.com/community/
NODE_VERSION       = '0.12.0'    # options here -- http://nodejs.org/dist/   -- 0.[even].* is STABLE version.
PYTHON_VERSION     = '2.7.9'     # options here -- https://www.python.org/ftp/python/
SETUPTOOLS_VERSION = '12.1'      # options here (bottom!) -- https://pypi.python.org/pypi/setuptools
NGINX_VERSION      = '1.7.10'    # options here -- http://nginx.org/download/
HAPROXY_VERSION    = '1.5.11'    # options here -- http://www.haproxy.org/download/
STUNNEL_VERSION    = '5.10'      # options here -- https://www.stunnel.org/downloads.html
GDAL_VERSION       = '1.11.2'    # options here -- http://download.osgeo.org/gdal/?C=M;O=D

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
    'primus',  # websocket abstraction
    'ws',      # fast low-level websocket depedency for primus
    'sockjs',  # not used but is optionally available in hub/primeus/client
    'engine.io',  # this is the one we use -- seems by far the best overall.  CAREFUL WITH DNS!
    'cassandra-driver',
    'coffee-script',
    'node-uuid',
    'browserify@1.16.4',
    'uglify-js2',
    'express',       # web server
    'express-session',   # needed for oauth1 bitbucket auth
    'body-parser',   # parse post form uploads (needed for auth)
    'passport',
    'passport-bitbucket',
    'passport-dropbox-oauth2',
    'passport-facebook',
    'passport-github',
    'passport-google-oauth',
    'passport-local',
    'passport-twitter',
    'passport-wordpress',
    'nodeunit',
    'validator',
    'async',
    'password-hash',
    'nodemailer',
    'nodemailer-sendgrid-transport',
    'cookies',
    'htmlparser',
    'mime',
    'pty.js',
    'posix',
    'mkdirp',
    'walk',
    'temp',
    'formidable@latest',
    'moment',
    'underscore',
    'read',
    'hashring',
    'rimraf',
    'net-ping',
    'marked',
    'node-sass',    # transspiller for *.sass to *.css (rootfile is page/index.sass)
    'http-proxy',   # https://github.com/nodejitsu/node-http-proxy
    'stripe'        # for billing -- https://github.com/stripe/stripe-node
    ]

PYTHON_PACKAGES = [
    'readline',
    'ipython',            # a usable command line  (ipython uses readline)
    'python-daemon',      # daemonization of python modules
    'paramiko',           # ssh2 implementation in python
    'cql',                # interface to Cassandra
    'pyyaml'              # used by wizard build script
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
    'scikit-image',
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
    'joblib',
    'colorpy',
    'rootpy',    # supports ROOT data analysis framework
    'tabulate',
    'goslate',    # google translate api -- http://pythonhosted.org/goslate/
    'certifi',    # dependency of https://github.com/obspy, which is installed systemwide from an ubuntu package repo
    'ez_setup',   # needed by fipy
    'pyparse',    # needed by fipy
    'fipy',       # requested by Evan Chenelly <echenelly@gmail.com> -- "A finite volume PDE solver in Python".
    'python-igraph', # requested by Santhust <santhust31@gmail.com> -- "High performance graph data structures and algorithms" -- https://pypi.python.org/pypi/python-igraph/0.7
    'mygene',   # requested by Luca Beltrame for a bioinformatics course
    'singledispatch',  # needed by rpy2 ipython extension now
    'qutip',    # QuTiP is open-source software for simulating the dynamics of open quantum systems.
    'tinyarray',
    'pysal',    # requested by Serge Rey of ASU for a course on Geographic Information Analysis
    'folium',   # requested by Serge Rey of ASU for a course on Geographic Information Analysis
    'pint',     # units package: http://pint.readthedocs.org/en/0.6/
    'seaborn',
    'ipythonblocks',
    'line_profiler',
    'astropy',
    'mrjob',
    'boto',
    'pattern',
    'seaborn',
    'brewer2mpl',
    'ggplot',
    'periodictable'
    'nltk',
    'param',
    'holoviews',
    'plink',
    'spherogram',
    'FXrays',
    'snappy'
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
    'Cairo',
    #'xlsx',
    'XML',
    'data.table',
    'brian',
    'rugarch',
    'quantmod',
    'swirl',
    'psych',
    'spatstat',
    'UsingR'
]

SAGE_OPTIONAL_PACKAGES = [
    'biopython',
    'chomp',
    'database_cremona_ellcurve',
    'database_odlyzko_zeta',
    'database_pari',
    'biopython',
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
    'fricas',
    'gambit',
    'gap_packages',
    'gnuplotpy',
    'guppy',
    'kash3',
    'lie',
    'lrs',
    'mcqd',
    'nauty',
    'normaliz',
    'nose',
    'nzmath',
    'ore_algebra',
    'p_group_cohomology',
    'phc',
    'pybtex',
    'pycryptoplus',
    'pyx',
    'pyzmq',
    'qhull',
    'topcom',
    'zeromq',
    '4ti2'
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


def cmd(s, path=None):
    if path is not None:
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
        self.pull_smc_sage()
        self.unextend_sys_path()
        self.patch_sage_location()
        self.patch_banner()
        self.patch_sage_env()
        self.install_sloane()
        self.install_projlib()
        self.install_pip()
        self.install_pip_packages()
        self.install_jinja2() # since sage's is too old and pip packages doesn't upgrade
        self.install_R_packages()
        self.install_pystan()
        self.install_optional_packages()
        self.install_quantlib()
        self.install_neuron()
        self.install_basemap()
        self.install_pydelay()
        self.install_gdal()
        self.install_stein_watkins()
        self.install_jsanimation()
        self.install_psage()
        self.install_sage_manifolds()

        self.clean_up()
        self.extend_sys_path()
        self.fix_permissions()

        self.octave_ext()  # requires ZFS
        self.install_ipython_patch()  # must be done manually still

        # drepecated
        #self.install_enthought_packages()  # doesn't work anymore; they don't really want this.
        #self.install_4ti2()   # no longer needed since 4ti2 sage optional package finally works again...

        # FAILED:
        self.install_pymc()     # FAIL -- also "pip install pymc" fails.
        self.install_rstan()    # FAIL -- ERROR: dependency StanHeaders is not available for package rstan

    def install_sage_manifolds(self):
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemanifolds/sage.git </dev/null && sage -br < /dev/null")

    def pull_smc_sage(self):
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemathinc/smc-sage")

    def install_jinja2(self):
        self.cmd("pip install -U jinja2")

    def install_ipython_patch(self):
        """
        TODO:
        """
        raise RuntimeError("TODO: change line 171 of '/usr/local/sage/current/local/lib/python/site-packages/IPython/html/notebookapp.py' to 'static_url_prefix = '/static/ipython/''")

    def install_jsanimation(self):
        self.cmd("cd /tmp && rm -rf JSAnimation && git clone https://github.com/jakevdp/JSAnimation.git && cd JSAnimation && python setup.py install && rm -rf /tmp/JSAnimation")

    def install_psage(self):
        self.cmd("cd /tmp/&& rm -rf psage && git clone git@github.com:williamstein/psage.git&& cd psage&& sage setup.py install && rm -rf /tmp/psage")

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
        The /usr/local/sage/current/local/share/sage/ext must be writeable by all, which is
        a stupid horrible bug/shortcoming in Sage that people constantly hit.   As a workaround,
        we link it to a constrained filesystem for this purpose.
        """
        target = self.path("local/share/sage/ext")
        src = "/pool/ext"

        if not (os.path.exists(src) and os.path.isdir(src)):
            raise RuntimeError("please create a limited ZFS pool mounted as /pool/ext, with read-write access to all:\n\n\tzfs create pool/ext && chmod a+rwx /pool/ext && zfs set quota=1G pool/ext\n")

        if os.path.exists(target):
            try:
                shutil.rmtree(target)
            except:
                os.unlink(target)
        os.symlink(src, target)

    def install_sloane(self):
        """
        Install the Sloane Encyclopaedia tables.  These used to be installed via an optioanl package,
        but instead one must now run a command from within Sage.
        """
        from sage.all import SloaneEncyclopedia
        SloaneEncyclopedia.install(overwrite=True)

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
        ROOT = '/usr/lib/x86_64-linux-gnu/' + [x for x in os.listdir('/usr/lib/x86_64-linux-gnu/') if 'root' in x][-1]
        paths = ['/usr/lib/python2.7/dist-packages/', '/usr/local/lib/python2.7/dist-packages/', '/usr/lib/pymodules/python2.7', ROOT]
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

    def install_pymc(self):
        self.cmd("pip install git+https://github.com/pymc-devs/pymc")

    def install_R_packages(self):
        s = ','.join(['"%s"'%name for name in R_PACKAGES])
        c = 'install.packages(c(%s), repos="http://cran.cs.wwu.edu/")'%s
        self.cmd("echo '%s' | R --no-save"%c)

    def install_rstan(self):
        """
        Install the R stan pain-to-install package into R.
        See the following for why/how
            https://github.com/stan-dev/rstan/wiki/RStan-Getting-Started
            https://github.com/stan-dev/stan/tree/master
            https://groups.google.com/forum/#!topic/stan-users/Qbkuu51QZvU
        """
        self.cmd(r"""echo 'install.packages(c("inline", "BH", "RcppEigen", "Rcpp"), repos="http://cran.cs.wwu.edu/")' | R --no-save && cd /tmp && rm -rf rstan && git clone --recursive https://github.com/stan-dev/rstan.git && cd rstan/rstan && echo 'CXXFLAGS = -O2 $(LTO)' > R_Makevars && make install && rm -rf /tmp/rstan""")

    def install_pystan(self):
        self.cmd(r"""cd /tmp && rm -rf pystan && git clone --recursive https://github.com/stan-dev/pystan.git && cd pystan && python setup.py install && rm -rf /tmp/pystan""")

    def install_optional_packages(self, skip=[]):
        from sage.all import install_package
        if 'MAKE' not in os.environ:
            # some packages, e.g., chomp, won't build without MAKE being set.
            os.environ['MAKE'] = "make -j%s"%NCPU
        for package in SAGE_OPTIONAL_PACKAGES:
            if package in skip:
                log.info("** Skipping %s **"%package)
                continue
            log.info("** Installing/upgrading %s **"%package)
            #install_package(package)
            # We have to do this (instead of use install_package) because Sage's install_package
            # command is completely broken in rc0 at least (April 27, 2014).
            self.cmd("sage -i %s"%package)
        # We also have to do a "sage -b", since some optional packages don't get fully installed
        # until rebuilding Cython modules.  I posted to sage-devel about this bug on Aug 4.
        self.cmd("sage -b")

    # deprecated because it now says: "The EPD subscriber repository is only available to subscribers."
    def DEPRECATED_install_enthought_packages(self):
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
        cmd("/usr/bin/git clone git@github.com:matplotlib/basemap.git", "/tmp")
        cmd("python setup.py install", "/tmp/basemap")
        shutil.rmtree("/tmp/basemap")

    def install_pydelay(self):
        """
        Install pydelay -- a program which translates a system of delay differential equations (DDEs) into simulation C-code and compiles and runs the code (using scipy weave).  -- see http://pydelay.sourceforge.net/

        Requested for UCLA by Jane Shevtsov: https://plus.google.com/115360165819500279592/posts/73vK9Pw4W6g
        """
        cmd("umask 022 &&  cd /tmp/ &&  rm -rf pydelay* &&  wget http://downloads.sourceforge.net/project/pydelay/pydelay-0.1.1.tar.gz &&  tar xf pydelay-0.1.1.tar.gz &&  cd pydelay-0.1.1 &&  python setup.py install &&  rm -rf /tmp/pydelay*")

    def install_gdal(self):
        """
        Install GDAL -- for geospatial imaging.
        """
        # The make; make -j8 below instead of just make is because the first make mysteriously gives an error on
        # exit, but running it again seems to work fine.
        cmd("umask 022 &&  unset MAKE && cd /tmp && export V=%s && rm -rf gdal-$V* && wget http://download.osgeo.org/gdal/CURRENT/gdal-$V.tar.xz && tar xf gdal-$V.tar.xz && cd gdal-$V && export CXXFLAGS=-I/usr/include/mpi/ && ./configure --with-python --prefix=$SAGE_ROOT/local && unset SHELL && make -j8; make && cd swig/python && python setup.py install && cd ../.. && make install && cd /tmp && rm -rf gdal-$V*"%GDAL_VERSION)

    def install_stein_watkins(self):
        # The package itself is "sage -i database_stein_watkins"
        cmd("umask 022 && cd /usr/local/sage/current/data && rm -f stein_watkins stein-watkins-ecdb && ln -sf /usr/local/sage/stein-watkins-ecdb stein-watkins-ecdb && ln -sf /usr/local/sage/stein-watkins-ecdb stein_watkins")

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
            download("http://haproxy.1wt.eu/download/1.5/src/haproxy-%s.tar.gz"%HAPROXY_VERSION)

        path = extract_package('haproxy')

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
