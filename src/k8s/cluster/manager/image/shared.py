
def label_preemptible_nodes(cmd):
    reg_nodes = set([x.split()[0] for x in cmd("kubectl get nodes -l preemptible=false --no-headers").split('\n') if x])
    pre_nodes = set([x.split()[0] for x in cmd("kubectl get nodes -l preemptible=true  --no-headers").split('\n') if x])
    all_nodes = [x.split()[0] for x in cmd("kubectl get nodes --no-headers").split('\n') if x]
    todo = set([x for x in all_nodes if x not in reg_nodes and x not in pre_nodes])
    if len(todo) > 0:
        for x in cmd("gcloud compute instances list").split('\n'):
            if x:
                v = x.split()
                if v[0] in todo:
                    if v[3] == 'true':
                        preemptible = 'true'
                    else:
                        preemptible = 'false'
                    cmd('kubectl label node "{node}" preemptible={preemptible} --overwrite=true'.format(node=v[0], preemptible=preemptible))
