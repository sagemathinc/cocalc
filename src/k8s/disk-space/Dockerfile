FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install Python3
RUN \
  apt-get update && apt-get install -y python3 ssh

COPY run.py /run.py

CMD /run.py

