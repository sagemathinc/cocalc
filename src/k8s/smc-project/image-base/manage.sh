#!/usr/bin/env bash
# thin management wrapper lib, used for Docker's ENTRYPOINT

# init: clean existing code and grab newest version
init () {
    cd /
    rm -rf /smc/
    git clone --depth 1 https://github.com/sagemathinc/smc.git
    cd /smc/src/smc-build/smc-ansible
}

case "$1" in
    install)
        # this runs the meta-playbook "compute-setup" with the modified machines file on localhost
        init
        ansible-playbook -i container.ini compute-setup.yaml
        ;;

    update)
        # this runs the meta-playbook "compute-setup" with the tags "update"
        # they're supposed to check for upgraded packages and do not compile so much -- hence finishes faster
        init
        ansible-playbook -i container.ini compute-setup.yaml --tags=update
        ;;

    bash)
        # fork to be a command-line
        exec bash
        ;;

    test)
       # runs the integration tests to figure out, how well everything works in here
       init
       cd ..
       py.test-3 compute-integration-tests.py
       ;;

    *)
        echo $"Usage: $0 {install|update|bash}"
        exit 1
esac
