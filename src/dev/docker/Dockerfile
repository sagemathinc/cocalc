FROM ubuntu:16.04

MAINTAINER William Stein <wstein@sagemath.com>

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Ubuntu software that are used by SMC (latex, pandoc, sage, jupyter)
RUN \
  apt-get update && \
  apt-get install -y software-properties-common  && \
  apt-add-repository -y ppa:aims/sagemath

RUN \
  apt-get update && \
  apt-get install -y texlive tmux screen pandoc aspell poppler-utils net-tools wget git python python-pip make g++ sudo psmisc sagemath-upstream-binary haproxy nginx vim bup inetutils-ping lynx telnet git emacs subversion ssh m4

# Jupyter from pip (since apt-get is ancient)
RUN \
  pip install ipython jupyter

# Install Node.js
RUN \
  wget -qO- https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs

# Install RethinkDB.
RUN \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  wget -qO- https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb python3 python3-requests python3-pip && \
  pip3 install rethinkdb

# Grab an initial version of the source code for SMC (do NOT use --depth=1,
# since we want to be able to checkout any commit later, and use git in
# container for dev).
RUN git clone https://github.com/sagemathinc/smc.git

# Do initial build of hub (this means installing all dependencies using npm)
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py all --compute --web && \
  rm -rf /root/.npm /root/.node-gyp/

COPY login.defs /etc/login.defs
COPY login /etc/defaults/login
COPY nginx.conf /etc/nginx/sites-available/default
COPY haproxy.conf /etc/haproxy/haproxy.cfg
COPY rethinkdb.conf /etc/rethinkdb/instances.d/default.conf

RUN echo "umask 077" >> /etc/bash.bashrc

# Remove packages needed for the build above, which we don't want to have
# available when running the hub in production (e.g., having a compiler could
# result in an exploit...). This doesn't save space, but may improve security.
#RUN \
#  SUDO_FORCE_REMOVE=yes apt-get remove -y wget git make g++ sudo && \
#  apt-get autoremove -y

COPY run.py /run.py
CMD ./run.py

EXPOSE 80 443

