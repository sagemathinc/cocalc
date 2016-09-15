#!/usr/bin/env bash
# uses gcloud computes ssh key to connect to admin0

admin0ip=`gcloud --format="value(networkInterfaces[0].accessConfigs[0].natIP)" compute instances describe admin0`

ssh -CNL 3000:localhost:3000 \
    -i ~/.ssh/google_compute_engine \
    -o UserKnownHostsFile=~/.ssh/google_compute_known_hosts \
    -o IdentitiesOnly=yes -o CheckHostIP=no \
    -o StrictHostKeyChecking=no \
    salvus@$admin0ip
