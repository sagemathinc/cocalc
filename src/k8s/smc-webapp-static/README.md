# smc-webapp-static

smc-webapp-static uses nginx to serve static HTML/Javascript/etc. content to browser clients.

## How to use control.py

### 1. Build an image

To build `../../src/static` on this computer and package up what is there in an nginx container, and upload it to the gcloud docker repo for your project:

    ./control.py build -r -t your_tag

If you change `../../src/static` in any way, you can package and upload it again without rebuilding:

    ./control.py build -t your_second_tag

### 2. Deploy on your current kubernetes cluster

Start a kubernetes deployment (with health checks and everything):

    ./control.py run -t your_tag

To switch to a different tagged build (made above) -- this will switch the cluster over live:

    ./control.py run -t your_secong_tag

To scale up to 5 replicas:

    ./control.py run -t your_secong_tag -r 5

To stop the Kubernetes Deployment

    ./control.py stop

## What is here

- `./control.py` command line Python script for doing everything cleanly

- `image-host` - Docker-related files for host-based build

- `image-full` - Docker-related files for self-contained full  build

- `conf/default.conf` - nginx configuration

- `conf/smc-webapp-static.template.yaml` - k8s template script to create the deployment

## Old stuff -- todo

Make smc-webapp-static visible inside the cluster, so our internal haproxy will pick it up:

    kubectl expose deployment smc-webapp-static --port=80 --target-port=80

**or** for testing, make it visible externally

    kubectl expose deployment smc-webapp-static --port=80 --target-port=80 --type="LoadBalancer"

Then if making externally visible, in about 2 minutes, the ip will appear in the output here:

    kubectl get services


Visiting http://the-ip  should show the static SMC website, but of course without any websocket connection.

