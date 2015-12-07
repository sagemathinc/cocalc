#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014-2015, William Stein
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
    * rethinkdb -- distributed push database
    * bup -- git-ish backup
    * sage -- we do *not* build or include Sage; it must be available system-wide or for
      user in order for worksheets to work (everything but worksheets should work without Sage).


# Install critical packages needed for building SMC source code:

        apt-get update && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  ipython python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev linux-image-extra-virtual


# Ubuntu add and resource-wasting-on-every-ssh crap:

put `exit 0` at the beginning of `/etc/update-motd.d/50-landscape-sysinfo`


# Compute VM's



apt-get update && apt-get upgrade && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  ipython python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev python3-psutil

# Critical to get rid of certain packages that just cause trouble:

apt-get remove mlocate


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

    apt-get install  libmed1 libhdf5-mpich2-dev gmsh dstat emacs vim poppler-utils texlive texlive-* gv imagemagick octave mercurial flex bison unzip libzmq-dev uuid-dev scilab axiom yacas octave-symbolic quota quotatool dot2tex python-numpy python-scipy python-pandas python-tables libglpk-dev python-h5py zsh python3 python3-zmq python3-setuptools cython htop ccache python-virtualenv clang libgeos-dev libgeos++-dev sloccount racket libxml2-dev libxslt-dev irssi libevent-dev tmux sysstat sbcl gawk noweb libgmp3-dev ghc  ghc-doc ghc-haddock ghc-mod ghc-prof haskell-mode haskell-doc subversion cvs bzr rcs subversion-tools git-svn markdown lua5.2 lua5.2-*  encfs auctex vim-latexsuite yatex spell cmake libpango1.0-dev xorg-dev gdb valgrind doxygen haskell-platform haskell-platform-doc haskell-platform-prof  mono-devel mono-tools-devel ocaml ocaml-native-compilers camlp4-extra proofgeneral proofgeneral-doc tuareg-mode ocaml-mode libgdbm-dev mlton sshfs sparkleshare fig2ps epstool libav-tools python-software-properties software-properties-common h5utils libnetcdf-dev netcdf-doc netcdf-bin tig libtool iotop asciidoc autoconf bsdtar attr  libicu-dev iceweasel xvfb tree bindfs liblz4-tool tinc python-scikits-learn python-scikits.statsmodels python-skimage python-skimage-doc  python-skimage-lib python-sklearn  python-sklearn-doc  python-sklearn-lib python-fuse cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup cgmanager cgmanager-utils cgroup-lite  cgroup-bin  r-recommended libquantlib0 libquantlib0-dev quantlib-examples quantlib-python quantlib-refman-html r-cran-rquantlib  libpng++-dev libcairomm-1.0-dev r-cran-cairodevice x11-apps  mesa-utils libpangox-1.0-dev    libf2c2-dev gnugo libapr1-dev libcap2-bin  lbzip2 mosh smem libcurl4-openssl-dev jekyll lynx-cur root-system-bin libroot-bindings-python-dev libroot-graf2d-postscript5.34  csh x11vnc x11-apps meld aspell-* inkscape libopencv-dev build-essential checkinstall cmake pkg-config yasm libjpeg-dev libjasper-dev libavcodec-dev libavformat-dev libswscale-dev libdc1394-22-dev libxine2-dev libgstreamer0.10-dev libgstreamer-plugins-base0.10-dev libv4l-dev python-dev python-numpy libtbb-dev libqt4-dev libgtk2.0-dev  libmp3lame-dev libopencore-amrnb-dev libopencore-amrwb-dev libtheora-dev libvorbis-dev libxvidcore-dev x264 v4l-utils r-cran-rgl libgtk2.0-dev php5 python-docutils pdftk smlnj  ml-lex ml-yacc p7zip-full check  unison-all fonts-ocr-a libwebp-dev libpari-dev libpari-dbg pari-gp2c pari-galpol lzip ncompress ipython3 gpicview python-pip libedit-dev lrzip libgsl0-dev btrfs-tools tmpreaper hdf5-helpers libhdf5-cpp-8 libhdf5-dev scons wordnet pv golang-go libgraphviz-dev protobuf-compiler  libcurl4-openssl-dev  libboost-all-dev  libjemalloc-dev xpra emacs-goodies-el python-mode dieharder jags unrar-free joe mc llvm ncbi-blast+ libavcodec-extra ffmpeg ocaml-batteries-included opam opam-docs libboost-python-dev libboost-signals-dev libcgal-dev gcc-multilib libc6-i386 plink grace linux-tools-generic linux-tools-common

