FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install standard packages included with Ubuntu,
# which are good for buildig Sage and SMC core functionality.
RUN \
  apt-get update && apt-get install -y \
  bup etckeeper htop fio monit python-pip dstat iotop \
  python-apt python-pip python-dateutil python-tz python-configparser python-scipy python-paramiko \
  python3-pip python3-scipy python3-paramiko \
  sysbench sysstat calibre  \
  dpkg-dev g++ gfortran git iperf \
  libacl1-dev libattr1-dev libbz2-dev libevent-dev libfuse-dev liblzo2-dev libncurses5-dev \
  libreadline-dev libsqlite3-dev libssl-dev lsof m4 make ntp pandoc par2 pkg-config poppler-utils \
  python-lxml python-psutil python-pylibacl python-pyxattr python-simplegeneric python3-psutil \
  software-properties-common tk-dev vim wget xfsprogs zlib1g-dev asymptote pdf2svg phantomjs \
  build-essential

# Install additional package in standard ubuntu that are mainly for user software and requests
# (not for building sage itself).

RUN \
  apt-get install -y \
  asciidoc aspell-* attr auctex autoconf axiom bindfs bison bowtie2 bowtie2-examples bsdtar \
  bzr camlp4-extra ccache cgmanager cgmanager-utils cgroup-bin cgroup-lite \
  check checkinstall clang clojure1.6 cmake csh cvs cython dieharder dot2tex \
  doxygen dstat emacs emacs-goodies-el encfs epstool ffmpeg ffmpeg fig2ps fish \
  flex fonts-ocr-a gawk gcc-multilib gcc-multilib gdb \
  ghc ghc-doc ghc-haddock ghc-mod ghc-prof git-svn glpk-utils glpk-doc \
  gmsh gnugo golang-go gpicview grace gv h5utils \
  haskell-doc haskell-mode haskell-platform haskell-platform-doc haskell-platform-prof hdf5-helpers \
  hexcurse htop iceweasel ifrench imagemagick ingerman inkscape iotop ipython3 irssi \
  ispanish jags jags jekyll joe lbzip2 \
  libapr1-dev libav-tools libavcodec-dev libavcodec-extra libavcodec-extra libavformat-dev \
  libboost-all-dev libboost-python-dev libboost-signals-dev libbz2-dev libc6-i386 libcairomm-1.0-dev \
  libcap2-bin libcgal-dev libcgal-dev libcurl4-openssl-dev libdc1394-22-dev libedit-dev libevent-dev \
  libf2c2-dev libgdbm-dev libgeos++-dev libgeos-dev libglpk-dev libglpk36 libgmp3-dev libgraphviz-dev \
  libgsl0-dev libgstreamer-plugins-base0.10-dev libgstreamer0.10-dev libgtk2.0-dev libgtk2.0-dev \
  libhdf5-dev libicu-dev libjasper-dev libjemalloc-dev libjemalloc-dev libjemalloc-dev libjpeg-dev \
  liblz4-tool libmed1v5 libmp3lame-dev libncurses5-dev libnetcdf-dev libopencore-amrnb-dev \
  libopencore-amrwb-dev libpam-cgroup libpango1.0-dev libpangox-1.0-dev libpari-dbg libpari-dev \
  libpng++-dev libprotobuf-dev libqt4-dev libroot-bindings-python-dev libroot-graf2d-postscript5.34 \
  libswscale-dev libtbb-dev libtheora-dev libtool libv4l-dev libvorbis-dev libwebp-dev libxine2-dev \
  libxml2-dev libxslt-dev libxvidcore-dev libzmq-dev \
  linux-tools-common linux-tools-generic llvm lrzip lua5.2 lua5.2-* lynx-cur lzip m4\
  markdown maven mc meld mercurial mesa-utils mit-scheme mit-scheme-dbg mit-scheme-doc \
  ml-lex ml-yacc mlton mono-devel mono-tools-devel mosh mysql-client ncbi-blast+\
  ncompress netcdf-bin netcdf-doc noweb\
  ocaml ocaml-batteries-included ocaml-mode ocaml-native-compilers octave octave-symbolic \
  opam opam-docs opam-docs p7zip-full parallel pari-galpol pari-gp2c pdftk php5 \
  pkg-config plink plink poppler-utils postgresql-client proofgeneral proofgeneral-doc\
  protobuf-compiler protobuf-compiler pv python-autopep8 python-dev python-docutils \
  python-fuse python-glpk python-h5py python-mode python-numpy python-pandas python-pip \
  python-scikits-learn python-scikits.statsmodels python-scipy python-skimage python-skimage-doc \
  python-skimage-lib python-sklearn python-sklearn-doc python-sklearn-lib python-software-properties \
  python-tables python-virtualenv python3 python3-setuptools python3-zmq quota quotatool \
  r-cran-cairodevice r-cran-rgl r-recommended racket rcs root-system-bin ruby-dev samtools \
  sbcl scilab scons sloccount smem smlnj software-properties-common sparkleshare spell sshfs \
  subversion subversion-tools sysstat texlive-lang-all texlive-full tig tinc tmpreaper tmux \
  tree tuareg-mode unison-all unrar-free unzip uuid-dev v4l-utils valgrind vim vim-latexsuite \
  wget whois wordnet x11-apps x11-apps x11vnc x264 xorg-dev xpra xvfb yacas yasm yatex zsh
