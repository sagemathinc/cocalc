# We use nginx to serve our static site
FROM nginx:1.10

MAINTAINER William Stein <wstein@sagemath.com>

# So we can source (http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Prerequistes for building static/ content that is served to the SMC webapp:

# Install Node.js and other prerequs for building the static content.
RUN \
  apt-get update && \
  apt-get install -y wget && \
  wget -qO- https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs git python python-yaml make && \
  npm install coffee-script -g

# Grab source code for some version of SMC (when web build this image)
RUN git clone https://github.com/sagemathinc/smc.git

# Build webapp
RUN cd /smc/src && . ./smc-env && ./install.py webapp build