# tmpreaper

Remove the security warning line in /etc/tmpreaper.conf so it actually runs.


# Python3-related packages of interest

    apt-get install python3-pip libzmq3-dev python3-pandas  python3-matplotlib python3-numpy python3-xlrd python3-nose bpython3 diveintopython3 libpython3-dev python3-dev python3-aeidon python3-alabaster python3-anyjson python3-astropy python3-audioread python3-args python3-babel python3-bottle python3-bs4 python3-bsddb3 python3-celery python3-changelog python3-cherrypy3 python3-crypto python3-cryptography python3-csb python3-cssutils python3-dateutil python3-decorator python3-defer python3-distutils-extra python3-django python3-django-xmlrpc python3-django-tables2 python3-django-model-utils python3-django-jsonfield python3-django-filters python3-dns python3-dnsq python3-doc python3-docutils python3-ecdsa python3-empy python3-examples python3-expiringdict python3-extras python3-feedparser python3-fftw3 python3-flake8 python3-flask python3-flask-sqlalchemy python3-flask-script python3-flask-principal python3-fysom python3-gdal python3-genshi python3-geoip python3-gmpy2 python3-gnupg python3-greenlet python3-gsw python3-h5py python3-httplib2 python3-icalendar python3-idna python3-ipy python3-jinja2 python3-jsmin python3-lesscpy python3-levenshtein python3-linop python3-mako python3-mia python3-misaka python3-mockito python3-mock python3-mpi4py python3-mpmath python3-msgpack python3-nose2 python3-nose2-cov python3-nine python3-numexpr python3-numpy python3-oauth python3-openssl python3-pandas python3-paramiko python3-pandocfilters python3-patsy python3-pep8 python3-persistent python3-pexpect python3-pil python3-pyasn1 python3-progressbar python3-potr python3-ply python3-pkginfo python3-pygraph python3-pygments python3-pyscss python3-pyramid python3-pyro4 python3-rdflib python3-releases python3-rsa python3-scipy python3-shortuuid python3-simplejson python3-skimage python3-six python3-sphinx python3-sphere python3-sqlalchemy python3-tables python3-testtools python3-urllib3 python3-venv python3-virtualenv python3-werkzeug python3-xlrd python3-xlsxwriter python3-yaml python3-zmq


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

# GAP3

Install 64-bit version from http://webusers.imj-prg.fr/~jean.michel/gap3/

    umask 022 && cd /projects/sage && wget http://webusers.imj-prg.fr/~jean.michel/gap3/gap3-jm5.zip && unzip gap3-jm5.zip && rm gap3-jm5.zip && mv gap3-jm5 gap3 && cd gap3 && sudo  ln -s /projects/sage/gap3/bin/gap.sh /usr/local/bin/gap3
    vi /projects/sage/gap3/bin/gap.sh   # set GAP_DIR to /projects/sage/gap3

