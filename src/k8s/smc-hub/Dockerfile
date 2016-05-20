FROM ubuntu:16.04

USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install Node.js
RUN \
  apt-get update && \
  apt-get install -y curl git vim python python3 python-pip python3-pip python-yaml python-psutil dpkg-dev sudo && \
  curl -sL https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs && \
  npm install coffee-script forever -g

# Grab source code for SMC
RUN git clone https://github.com/sagemathinc/smc.git

# Build hub (mainly involves installing dependencies)
WORKDIR /smc/src/
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub

# Create symlinks to the secrets files that kubernetes will create
RUN \
   mkdir -p /smc/src/data/secrets && \
   cd /smc/src/data/secrets && \
   ln -s /secrets/rethinkdb/rethinkdb . && \
   mkdir sendgrid && \
   cd sendgrid && \
   ln -s /secrets/sendgrid/api-key api_key

# Define default command.
#CMD ["/bin/bash"]

CMD ["/smc/src/smc-hub/scripts/hub", "--database_nodes", "rethinkdb-proxy", "--host=$HOSTNAME", "--port 5000", "--proxy_port 5001", "--foreground"]

# Expose main http endpoint on port 5000 and the hub proxy on port 5001.
EXPOSE 5000 5001
