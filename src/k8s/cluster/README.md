# Creation and deletion of Kubernetes cluster

## Prerequisite:

Make sure that kubernetes is installed in `~/kubernetes`, downloaded from https://github.com/kubernetes/kubernetes/releases/.  Also gcloud must be setup so you can create/delete instances, etc., from here.

## Creating a k8s cluster

Type `./control.py create -h` for help on creating a cluster.  You can see how much
your cluster will cost per month before creating it:

    ./control.py create test --min-nodes=2 --max-nodes=5 --cost

Now create it, which takes 5-10 minutes:

    ./control.py create test --min-nodes=2 --max-nodes=5

Once done, you can do

    ./control.py run-deployments

to build any not-build Docker images, then run them all.  This could take about 10 minutes, but may result in a fully working cluster that you can visit.  Use

    kubectrl services

to see the ip address of the haproxy server.

## Switching clusters

You can easily switch between multiple clusters, say `test` and `test2`:

    ./control.py select test2
    # kubectl commands are for test2
    ./control.py select test
    # kubectl commands are for test


## Adjusting autoscaling

You can do this in the GCE web interface easily, or do this

    ./control.py autoscale test --min-nodes=2 --max-nodes=5

You can also force the cluster to have a given size:

    ./control.py resize test --size=2

## Deleting the cluster

    ./control.py delete-cluster test

## TODO: Troubleshooting

If you get errors like this when trying to use/connect to pods, it's the firewall (this should not happen unless you manually mess something up):

    Error from server: dial tcp 10.240.0.39:10250: i/o timeout

# Actual clusters

(todo: automate once we understand/test this better)

For the main SMC sites webserver, I think this likely makes sense:

    ./control.py create --master-size n1-standard-2 --master-disk-size 20 --node-size n1-standard-2 --node-disk-size 60 --min-nodes 3 --max-nodes 30  prod

Then:

Create our L7 ingress load balancer:

    cd ..; cd haproxy; ./control.py run; ./control.py  autoscale --min=3 --max=5

Use external rethinkdb servers:

    cd ..; cd rethinkdb; ./control.py external db0 db1 db2 db3 db4 db5

Proxy them internally:

    cd ..; cd rethinkdb-proxy; ./control.py run; ./control.py autoscale --min=10 --max=40
    sleep 30

Start the hubs:

    cd ..; cd smc-hub; ./control.py run; ./control.py autoscale --min=3 --max=20

Start the static nginx servers:

    cd ..; cd smc-webapp-static; ./control.py run; ./control.py autoscale --min=3 --max=5




