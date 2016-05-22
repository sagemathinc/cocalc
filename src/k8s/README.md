
# K8s deployment notes for SMC

Write something here about how our k8s deployment works. Basically an overview of the subdirectories here.


## Troubleshooting misc

### dial tcp ...:10250: i/o timeout

For no reason, I started getting this sort of error:

    salvus@docker-build:~/s/src/k8s/smc-webapp-static$ kubectl logs smc-webapp-static-530420791-vzwlg
    Error from server: Get https://kubetest-minion-gjq5:10250/containerLogs/default/smc-webapp-static-530420791-vzwlg/smc-webapp-static: dial tcp 10.240.0.39:10250: i/o timeout

I used `kubectl logs -v=10 ...` then checked each step, trying from various VM's, and realized that this is a firewall problem.  Checking the firewall rules that I think `kube-up.sh` autamatically created showed that that `kubetest-master` couldn't connect to the minions!  So I changed the firewall source rule for `kubetest-minion-all` from `10.244.0.0/16` to `10.0.0.0/8`, at least for testing.    I don't understand why the master is no longer on 10.244, but for some reason my master is on `10.240` now.


