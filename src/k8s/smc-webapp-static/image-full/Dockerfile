
# We use nginx to serve
FROM nginx

MAINTAINER William Stein <wstein@sagemath.com>

# So we can source (http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Configuration of NGINX
COPY default.conf /etc/nginx/conf.d/default.conf

# Prerequistes for building static/ content that is served to the SMC webapp:

# Install Node.js and other prerequs for building the static content.
RUN \
  apt-get update && \
  apt-get install -y curl && \
  curl -sL https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs git python python-yaml make && \
  npm install coffee-script -g

# Grab source code for SMC
RUN git clone --depth=1 https://github.com/sagemathinc/smc.git

#CMD bash

# Build webapp
RUN cd /smc/src && . ./smc-env && ./install.py webapp

# Delete everything except the static site that we want to serve (no point in wasting space)
RUN mv /smc/src/static /static && rm -rf /smc

# Remove build pre-requisites that are no longer needed for running nginx static server
RUN \
  apt-get -y remove curl git python python3 python-pip python3-pip python-yaml python-psutil sudo nodejs && \
  apt-get -y autoremove

CMD ["nginx", "-g", "daemon off;"]
