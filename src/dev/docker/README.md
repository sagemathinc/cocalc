# SageMathCloud Docker image

This is a self-contained single-image multi-user SageMathCloud server.

I make ABSOLUTELY NO GUARANTEES that this is secure in any way, shape, or form yet!  Do not trust it if you run it for some sort of production use.

# Use

    docker run -P williamstein/sagemathcloud

Then type `docker ps` to see what port were exposed, and connect to either the encrypted or non-encrypted ports.

ISSUES:

  - gp doesn't work at all, due to the Ubuntu ppa being broken


# Build

Build the image

    make build

Run the image (to test)

    make run

How I pushed this

    docker tag smc:latest williamstein/sagemathcloud
    docker login --username=williamstein
    docker push  williamstein/sagemathcloud
