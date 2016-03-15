# Ansible

## Initial setup

1. `pip install --user -U ansible`

2. adding `~/.local/bin` to the `\$PATH`. (that should be by default)

3. `pip install --user -U apache-libcloud` according to
   http://docs.ansible.com/ansible/guide_gce.html


## How I got started

1. starting to make a `machine.ini` file. this data is static,
   but documentation says this could be dynamic.
   (look for "dynamic inventory")

1. console > api credentials > serivce account > P12 key

1. initial password: `notasecret`

1. `> openssl pkcs12 -in smc-ansible.p12 -passin pass:notasecret -nodes -nocerts | openssl rsa -out pkey.pem`

1. figuring out this `secrets.py` file ?!!?
   ok, no real need for secrets.py, the key is the gce.py and gce.ini

1. what's more important is a (local) ansible.cfg file (which could also be in /etc/ ... )
   * it sets the private key to the one of GCE
   * ssh timeout
   * the ssh arguments for the entire ssh command
   * and also sets the `machines.ini` file being the default

## Baby Steps

ping:

    > ansible -m ping all

see all information ansible gathers:

    > ansible -m setup all




## Things I wished to know
and might be helpful for you, too

1. Connecting to the local host via its name doesn't work.
   So, if `hostname == compute4-us`
   -> it should be `localhost ansible_connection=local` in the machiens.ini
   There might be a good reason why this is!?

2. Take great care to use `-a ' ... $VAR ... '` single quotes when using shell variables. That might lead to really crazy errors!

