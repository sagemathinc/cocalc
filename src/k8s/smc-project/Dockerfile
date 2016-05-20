FROM ubuntu:16.04

USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install Node.js
RUN \
  apt-get update && \
  apt-get install -y curl git vim python python-pip python-psutil dpkg-dev sudo  && \
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
  ./install.py pyutil && \
  ./install.py project

COPY run.py /run.py

# run.py will create the user corresponding to the project, mount their directory (?), then
# switch to that user and start the local hub.  The environment variable SMC_PROJECT_ID must be set.

CMD ["/usr/bin/python", "/run.py"]

# Expose local hub port, etc....
EXPOSE 6000
