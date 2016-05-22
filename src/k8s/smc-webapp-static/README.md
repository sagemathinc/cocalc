# smc-webapp-static

## Purpose

smc-webapp-static uses nginx to serve static HTML/Javascript/etc. content to browser clients.

## Build docker image for local testing

This builds, but using cache of anything built so far, so good for development:

    docker build -t smc-webapp-static .

To build from scratch without any caching

    time docker build --no-cache -t smc-webapp-static .

## Kubernetes

The manual steps are roughly as follows, but we will fully automate this.

Build for GCE repo and upload there:

    export VER=0.1
    export PROJECT=sage-math-inc

    docker build -t gcr.io/$PROJECT/smc-webapp-static:$VER . && gcloud docker push gcr.io/$PROJECT/smc-webapp-static:$VER

Run on GCE as a deployment

    kubectl run smc-webapp-static --image=gcr.io/$PROJECT/smc-webapp-static:$VER --port=80

And scale it up:

    kubectl scale deployment smc-webapp-static --replicas=3

Make smc-webapp-static visible inside the cluster, so our internal haproxy will pick it up:

    kubectl expose deployment smc-webapp-static --port=80 --target-port=80

**or** for testing, make it visible externally

    kubectl expose deployment smc-webapp-static --port=80 --target-port=80 --type="LoadBalancer"

Then if making externally visible, in about 2 minutes, the ip will appear in the output here:

    kubectl get services


Visiting http://the-ip  should show the static SMC website, but of course without any websocket connection.

Done

    kubectl delete deployment smc-webapp-static
    kubectl delete services smc-webapp-static

## The smc-webapp-static.yaml file

We get the first version of the yaml file that describes the deployment we made above by doing

    kubectl get deployments smc-webapp-static -o yaml --export  > smc-webapp-static.yaml

We then *edit* this file in various ways, e.g,. to add health checks.
