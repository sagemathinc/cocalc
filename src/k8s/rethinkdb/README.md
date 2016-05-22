# RethinkDB on Kubernetes

## Instructions to use

### Disks
Creating two GCE disks, which we will mount to provide persistent storage for two rethinkdb server nodes:

    gcloud compute disks create --size=10GB --zone=us-central1-c kubetest-rethinkdb-0 kubetest-rethinkdb-1

### Services

The cluster service is critical since it allows newly added rethinkdb nodes to find each other:

    kubectl create -f conf/cluster.yaml

The driver service makes it so other nodes in the cluster can connect to rethinkdb:

    kubectl create -f conf/driver.yaml

### Create the rethinkdb deployments

    ./control.py run 0
    sleep 30
    ./control.py run 1


## Development Notes

### References

This seems useful: https://github.com/rosskukulinski/kubernetes-rethinkdb-cluster



### Kubernetes (getting the yaml)

(Manual inspiration)

Build for GCE repo and upload there -- do this in the image directory:

    export VER=0.12; export PROJECT=sage-math-inc
    docker build -t gcr.io/$PROJECT/rethinkdb:$VER . && gcloud docker push gcr.io/$PROJECT/rethinkdb:$VER

Run on GCE as a deployment:

    kubectl run rethinkdb --image=gcr.io/$PROJECT/rethinkdb:$VER --port=80

Done

    kubectl delete deployment rethinkdb

## The rethinkdb-template.yaml file

We get the first version of the yaml file that describes the deployment we made above by doing

    kubectl get deployments rethinkdb -o yaml --export  > rethinkdb.yaml

We then *edit* this file in various ways, e.g., to add persistent disks, health checks, etc.  To test:

    kubectl replace -f rethinkdb.yaml

The service yaml:

    kubectl expose rethinkdb
    kubectl get services -o yaml --export  rethinkdb > service.yaml