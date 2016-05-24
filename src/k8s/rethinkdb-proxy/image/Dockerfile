FROM ubuntu:16.04

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install latest RethinkDB and Python3
RUN \
  apt-get update && apt-get install -y wget python3 && \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  wget -qO- https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb && \
  mkdir /home/rethinkdb; chown rethinkdb:rethinkdb /home/rethinkdb && \
  apt-get remove -y wget && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY run.py /run.py

CMD /run.py

# Expose only the client port.
EXPOSE 28015
