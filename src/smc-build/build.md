# Install critical packages needed for building SMC source code:

    apt-get update && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev linux-image-extra-virtual


# Ubuntu add and resource-wasting-on-every-ssh crap:

put `exit 0` at the beginning of `/etc/update-motd.d/50-landscape-sysinfo`


# Compute VM's

```
apt-get update && apt-get upgrade && apt-get install vim git wget iperf dpkg-dev make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev git zlib1g-dev openjdk-7-jdk libbz2-dev libfuse-dev pkg-config libattr1-dev libacl1-dev par2 ntp pandoc ssh python-lxml  calibre  python-pyxattr python-pylibacl software-properties-common  libevent-dev xfsprogs lsof  tk-dev python-psutil python3-psutil python-simplegeneric
```

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

# Freezing SSH host keys

When a machine instance changes its id, or IP, or whatever, the
`cloud-init` tools cause a rebuild of the ssh host keys. HSY tried
two things to fix this, where especially the second one seems to work.

1. prevent the google gce tools to rebuild them (although, that alone wasn't sufficient)
  https://github.com/sagemathinc/smc/issues/356
  During startup, at a later stage cloud-init is called:

2. hard-code the ssh host keys in the configuration of cloud-init:

    $SMC/src/scripts/ssh_host_keys_freeze.py

**regrading newly cloned machines**

It seems to be a good security practice to have distinct host keys for each machine.
So, next time we clone a compute node we have to delete this
cloud.cfg.d/99-smc file in /etc/cloud and the keys.
Then, on next boot, the host keys should be generated fresh and
running freeze copies them back.
Maybe a simple `service cloud-init restart` is also sufficient to
cause them to be rebuilt.


# Additional packages (mainly for users, not building).

    apt-get install  libmed1 libhdf5-mpich2-dev gmsh dstat emacs vim poppler-utils texlive texlive-* gv imagemagick octave mercurial flex bison unzip libzmq-dev uuid-dev scilab axiom yacas octave-symbolic quota quotatool dot2tex python-numpy python-scipy python-pandas python-tables libglpk-dev python-h5py zsh python3 python3-zmq python3-setuptools cython htop ccache python-virtualenv clang libgeos-dev libgeos++-dev sloccount racket libxml2-dev libxslt-dev irssi libevent-dev tmux sysstat sbcl gawk noweb libgmp3-dev ghc  ghc-doc ghc-haddock ghc-mod ghc-prof haskell-mode haskell-doc subversion cvs bzr rcs subversion-tools git-svn markdown lua5.2 lua5.2-*  encfs auctex vim-latexsuite yatex spell cmake libpango1.0-dev xorg-dev gdb valgrind doxygen haskell-platform haskell-platform-doc haskell-platform-prof  mono-devel mono-tools-devel ocaml ocaml-native-compilers camlp4-extra proofgeneral proofgeneral-doc tuareg-mode ocaml-mode libgdbm-dev mlton sshfs sparkleshare fig2ps epstool libav-tools python-software-properties software-properties-common h5utils libnetcdf-dev netcdf-doc netcdf-bin tig libtool iotop asciidoc autoconf bsdtar attr  libicu-dev iceweasel xvfb tree bindfs liblz4-tool tinc python-scikits-learn python-scikits.statsmodels python-skimage python-skimage-doc  python-skimage-lib python-sklearn  python-sklearn-doc  python-sklearn-lib python-fuse cgroup-lite cgmanager-utils cgroup-bin libpam-cgroup cgmanager cgmanager-utils cgroup-lite  cgroup-bin  r-recommended    libpng++-dev libcairomm-1.0-dev r-cran-cairodevice x11-apps  mesa-utils libpangox-1.0-dev    libf2c2-dev gnugo libapr1-dev libcap2-bin  lbzip2 mosh smem libcurl4-openssl-dev jekyll lynx-cur root-system-bin libroot-bindings-python-dev libroot-graf2d-postscript5.34  csh x11vnc x11-apps meld aspell-* inkscape  build-essential checkinstall cmake pkg-config yasm libjpeg-dev libjasper-dev libavcodec-dev libavformat-dev libswscale-dev libdc1394-22-dev libxine2-dev libgstreamer0.10-dev libgstreamer-plugins-base0.10-dev libv4l-dev python-dev python-numpy libtbb-dev libqt4-dev libgtk2.0-dev  libmp3lame-dev libopencore-amrnb-dev libopencore-amrwb-dev libtheora-dev libvorbis-dev libxvidcore-dev x264 v4l-utils r-cran-rgl libgtk2.0-dev php5 python-docutils pdftk smlnj  ml-lex ml-yacc p7zip-full check  unison-all fonts-ocr-a libwebp-dev libpari-dev libpari-dbg pari-gp2c pari-galpol lzip ncompress ipython3 gpicview python-pip libedit-dev lrzip libgsl0-dev btrfs-tools tmpreaper hdf5-helpers libhdf5-cpp-8 libhdf5-dev scons wordnet pv golang-go libgraphviz-dev protobuf-compiler  libcurl4-openssl-dev  libboost-all-dev  libjemalloc-dev xpra emacs-goodies-el python-mode dieharder jags unrar-free joe mc llvm ncbi-blast+ libavcodec-extra ffmpeg ocaml-batteries-included opam opam-docs libboost-python-dev libboost-signals-dev libcgal-dev gcc-multilib libc6-i386 plink grace linux-tools-generic linux-tools-common bowtie2 bowtie2-examples samtools ifrench ispanish ingerman protobuf-compiler libprotobuf-dev libcurl4-openssl-dev libboost-all-dev libncurses5-dev libjemalloc-dev wget m4 libjemalloc-dev xpra emacs-goodies-el python-mode dieharder jags unrar-free joe mc llvm ncbi-blast+ libavcodec-extra ffmpeg ocaml-batteries-included opam opam-docs libboost-python-dev libboost-signals-dev libcgal-dev gcc-multilib libc6-i386 plink grace linux-tools-generic linux-tools-common bowtie2 bowtie2-examples samtools maven parallel fish whois mysql-client ruby-dev python-autopep8 mit-scheme mit-scheme-dbg mit-scheme-doc


# tmpreaper

Remove the security warning line in `/etc/tmpreaper.conf` so it actually runs.


# Python3-related packages of interest

    apt-get install python3-pip libzmq3-dev python3-pandas  python3-matplotlib python3-numpy python3-xlrd python3-nose bpython3 diveintopython3 libpython3-dev python3-dev python3-aeidon python3-alabaster python3-anyjson python3-astropy python3-audioread python3-args python3-babel python3-bottle python3-bs4 python3-bsddb3 python3-celery python3-changelog python3-cherrypy3 python3-crypto python3-cryptography python3-csb python3-cssutils python3-dateutil python3-decorator python3-defer python3-distutils-extra python3-django python3-django-xmlrpc python3-django-tables2 python3-django-model-utils python3-django-jsonfield python3-django-filters python3-dns python3-dnsq python3-doc python3-docutils python3-ecdsa python3-empy python3-examples python3-expiringdict python3-extras python3-feedparser python3-fftw3 python3-flake8 python3-flask python3-flask-sqlalchemy python3-flask-script python3-flask-principal python3-fysom python3-gdal python3-genshi python3-geoip python3-gmpy2 python3-gnupg python3-greenlet python3-gsw python3-h5py python3-httplib2 python3-icalendar python3-idna python3-ipy python3-jinja2 python3-jsmin python3-lesscpy python3-levenshtein python3-linop python3-mako python3-mia python3-misaka python3-mockito python3-mock python3-mpi4py python3-mpmath python3-msgpack python3-nose2 python3-nose2-cov python3-nine python3-numexpr python3-numpy python3-oauth python3-openssl python3-pandas python3-paramiko python3-pandocfilters python3-patsy python3-pep8 python3-persistent python3-pexpect python3-pil python3-pyasn1 python3-progressbar python3-potr python3-ply python3-pkginfo python3-pygraph python3-pygments python3-pyscss python3-pyramid python3-pyro4 python3-rdflib python3-releases python3-rsa python3-scipy python3-shortuuid python3-simplejson python3-skimage python3-six python3-sphinx python3-sphere python3-sqlalchemy python3-tables python3-testtools python3-urllib3 python3-venv python3-virtualenv python3-werkzeug python3-xlrd python3-xlsxwriter python3-yaml python3-zmq


# IPython with notebook and octave kernel

    umask 022 && sudo apt-get remove ipython && sudo pip install --upgrade ipython notebook octave_kernel && cd /usr/local/lib/python2.7/dist-packages && sudo chmod a+r -R .; sudo find . -perm /u+x -execdir chmod a+x {} \;

# Special script to run python2 systemwide from within Sage:

```
salvus@compute7-us:/usr/local/share/jupyter/kernels$ more /usr/local/bin/python2-ubuntu
#!/bin/sh

unset PYTHONPATH
unset PYTHONHOME
unset PYTHON_EGG_CACHE
unset SAGE_ROOT
unset LD_LIBRARY_PATH
/usr/bin/python2 "$@"
```

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

# OpenCV Computer Vision

    # Python Test: "import cv2"

    cd /tmp && rm -rf opencv && mkdir opencv && cd opencv && git clone https://github.com/Itseez/opencv_contrib.git && rm -rf opencv_contrib/modules/hdf && git clone https://github.com/Itseez/opencv.git && cd opencv && mkdir build && cd build && time cmake -D WITH_FFMPEG=OFF -D CMAKE_BUILD_TYPE=RELEASE -D CMAKE_INSTALL_PREFIX=/usr/local -D WITH_TBB=ON -D BUILD_NEW_PYTHON_SUPPORT=ON -D WITH_V4L=ON -D INSTALL_C_EXAMPLES=ON -D INSTALL_PYTHON_EXAMPLES=ON -D BUILD_EXAMPLES=ON -D WITH_QT=ON -D WITH_OPENGL=ON -D OPENCV_EXTRA_MODULES_PATH=/tmp/opencv/opencv_contrib/modules .. && time make -j4 && sudo make install && sudo sh -c 'echo "/usr/local/lib" > /etc/ld.so.conf.d/opencv.conf' && sudo ldconfig && cd /tmp && rm -rf opencv



# KWANT

    apt-add-repository ppa:kwant-project/ppa && apt-get update && apt-get install python-kwant python-kwant-doc python3-kwant


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

    sudo pip3 install --upgrade ipython  ipywidgets mygene seaborn biopython
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

  ## From http://www.polymake.org/doku.php/howto/install
  ## Get latest from http://www.polymake.org/doku.php/download/start and build:

* polymake 3:

    sudo apt-get install ant ant-optional default-jdk g++ libboost-dev libgmp-dev libgmpxx4ldbl libmpfr-dev libperl-dev libsvn-perl libterm-readline-gnu-perl libxml-libxml-perl libxml-libxslt-perl libxml-perl libxml-writer-perl libxml2-dev w3c-dtd-xhtml xsltproc
    cd ~/tmp/
    wget http://polymake.org/lib/exe/fetch.php/download/polymake-3.0r1.tar.bz2
    tar xf polymake-3.0r1.tar.bz2
    cd polymake-3.0/
    ./configure
    nice make -j4

Then files were installed into `/usr/local` and pushing that out for everyone.

# Make ROOT data analysis ipython notebook support system-wide work.

    cd /usr/lib/x86_64-linux-gnu/root5.34 && wget https://gist.githubusercontent.com/mazurov/6194738/raw/67e851fdac969e670a11296642478f1801324b8d/rootnotes.py && chmod a+r * && echo "import sys; sys.path.extend(['/usr/lib/python2.7/dist-packages/', '/usr/lib/pymodules/python2.7', '/usr/lib/x86_64-linux-gnu/root5.34/', '/usr/local/lib/python2.7/dist-packages'])"$'\n' >  /usr/local/sage/current/local/lib/python/sitecustomize.py


# Install 4ti2 system-wide...

    export V=1.6.2 && cd /tmp && rm -rf 4ti2 && mkdir 4ti2 && cd 4ti2 && wget http://www.4ti2.de/version_$V/4ti2-$V.tar.gz && tar xf 4ti2-$V.tar.gz && cd 4ti2-$V && ./configure --prefix=/usr/local/ && time make -j8
    make install  &&  rm -rf /tmp/4ti2    # this *must* be a separate step!! :-(



# Add to /etc/security/limits.conf

Add these two lines two `/etc/security/limits.conf` so that bup works with large number of commits.

```
echo $'\n'"root     soft    nofile          20000"$'\n' >> /etc/security/limits.conf
echo "root     hard    nofile          20000"$'\n' >> /etc/security/limits.conf
```

# These to avoid fork-bombs:


   echo "* soft nproc 1000"$'\n' >> /etc/security/limits.conf
   echo "* hard nproc 1100"$'\n' >> /etc/security/limits.conf
   echo "root soft nproc 20000"$'\n' >> /etc/security/limits.conf
   echo "root hard nproc 20000"$'\n' >> /etc/security/limits.conf


# Create net test user

Create a user nettest with a random password.  Put in ssh keys so that can login
from any admin/monitor machine to this account.

# Salvus (needs more!)

    cd /home/salvus
    Install smc library from git...

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
    pip3 install --upgrade twitter sympy uncertainties zope.interface scikit-learn datasift
    pip3 install --upgrade numba holoviews

# The netcd4 system-wide python package requires some crazy environment variables to work:

    export PROJ_DIR=/usr; export NETCDF4_DIR=/usr; export HDF5_DIR=/usr/lib/x86_64-linux-gnu/hdf5/serial/; export HDF5_DIR=/usr/; export C_INCLUDE_PATH=/usr/lib/openmpi/include; export USE_NCCONFIG=0;  export HDF5_INCDIR=/usr/include/hdf5/serial; export HDF5_LIBDIR=/usr/lib/x86_64-linux-gnu/hdf5/serial; export HDF5_INCDIR=/usr/include/hdf5/serial
    pip3 install --upgrade netcdf4

# And for normal python2:

    sudo su
    umask 022
    pip install datasift bokeh twitter ctop macs2

# System-wide git trac

    cd /tmp && git clone https://github.com/sagemath/git-trac-command.git && cd git-trac-command && sudo setup.py install && rm -rf /tmp/git-trac-command

# Anaconda Python 3 distribution

[anaconda.md](anaconda.md)

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
