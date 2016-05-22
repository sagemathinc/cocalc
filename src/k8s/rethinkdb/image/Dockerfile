FROM ubuntu:16.04

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install RethinkDB.
RUN \
  apt-get update && apt-get install -y curl && \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  curl https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb python3

COPY run.py /run.py

CMD /run.py

# Expose the client port and cluster port
EXPOSE 28015 29015
