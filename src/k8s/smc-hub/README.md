# smc-hub deployment

### Building image, pushing to gcloud, and running the deployment

To load the rethinkdb, sendgrid, and zendesk secrets into kubernetes (if you don't have the right files in src/data/secrets, empty secrets are included), so that the deployment works.

    ./control.py secrets

To build the images and push to gcloud:

    ./control.py build --tag=my_tag

To then start the deployment running on kubernetes:

    ./control.py run --tag=my_tag

### Updating the image

To update the images using the latest master git repo (pull means pull from git):

    ./control.py build --pull --tag=my_ver

To rebuild everything from scratch, including reinstalling packages from apt:

    ./control.py build --upgrade --tag=my_tag


### Development

To build the Docker images locally (and not push):

    ./control.py build --local

