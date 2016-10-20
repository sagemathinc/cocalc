FROM ubuntu:16.04
MAINTAINER William Stein <wstein@sagemath.com>
USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Install the deps for building and running the hub.
RUN \
  apt-get update && \
  apt-get install -y wget git python make g++ sudo && \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

# Grab an initial version of the source code for SMC (do NOT use --depth=1, since we want to be able to checkout any commit later)
RUN git clone https://github.com/sagemathinc/smc.git

# Do initial build of hub (this means installing all dependencies using npm)
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub && \
  rm -rf /root/.npm /root/.node-gyp/

# Create symlinks to the secrets files that kubernetes will create
RUN \
   mkdir -p /smc/src/data/secrets && \
   cd /smc/src/data/secrets && \
   ln -s /secrets/rethinkdb/rethinkdb . && \
   ln -s /secrets/zendesk/zendesk . && \
   ln -s /secrets/sendgrid/sendgrid .
