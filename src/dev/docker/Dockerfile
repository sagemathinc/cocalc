FROM ubuntu:16.10

MAINTAINER William Stein <wstein@sagemath.com>

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Ubuntu software that are used by SMC (latex, pandoc, sage, jupyter)
RUN \
  apt-get update && \
  apt-get install -y software-properties-common texlive texlive-latex-extra tmux flex bison libreadline-dev screen pandoc aspell poppler-utils net-tools wget git python python-pip make g++ sudo psmisc haproxy nginx vim bup inetutils-ping lynx telnet git emacs subversion ssh m4 latexmk libpq5 libpq-dev build-essential gfortran automake dpkg-dev libssl-dev imagemagick

# Jupyter from pip (since apt-get jupyter is ancient)
RUN \
  pip install ipython jupyter

# Install Node.js
RUN \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

# Build and install Sage -- see https://github.com/sagemath/docker-images
COPY scripts/ /tmp/scripts
RUN chmod -R +x /tmp/scripts

RUN    adduser --quiet --shell /bin/bash --gecos "Sage user,101,," --disabled-password sage \
    && chown -R sage:sage /home/sage/

# make source checkout target, then run the install script
# see https://github.com/docker/docker/issues/9547 for the sync
RUN    mkdir -p /usr/local/ \
    && /tmp/scripts/install_sage.sh /usr/local/ master \
    && sync

RUN /tmp/scripts/post_install_sage.sh && rm -rf /tmp/* && sync

# Build and install PostgreSQL
RUN \
  cd /tmp && wget https://ftp.postgresql.org/pub/source/v9.6.1/postgresql-9.6.1.tar.bz2 && tar xf postgresql-9.6.1.tar.bz2 && cd postgresql-9.6.1 && ./configure --with-openssl --prefix=/usr/ && make -j16 install && cd /tmp && rm -rf /tmp/postgresql-9.6.1 /tmp/postgresql-9.6.1.tar.bz2

# Which commit to checkout and build.
ARG commit=HEAD

# Pull latest source code for SMC and checkout requested commit (or HEAD)
RUN \
  git clone https://github.com/sagemathinc/smc.git && \
  cd /smc && git pull && git fetch origin && git checkout ${commit:-HEAD}

# Build and install all deps
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py all --compute --web && \
  rm -rf /root/.npm /root/.node-gyp/

# Install code into Sage
RUN cd /smc/src && sage -pip install --upgrade smc_sagews/

# Install sage scripts system-wide
RUN echo "install_scripts('/usr/local/bin/')" | sage

# Install SageTex
RUN \
  sudo -H -E -u sage sage -p sagetex && \
  cp -rv /usr/local/sage/local/share/texmf/tex/latex/sagetex/ /usr/share/texmf/tex/latex/ && texhash

COPY login.defs /etc/login.defs
COPY login /etc/defaults/login
COPY nginx.conf /etc/nginx/sites-available/default
COPY haproxy.conf /etc/haproxy/haproxy.cfg
COPY run.py /root/run.py
COPY bashrc /root/.bashrc

RUN echo "umask 077" >> /etc/bash.bashrc

# Remove packages needed for the build above, which we don't want to have
# available when running the hub in production (e.g., having a compiler could
# result in an exploit...). This doesn't save space, but may improve security.
#RUN \
#  SUDO_FORCE_REMOVE=yes apt-get remove -y wget git make g++ sudo && \
#  apt-get autoremove -y

CMD /root/run.py

EXPOSE 80 443

