# Supported modes to run CoCalc

- **SingleUser:** All projects run as a single user (who does NOT have to be root)

  - This is used for developing cocalc itself from within a cocalc project.
  - All projects run as the SAME Linux user. Obviously there is no enforced isolation between projects.

- **MultiUser**: Creates and deletes users on a single Linux server

  - This is used mainly for cocalc-docker, but there's nothing Docker-specific about it.
  - Each project runs as a different Linux user.

- **KuCalc**: on a Kubernetes cluster

  - This is used for https://cocalc.com, and relies on some other services that react to changes in the database to scheduled projects. (The services are not currently open source.)
  - Each project runs as a different pod (collection of Docker containers) in a Kubernetes cluster.

- **Kubernetes**: on a Kubernetes cluster where the hub itself can run kubectl and create pods.
  - This is used for cocalc-kubernetes, and relies on:
    - the kubectl command being installed,
    - the pod running the hub having full permissions to delete and create pods on the cluster
    - the existence of an NFS export for the home directory of projects.
