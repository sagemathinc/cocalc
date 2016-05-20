
# We use nginx to serve
FROM nginx

MAINTAINER William Stein <wstein@sagemath.com>

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Configuration of NGINX
COPY default.conf /etc/nginx/conf.d/default.conf

# Prerequistes for building static/ content that is served to the SMC webapp:

# Install Node.js and other prerequs for building the static content.
RUN \
  apt-get update && \
  apt-get install -y curl git python python3 python-pip python3-pip python-yaml python-psutil sudo && \
  curl -sL https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs && \
  npm install coffee-script forever -g

# Grab source code for SMC
RUN git clone https://github.com/sagemathinc/smc.git

# Build webapp
RUN cd /smc/src && . ./smc-env && ./install.py webapp

#CMD ["bash"]

# TODO: remove build pre-requisites that are no longer needed for running nginx.

CMD ["nginx", "-g", "daemon off;"]

