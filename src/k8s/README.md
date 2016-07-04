# K8s deployment notes for SMC

## What to do if things have gone to hell

See the section below about how to setup a machine to have the kubectl command.  Most importantly, if things go totally to hell, one option is to create a new k8s cluster then delete the old one.


```
cd cluster

# if possible, you could now upgraded kubernetes by via
./control.py upgrade-kubernetes --version=???

# Create the cluster, which takes about 5 minutes.
time ./control.py create-cluster  --min-nodes=10 --max-nodes=10 main2

# Create the test and prod namespaces and deploy everything,
# which takes about 10 seconds.  This requires the ~/secrets
# directory to exist.
./create-smc.sh

```

Wait 3 minutes then type
```
kubectl get services haproxy --namespace=prod; kubectl get services haproxy --namespace=test
```
to find out the external IP to add to cloudflare.

To delete the old cluster:

```
# delete the cluster (5 min)
./control.py select-cluster NAME_OF_CLUSTER
./control.py delete-cluster
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

### Make your prompt nice

    [sage-math-inc_k8s-prod.prod] kubectl:~/smc/src/k8s> more ~/bin/k8s_prompt
    #!/usr/bin/env python2
    import json, os, sys

    x = json.loads(os.popen("kubectl config view -o json").read())
    for c in x['contexts']:
        if c['name'] == x['current-context']:
            print c['context']['cluster'] + "." + c['context']['namespace']
            sys.exit(0)
    print 'no-cluster'

and in ~/.bashrc:

    export PS1="[\$(k8s_prompt)] \[\033[01;32m\]\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]> "


