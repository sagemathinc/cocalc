# Rethinkdb Proxy


## How to use this:

Build the image

    ./control.py build --tag 0

Then run it:

    ./control.py run --tag 0

### TODO:

With no password:

    ./control.py run -tag 0  --replicas 3 --no-password