# OpenCV Computer Vision (not sure if I want to continue with this! -- it conflicts with systemwide ffmpeg)

    # See http://stackoverflow.com/questions/26592577/installing-opencv-in-ubuntu-14-10

    # Test: "import cv2"

    iptables -F && cd /tmp&& rm -rf libvpx && git clone https://chromium.googlesource.com/webm/libvpx && cd libvpx/ && ./configure --disable-static --enable-shared  && make -j20 install && chmod a+r /usr/local/lib/*libvpx* && rm /usr/lib/x86_64-linux-gnu/*libvpx* && cp -av /usr/local/lib/*libvpx* /usr/lib/x86_64-linux-gnu/ && cd .. && rm -rf libvpx  && rm -rf opencv && mkdir opencv && cd opencv && git clone git://source.ffmpeg.org/ffmpeg.git && cd ffmpeg && ./configure  --enable-libvpx --enable-shared --disable-static && make -j20 install && cd .. && rm -rf ffmpeg && wget http://downloads.sourceforge.net/project/opencvlibrary/opencv-unix/2.4.10/opencv-2.4.10.zip && unzip opencv-2.4.10.zip && cd opencv-2.4.10 && mkdir build && cd build && time cmake -D CMAKE_BUILD_TYPE=RELEASE -D CMAKE_INSTALL_PREFIX=/usr/local -D WITH_TBB=ON -D BUILD_NEW_PYTHON_SUPPORT=ON -D WITH_V4L=ON -D INSTALL_C_EXAMPLES=ON -D INSTALL_PYTHON_EXAMPLES=ON -D BUILD_EXAMPLES=ON -D WITH_QT=ON -D WITH_OPENGL=ON .. && time make -j12 && make install && sh -c 'echo "/usr/local/lib" > /etc/ld.so.conf.d/opencv.conf' && sudo ldconfig && cd /tmp && rm -rf opencv
    # then
    mv /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg.0


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

# Nemo (after installing Julia)

    umask 022
    export JULIA_PKGDIR=/usr/local/share/julia/site/
    echo 'Pkg.clone("https://github.com/wbhart/Nemo.jl")' | julia
    echo 'Pkg.build("Nemo")' | julia
    export LD_LIBRARY_PATH=/usr/local/share/julia/site/v0.4/Nemo/local/lib
    cd $LD_LIBRARY_PATH; ln -s ln -s libarb.so.0.0.0 libarb.so
    echo 'using Nemo' | julia

To test, do this from Julia:

    using Nemo


# GIAC

Add to /etc/apt/sources.list:

    deb http://www-fourier.ujf-grenoble.fr/~parisse/debian/ stable main

Then

    apt-get update; apt-get install giac python-giacpy

# FEnICS: automated solution of differential equations by finite element methods
  (Test with "import dolfin".)

    add-apt-repository ppa:fenics-packages/fenics && apt-get update && apt-get install fenics


# System-wide Python packages not through apt:

   apt-get install python-pip python3-pip &&   umask 022 && /usr/bin/pip install -U theano && /usr/bin/pip install -U clawpack

# IPYTHON3 in Python3 systemwide

    sudo pip3 install --upgrade ipython  ipywidgets
    sudo ipython3 kernelspec install-self rethinkdb filterpy

Then edit /usr/local/share/jupyter/kernels/python3 and add a "-E" option before "-m" so that python3 can start with the sage -sh environment set.

# IJULIA

        sudo su
        umask 022; export JULIA_PKGDIR=/usr/local/share/julia/site/; julia

        julia> Pkg.init()
        julia> Pkg.add("IJulia")

        # this copy may change when ipython dir changes
 		cp -rv "/root/.sage/ipython-2.3.0.p0/kernels/julia 0.3" "/usr/local/share/jupyter/kernels/julia 0.3"

        Make sure the json file is this (it should be, with no change):

        vi "/usr/local/share/jupyter/kernels/julia 0.3/kernel.json"

        {
          "display_name": "Julia",
          "argv": [
            "/usr/bin/julia",
            "-i",
            "-F",
            "/usr/local/share/julia/site/v0.3/IJulia/src/kernel.jl",
            "{connection_file}"
          ],
          "language": "julia"
        }

# R Kernel support for Jupyter (see https://github.com/IRkernel/IRkernel)

    sudo su
    umask 022
    # and make this file:  /usr/local/share/jupyter/kernels/ir/kernel.json

{
 "language": "r",
 "argv": [
  "R",
  "-e",
  "IRkernel::main()",
  "--args",
  "{connection_file}"
 ],
 "display_name": "R"
}




