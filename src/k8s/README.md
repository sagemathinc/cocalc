# K8s deployment notes for SMC

## What to do if things have gone to hell

See the section below about how to setup a machine to have the kubectl command.  Most importantly, if things go totally to hell, one option is to delete the entire k8s cluster and recreate it from scratch, which takes about 15 minutes.

```
alias c=./control.py
alias k=kubectl

# delete the cluster (5 min)
cd cluster
c delete-cluster

# if possible, you could now upgraded kubernetes by changing what tarball is in ~/kubernetes

# create the cluster (5 min)
c create-cluster --node-disk-size=60 --min-nodes=1 --max-nodes=1 --non-preemptible
```

Immediately, once the cluster is running, add more nodes via the web UI or `c resize --size` or `c autoscale...`.   We recently hit  race condition in which during the initial cluster creation multiple nodes had the same Routes assigned (so `sudo ifconfig cbr0|grep inet` was repeated on multiple nodes).  This led to disaster.

Next, configure the cluster and start everything running.
Here's how to setup the test namespace; doing the prod one is
similar -- just allocate more resources (via -r):

```
# create the namespace
cd ~/smc/src/k8s/
c cluster namespace test

# start haproxy
cd haproxy/
c load-ssl ~/secrets/haproxy/
c run -r 1

# setup rethinkdb to point to outside db cluster and know password
cd ../rethinkdb
c external db0 db1 db2 db3 db4 db5
c load-password ~/secrets/rethinkdb/

# load passwords into hub and start
cd ../smc-hub/
c load-sendgrid ~/secrets/sendgrid/
c load-zendesk ~/secrets/zendesk/
c run -r 1

# start static nginx server
cd ../smc-webapp-static/
c run -r 1

# look at our ip and add it to cloudflare DNS
k get services

# datadog
cd ../datadog/
c run
```




## Setting up a machine for managing k8s

- **Create a VM:**  I recommend a pre-emptible VM, since nothing bad happens if this thing is rebooted during production.  Specs: n1-standard-2 (due to building software on it), with **100GB standard PD**.  You do want a lot of disk space in order to cache all the docker build images.  I assume Ubuntu 16.04 for the OS.  When creating the machine, enable "Allow full access to all Cloud APIs".

- Ensure (or generate) ssh key and add to https://console.cloud.google.com/compute/metadata/sshKeys?project=sage-math-inc so can ssh to other nodes from this machine
- Git repo:
	it clone git@github.com:sagemathinc/smc.git
- Get kubernetes (check for latest version!):
	get https://storage.googleapis.com/kubernetes-release/release/v1.3.0-alpha.4/kubernetes.tar.gz \
      && tar xf kubernetes.tar.gz \
      && rm kubernetes.tar.gz \
      && mv kubernetes kubernetes-1.3.0-alpha.4 \
      && ln -s kubernetes-1.3.0-alpha.4 kubernetes
- Paths:
      echo 'export PATH=$HOME/kubernetes/platforms/linux/amd64:$PATH' >> ~/.bashrc \
      && echo 'source $HOME/kubernetes/contrib/completions/bash/kubectl' >> ~/.bashrc \
      && source ~/.bashrc
- Software:
	  sudo apt-get remove -y google-cloud-sdk \
      && sudo apt-get -y install python-pip ipython3 python3-requests docker.io \
      && sudo apt-get -y autoremove
- Add your user (say `salvus`) to the docker group:
	  sudo usermod -G docker `whoami`
      newgrp docker
      sudo service docker restart
- Install gcloud (see https://cloud.google.com/sdk/downloads#interactive)
	  curl https://sdk.cloud.google.com | bash
      exec -l $SHELL
      gcloud init
- Optional (for dev): to sshfs mount your control machine's file from an SMC project, do this.  WARNING: this mounts over any existing `smc` directory!  It will automatically remount when the machine pre-empts and reboots.
	  cd; mkdir -p smc; sshfs -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3,nonempty salvus@kubectl:smc smc
If you then do this you'll be able to use the `smc-open` command from the kubectl machine to open files in your own project:
	  cd ~/smc/src && ./install.py pyutil

- Make your prompt show the current cluster namespace and not waste space on the user (put this in ~/.bashrc):

    export PS1="[\$(kubectl config view |grep namespace:|cut  -c 16-)]\[\033[01;32m\] \h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]> "

