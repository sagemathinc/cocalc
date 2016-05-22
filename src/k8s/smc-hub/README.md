For testing locally

    docker build -t smc-hub . && docker run -P -it smc-hub

For building and pushing to private GCP repo:

    export VER=prod-0.2 && docker build -t gcr.io/sage-math-inc/hub:$VER . && gcloud docker push gcr.io/sage-math-inc/hub:$VER

We first did this to get a template for the yaml: `kubectl run hub --image=gcr.io/sage-math-inc/hub:$VER --port=5000`

But now do this:

    kubectl create -f hub.yaml

And expose the services:

    kubectl expose deployment hub

Scale it up:

    kubectl scale deployment hub --replicas=4

Delete it:

    kubectl delete deployment hub


Also the secrets used by the hub:

    kubectl create secret generic rethinkdb-password --from-file=rethinkdb
    kubectl create secret generic sendgrid-api-key --from-file=api-key
