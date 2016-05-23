#FROM gcr.io/google_containers/haproxy:0.3
FROM haproxy:1.6.5
MAINTAINER William Stein <wstein@sagemath.com>

RUN \
  apt-get update && \
  apt-get install -y curl socat

RUN mkdir -p /etc/haproxy/errors /var/state/haproxy

RUN \
  for ERROR_CODE in 400 403 404 408 500 502 503 504;do curl -sSL -o /etc/haproxy/errors/$ERROR_CODE.http \
	https://raw.githubusercontent.com/haproxy/haproxy-1.5/master/examples/errorfiles/$ERROR_CODE.http;done

RUN \
  /usr/bin/curl -L -o /sbin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 && \
  chmod +x /sbin/dumb-init

ADD smc-haproxy-template.cfg template.cfg

RUN touch /var/run/haproxy.pid

# Install golang and build the load balancer from the go sources we just copied in above (takes a minute or two):
RUN \
  apt-get install -y golang git && \
  git clone --depth=1 https://github.com/kubernetes/contrib.git kubernetes-contrib && \
  cd /kubernetes-contrib/service-loadbalancer/ && \
  mv Godeps / && \
  cp haproxy.cfg /etc/haproxy/haproxy.cfg && \
  cp *.go *.json haproxy_reload / && cd / && \
  export GOPATH=/.go && \
  go get github.com/tools/godep && \
  export PATH=$GOPATH/bin:$PATH && \
  CGO_ENABLED=0 GOOS=linux godep go build -a -installsuffix cgo -ldflags '-w' \
  -o service_loadbalancer ./service_loadbalancer.go ./loadbalancer_log.go && \
  apt-get remove -y golang git && \
  apt-get autoremove -y && \
  rm -rf /kubernetes-contrib

#DEBUG: this is purely to make dev easy -- comment out except when dev/debugging
#RUN apt-get update && apt-get install -y vim
#CMD bash

ENTRYPOINT ["/sbin/dumb-init", "/service_loadbalancer"]

