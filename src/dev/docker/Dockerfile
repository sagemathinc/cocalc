FROM ubuntu:16.04

MAINTAINER William Stein <wstein@sagemath.com>

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Install the deps for building and running the hub.
RUN \
  apt-get update && \
  apt-get install -y wget git python make g++ sudo && \
  wget -qO- https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs

# Grab an initial version of the source code for SMC (do NOT use --depth=1, since we want to be able to checkout any commit later)
RUN git clone https://github.com/sagemathinc/smc.git

# Do initial build of hub (this means installing all dependencies using npm)
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub && \
  ./install.py all --compute && \
  ./install.py all --web && \
  rm -rf /root/.npm /root/.node-gyp/

# Install haproxy and nginx
RUN apt-get install -y haproxy nginx

COPY nginx.conf /etc/nginx/sites-available/default
COPY haproxy.conf /etc/haproxy/haproxy.cfg

# Install RethinkDB.
RUN \
  apt-get update && \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  wget -qO- https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb python3 python3-requests python3-pip && \
  pip3 install rethinkdb

COPY rethinkdb.conf /etc/rethinkdb/instances.d/default.conf

# Remove packages needed for the build above, which we don't want to have
# available when running the hub in production (e.g., having a compiler could
# result in an exploit...). This doesn't save space, but may improve security.
#RUN \
#  SUDO_FORCE_REMOVE=yes apt-get remove -y wget git make g++ sudo && \
#  apt-get autoremove -y

COPY run.py /run.py
CMD ./run.py

EXPOSE 80 443

# FOR debugging/dev
RUN apt-get install -y vim inetutils-ping lynx
