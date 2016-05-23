This directory contains shell scripts for creating, switching between, and destroying Kubernetes clusters.

**ASSUMPTION:** Kubernetes is installed in `~/kubernetes`, probably downloaded from https://github.com/kubernetes/kubernetes/releases/.  Also, of course, gcloud is setup so you can create/delete vm's, etc.

## Scripts

The following little shell scripts all assume they are run from this directory, e.g., `./test-kube-up.sh`.

- `./test-kube-up.sh`: starts up the testing k8s cluster kubetest
- `./prod-kube-up.sh`: starts up the production k8s cluster kubeprod
- `./select-context.sh [kubetest|kubeprod]`: select which cluster kubectl commands apply to.
- `./kube-down.sh [kubetest|kubeprod]`: completely deletes everything related to this cluster.


## Changing the size of a managed instance group manually

Here is how to use the gcloud command line to change the size of a managed instance group manually.  Of course, we'll ultimately use autoscaling.

    gcloud compute instance-groups managed resize kubetest-minion-group --size 3