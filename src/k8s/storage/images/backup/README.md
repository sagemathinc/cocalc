image-backup

This is a container that is responsible for dealing with
backups inside the pod.

It:

 - Ensures that every volume (project ZFS pool image) that has been backed up gets uploaded to gcloud storage, and records that this happened in the database.

 - (Not yet but later) Ensures that these volumes are also backed up offsite.

