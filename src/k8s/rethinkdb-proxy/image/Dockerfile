FROM ubuntu:16.04

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install latest RethinkDB and Python3
RUN \
  apt-get update && apt-get install -y wget python3 python3-requests python3-pip && \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  wget -qO- https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb && \
  pip3 install rethinkdb && \
  apt-get remove -y wget python3-pip && \
  apt-get autoremove -y && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY run.py /run.py
COPY health.py /health.py

CMD /run.py

# Expose only the client port.
EXPOSE 28015
