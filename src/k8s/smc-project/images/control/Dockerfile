FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN apt-get update && apt-get install -y iptables  python

COPY run.py /run.py
CMD ["/usr/bin/python", "/run.py"]
