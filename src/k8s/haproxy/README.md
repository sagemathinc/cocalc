# Haproxy proxy server

## Getting going

Build the container and copy the result to the gcloud repo

    ./control.py build --tag=my_tag

Load the SSL cert, which should be in ../../data/secrets/sagemath.com/nopassphrase.pem.

    ./control.py ssl

Run (or switch to) an haproxy deployment:

    ./control.py run --tag=my_tag

Make publicly visible (assign external ip address):

    ./control.py expose

... then wait 2 minutes and type `kubectl get services`.

Visit  http://[ip]:1936 for stats.

Stop the deployment from running:

    ./control.py stop

