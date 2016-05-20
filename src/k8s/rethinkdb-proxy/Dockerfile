FROM ubuntu:16.04

USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install RethinkDB.
RUN \
  apt-get update && apt-get install -y wget && \
  source /etc/lsb-release && \
  echo "deb http://download.rethinkdb.com/apt $DISTRIB_CODENAME main" > /etc/apt/sources.list.d/rethinkdb.list && \
  wget -qO- https://download.rethinkdb.com/apt/pubkey.gpg | apt-key add - && \
  apt-get update && apt-get install -y rethinkdb && \
  rm -rf /var/lib/apt/lists/* && \
  mkdir /home/rethinkdb; chown rethinkdb:rethinkdb /home/rethinkdb

# Run proxy server as user rethinkdb, not as user root
USER rethinkdb

# Run the proxy server
# NOTE: The database we join *must* have a password, or "--initial-password auto" will break.

CMD /usr/bin/rethinkdb proxy --join $JOIN --no-http-admin --initial-password auto --bind all --no-update-check --log-file /home/rethinkdb/rethinkdb.log

# Expose only the client port.
EXPOSE 28015
