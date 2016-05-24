# Rethinkdb Proxy


## How to use this:

Build the image

    ./control.py build --tag 0

Then run it:

    ./control.py run --tag 0  --replicas 3 --join [name/ip of a rethinkdb node somewhere]


### TODO:

E.g., for testing with no password, I ran rethinkdb internally, then found the ip of a node with `kubectl describe pod ...`, and pointed at that.  Pointing at a service doesn't work at all.

    ./control.py run -tag 0  --replicas 3 --no-password --join 10.244.2.3