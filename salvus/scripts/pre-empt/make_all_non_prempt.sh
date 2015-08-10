set -e
set -v

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute0-us; gce create_compute_server --machine_type n1-highmem-2 --address compute0-us 0

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute1-us; gce create_compute_server --machine_type n1-highmem-2 --address compute1-us 1

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute2-us; gce create_compute_server --machine_type n1-highmem-2 --address compute2-us 2

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute3-us; gce create_compute_server --machine_type n1-highmem-2 --address compute3-us 3