# POLYMAKE system-wide

  # From http://www.polymake.org/doku.php/howto/install
  # Get latest from http://www.polymake.org/doku.php/download/start and build:

      apt-get install ant default-jdk g++ libboost-dev libgmp-dev libgmpxx4ldbl libmpfr-dev libperl-dev libsvn-perl libterm-readline-gnu-perl libxml-libxml-perl libxml-libxslt-perl libxml-perl libxml-writer-perl libxml2-dev w3c-dtd-xhtml xsltproc && cd /tmp/&& wget http://www.polymake.org/lib/exe/fetch.php/download/polymake-2.14r1.tar.bz2&& tar xvf polymake-2.14r1.tar.bz2 && cd polymake-2.14 && ./configure && make && make install && rm -rf /tmp/polymake*

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
   ./install.py all

# MPI -- see http://stackoverflow.com/questions/12505476/using-mpich-with-boost-mpi-on-ubuntu

    apt-get install mpich mpich-doc libmpich-dev && update-alternatives --set mpi /usr/include/mpich

# KVM HOSTS

On the VM hosts, some things are critical:


    # Do this or VM's may be unstartable for a very, very long time.
    echo never > /sys/kernel/mm/transparent_hugepage/enabled; echo never > /sys/kernel/mm/transparent_hugepage/defrag

    # put this in cron since it's so critical that the perms are right... or vm's won't start
    */10 * * * * sudo chmod a+r /boot/vmlinuz-*; sudo chmod a+rw /dev/fuse

In /etc/sysctl.conf, put:

    vm.swappiness=1

# Critical for compute VM's using google cloud storage:

    sudo pip uninstall crcmod; sudo pip install -U crcmod


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
    umask 022 && cp -rv /usr/local/sage/current/local/share/texmf/tex/generic/sagetex /usr/share/texmf/tex/latex/ && texhash


# System-wide Python pip packages

    sudo su
    umask 022
    pip install twitter ctop
    pip3 install --upgrade twitter sympy uncertainties zope.interface scikit-learn datasift
    pip3 install --upgrade numba

# The netcd4 system-wide python package requires some crazy environment variables to work:

    export PROJ_DIR=/usr; export NETCDF4_DIR=/usr; export HDF5_DIR=/usr/lib/x86_64-linux-gnu/hdf5/serial/; export HDF5_DIR=/usr/; export C_INCLUDE_PATH=/usr/lib/openmpi/include; export USE_NCCONFIG=0;  export HDF5_INCDIR=/usr/include/hdf5/serial; export HDF5_LIBDIR=/usr/lib/x86_64-linux-gnu/hdf5/serial; export HDF5_INCDIR=/usr/include/hdf5/serial
    pip3 install --upgrade netcdf4

# And for normal python2:

    pip install datasift bokeh

# System-wide git trac

cd /tmp && git clone https://github.com/sagemath/git-trac-command.git && cd git-trac-command && sudo setup.py install && rm -rf /tmp/git-trac-command


# X11

Add this line

    X11UseLocalhost no

to

    /etc/ssh/sshd_config

# HORRIBLE STUFF

Modified some code in axes3d.py in here:

    salvus@compute1-us:/projects/sage/sage-6.7/local/lib/python2.7/site-packages/mpl_toolkits

    self._draw_grid = False if b == "off" else bool(b)
    #self._draw_grid = cbook._string_to_bool(b)

# EVEN MORE GORE

Install a temporary Rscript wrapper, because there is no `sage -Rscript` as a pendant to `sage -R`:

    $ cat /usr/local/bin/Rscript
    #!/usr/bin/env bash
    SAGEDIR=$(dirname $(readlink -f $(which sage)))
    exec sage -sh -c "$SAGEDIR/local/bin/Rscript $@"

