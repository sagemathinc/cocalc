set -e
set -v

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute0-us; gce create_compute_server --preemptible  --machine_type n1-highmem-4 --address compute0-us 0&

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute1-us; gce create_compute_server --preemptible  --machine_type n1-highmem-4 --address compute1-us 1&

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute2-us; gce create_compute_server --preemptible  --machine_type n1-highmem-4 --address compute2-us 2 &

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute3-us; gce create_compute_server --preemptible  --machine_type n1-highmem-4 --address compute3-us 3 &

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c compute5-us; gce create_compute_server --preemptible  --machine_type n1-highcpu-16 --address compute5-us 5 &

#gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c  compute6-leveque-us; gce create_compute_server --preemptible  --machine_type n1-highmem-32 --address  compute6-leveque-us 6-leveque &

gcloud compute instances delete --quiet --keep-disks=all --zone us-central1-c  compute6-leveque-us; gce create_compute_server --preemptible  --machine_type n1-standard-16 --address  compute6-leveque-us 6-leveque