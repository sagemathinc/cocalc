# SageMathCloud Docker image

This is a self-contained single-image multi-user SageMathCloud server.

I make ABSOLUTELY NO GUARANTEES that this is secure in any way, shape, or form yet!  Do not trust it if you run it for some sort of production use.


## Build the image

    make build

## Run the image

    make run

Then type `docker ps` to see what port were exposed, and connect to either the encrypted or non-encrypted ports.