"""

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

NODE_MODULES = [
    'commander',
    # I had to fork the official start-stop-daemon, since it is broken with
    # newer node versions -- https://github.com/sagemathinc/start-stop-daemon
    'sagemathinc/start-stop-daemon',
    'winston',
    'primus',  # websocket abstraction
    'ws',      # fast low-level websocket depedency for primus
    'sockjs',  # not used but is optionally available in hub/primeus/client
    'engine.io',  # this is the one we use -- seems by far the best overall.  CAREFUL WITH DNS!
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
    'stripe',       # for billing -- https://github.com/stripe/stripe-node
    'blocked',      # checking for blocking
    'sqlite3',
    'pdfkit',
    'coffee-react',  # used for react (obviously)
    'dirty',         # terrible key-value store
    'gaze',          # file watcher
    'react',         # facebook's core react library
    'flummox',       # flux implementation for react
    'react-bootstrap', # bootstrap components
    'rethinkdb'
    ]

# this is for the python in the /home/salvus/... place, not the system-wide or sage python!
PYTHON_PACKAGES = [
    'readline',
    'ipython',            # a usable command line  (ipython uses readline)
    'python-daemon',      # daemonization of python modules
    'paramiko',           # ssh2 implementation in python
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
    'greenlet', # Lightweight in-process concurrent programming
    'gmpy2',
    'mmh3',
    'joblib',
    'colorpy',
    #'rootpy',    # supports ROOT data analysis framework  -- broken "import ROOT" doesn't work anymore
    'tabulate',
    'goslate',    # google translate api -- http://pythonhosted.org/goslate/
    'certifi',    # dependency of https://github.com/obspy, which is installed systemwide from an ubuntu package repo
    'ez_setup',   # needed by fipy
    #'pysparse',    # needed by fipy; for the ==1.2-dev213 bullshit, see http://stackoverflow.com/questions/25459011/how-to-build-pysparse-on-ubuntu; it's amazing how bad pypi and python packaging are.  Wow.
    'fipy',       # requested by Evan Chenelly <echenelly@gmail.com> -- "A finite volume PDE solver in Python".
                  # to get it to build had to instead download directly and comment out these lines from setup.py
                  # #import ez_setup; ez_setup.use_setuptools()
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
    'periodictable',
    'nltk',
    'param',
    'holoviews',
    'plink',
    'spherogram',
    'FXrays',
    'snappy',
    'twitter',
    'bayespy',
    'astropy',
    'aplpy',
    'PyDSTool',
    'progressbar',  # requested by David Lisbonne
    'pdfminer', # requested by Mesut Karakoc
    'wcsaxes',
    'reproject',
    'txaio', 'six','autobahn','python-dateutil','service-identity','datasift',  # the things to left are deps for datasift.  This is horrible, but if I don't do this the install fails trying to upgrade a system-wide installed ubuntu pip package.
    'scikits.bootstrap',
    'pystan',
    'biopython',
    'guppy',
    'nose',
    'pybtex',
    'bokeh',
    'numba'
    ]

SAGE_PIP_PACKAGES_ENV = {'clawpack':{'LDFLAGS':'-shared'}}

# Pip packages but where we *do* install deps
SAGE_PIP_PACKAGES_DEPS = [
    'Nikola[extras]',
    'enum34', 'singledispatch', 'funcsigs', 'llvmlite', # used for numba
    'beautifulsoup4',
    'filterpy'
]


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
    'XML',
    'data.table',
    'brian',
    'rugarch',
    'quantmod',
    'swirl',
    'psych',
    'spatstat',
    'UsingR',
    'readr',
    'MCMCpack',
    'ROCR',
    'forecast',
    'numDeriv',
    'Matrix',
    'NORMT3',
    'ggmap',
    'np',
    'crs',
    'SemiParBIVProbit',
    'combinat',
    'maptree',
    'agricolae'
]

SAGE_OPTIONAL_PACKAGES = [
    'chomp',
    'database_cremona_ellcurve',
    'database_odlyzko_zeta',
    'database_pari',
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
    'kash3',
    'lie',
    'mcqd',
    'nauty',
    'normaliz',
    'nzmath',
    'ore_algebra',
    'p_group_cohomology',  # currently broken
    'phc',
    'pycryptoplus',
    'pyx',
    'qhull',
    'topcom',
    '4ti2',
    'modular_decomposition',
    'topcom',
    'csdp'    # experimental; non-GPL compatible, but that is OK as we are not distributing.  commercial use encouraged.
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
        #self.unextend_sys_path()
        self.patch_sage_location()
        self.patch_banner()
        self.patch_sage_env()
        self.user_site()
        self.install_sloane()
        self.install_projlib()
        self.install_pip()  # sage's is of course always hopelessly out of date
        self.install_pip_packages()
        self.install_jinja2() # since sage's is too old and pip packages doesn't upgrade
        self.install_R_packages()
        self.install_R_bioconductor()
        self.install_optional_packages()
        self.install_quantlib()
        self.install_basemap()
        self.install_pydelay()
        self.install_gdal()
        self.install_stein_watkins()
        self.install_jsanimation()
        self.install_sage_manifolds()
        self.install_r_jupyter_kernel()
        self.install_cv2()
        self.install_cairo()
        self.install_psage()

        self.clean_up()
        #self.extend_sys_path()
        self.fix_permissions()

        self.install_ipython_patch()  # must be done manually still

        # drepecated
        #self.install_enthought_packages()  # doesn't work anymore; they don't really want this.
        #self.install_4ti2()   # no longer needed since 4ti2 sage optional package finally works again...

        # FAILED:
        self.install_pymc()     # FAIL -- also "pip install pymc" fails.
        self.install_neuron()

    def install_sage_manifolds(self):
        # TODO: this will probably fail due to an interactive merge request (?)
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemanifolds/sage.git </dev/null && sage -br < /dev/null")

    def install_r_jupyter_kernel(self):
        # see https://github.com/IRkernel/IRkernel
        self.cmd(r"""echo 'install.packages("devtools", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("RCurl", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("base64enc", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("uuid", repos="http://ftp.osuosl.org/pub/cran/"); library(devtools); install_github("armstrtw/rzmq"); install_github("IRkernel/repr"); install_github("IRkernel/IRdisplay"); install_github("IRkernel/IRkernel");' | R --no-save""")

    def pull_smc_sage(self):
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemathinc/smc-sage")

    def install_jinja2(self):
        self.cmd("pip install -U jinja2")

    def install_ipython_patch(self):
        """
        TODO:
        """
        raise RuntimeError(r"""TODO: change 'local/lib/python/site-packages/notebook/notebookapp.py' to 'static_url_prefix = '/static/jupyter/''""")

    def install_jsanimation(self):
        self.cmd("cd /tmp && rm -rf JSAnimation && git clone https://github.com/jakevdp/JSAnimation.git && cd JSAnimation && python setup.py install && rm -rf /tmp/JSAnimation")

    def install_psage(self):
        self.cmd("cd /tmp/&& rm -rf psage && git clone git@github.com:williamstein/psage.git&& cd psage&& sage setup.py install && rm -rf /tmp/psage")

    def install_cv2(self):
        self.cmd("cd $SAGE_ROOT && cp -v /usr/local/lib/python2.7/dist-packages/*cv2* local/lib/python2.7/")

    def install_cairo(self):
        self.cmd("cd /tmp && rm -rf py2cairo && git clone git://git.cairographics.org/git/py2cairo && cd py2cairo && ./autogen.sh && ./configure --prefix=$SAGE_ROOT/local && make install")

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

    def user_site(self):
        import site
        if not site.ENABLE_USER_SITE:
            raise RuntimeError("Make sure to patch out this -- http://trac.sagemath.org/ticket/14243 -- by removing the stuff involving PYTHONNOUSERSITE from src/bin/sage-env")

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
        version_base = "4.9.2"  # TODO need to automate finding newest!
        version = version_base + ""  # find newest version at http://download.osgeo.org/proj/?C=M;O=D
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
        cmd("pip install --upgrade pip")

    def extend_sys_path(self):
        """
        Make this Sage install able to import modules installed in the system-wide
        Python, e.g., make it so there is some hope that maybe
        'import dolfin' works, even though dolfin is some
        complicated FEM library installed system-wide via Ubuntu packages
        This MUST be done *after* pip is installed.
        """
        raise RuntimeError("this is a VERY bad idea -- see https://groups.google.com/forum/#!topic/sage-release/MGkb_-y-moM")
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

        raise "I'm manually modifying sitecustomize.py to include ~/.local/python.... -- see previous install; don't understand why this is needed."

    def unextend_sys_path(self):
        raise RuntimeError("this is a VERY bad idea -- see https://groups.google.com/forum/#!topic/sage-release/MGkb_-y-moM")
        for f in ["local/lib/python/sitecustomize.py", "local/lib/python/sitecustomize.pyc"]:
            target = self.path(f)
            log.info(target)
            if os.path.exists(target):
                log.info("removing %s"%target)
                os.unlink(target)

    def install_pip_packages(self, upgrade=True):
        """Install each pip-installable package."""
        self.unextend_sys_path()

        os.environ['PROJ_DIR']=os.environ['NETCDF4_DIR']=os.environ['HDF5_DIR']='/usr/'
        os.environ['C_INCLUDE_PATH']='/usr/lib/openmpi/include'

        os.environ['HDF5_DIR']='/usr/lib/x86_64-linux-gnu/hdf5/serial/'  # needed for tables -- right path at least for ubuntu 15.04
        # for these, see https://github.com/Unidata/netcdf4-python/issues/341
        os.environ['USE_NCCONFIG']='0'
        os.environ['HDF5_LIBDIR']='/usr/lib/x86_64-linux-gnu/hdf5/serial'
        os.environ['HDF5_INCDIR']='/usr/include/hdf5/serial'
        os.environ['NETCDF4_DIR']='/usr'

        for package in SAGE_PIP_PACKAGES:
            log.info("** Installing/upgrading %s **"%package)
            # NOTE: the "--no-deps" is critical below; otherwise, pip will do things like install a version of numpy that is
            # much newer than the one in Sage, and incompatible (due to not having patches), which if it installs at all, will
            # break Sage (i.e. lots of doctests fail, etc.).
            e = ' '.join(["%s=%s"%x for x in SAGE_PIP_PACKAGES_ENV[package].items()]) if package in SAGE_PIP_PACKAGES_ENV else ''
            self.cmd("%s pip install %s --no-deps %s"%(e, '--upgrade' if upgrade else '', package))

        for package in SAGE_PIP_PACKAGES_DEPS:
            log.info("** Installing/upgrading %s **"%package)
            e = ' '.join(["%s=%s"%x for x in SAGE_PIP_PACKAGES_ENV[package].items()]) if package in SAGE_PIP_PACKAGES_ENV else ''
            self.cmd("%s pip install %s  %s"%(e, '--upgrade' if upgrade else '', package))


    def install_pymc(self):
        self.cmd("pip install git+https://github.com/pymc-devs/pymc")

    def install_R_packages(self):
        s = ','.join(['"%s"'%name for name in R_PACKAGES])
        c = 'install.packages(c(%s), repos="https://cran.fhcrc.org/")'%s
        self.cmd("echo '%s' | R --no-save"%c)

    def install_R_bioconductor(self):
        c = 'source("http://bioconductor.org/biocLite.R"); biocLite()'
        self.cmd("echo '%s' | R --no-save"%c)
        c = 'library(BiocInstaller); biocLite(c("geneplotter", "limma", "puma", "affy", "edgeR", "BitSeq", "hgu95av2cdf", "hgu133plus2cdf", "affyPLM", "ddCt", "hgu95av2.db", "affydata"))'
        self.cmd("echo '%s' | R --no-save"%c)

    def install_rstan(self):
        """
        Install the Rstan package into R.
        """
        c = 'install.packages(c("rstan"), repos="https://cran.fhcrc.org/", dependencies = TRUE)'
        self.cmd("echo '%s' | R --no-save"%c)

    def install_pystan(self):
        # follow directions here: https://github.com/stan-dev/pystan
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
            self.cmd("sage -p %s"%package)
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
        VERSION = "1.5"
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
        GDAL_VERSION       = '2.0.0'    # options here -- http://download.osgeo.org/gdal/CURRENT/
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


