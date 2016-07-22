#!/usr/bin/env bash
# thin management wrapper lib, used for Docker's ENTRYPOINT

# init: clean existing code and grab newest version
init () {
    cd /
    rm -rf /smc/
    git clone --depth 1 https://github.com/sagemathinc/smc.git
}

salvus () {
    sudo -H -u salvus bash -c "umask 022; exec -l $@"
}

case "$1" in
    install)
        # this runs the meta-playbook "compute-setup" with the modified machines file on localhost
        init
        cd /smc/src/smc-build/smc-ansible
        ansible-playbook -i container.ini compute-setup.yaml
        ;;

    update)
        # this runs the meta-playbook "compute-setup" with the tags "update"
        # they're supposed to check for upgraded packages and do not compile so much -- hence finishes faster
        init
        cd /smc/src/smc-build/smc-ansible
        ansible-playbook -i container.ini compute-setup.yaml --tags=update
        ;;

    run)
        # fork to be a command-line
        init
        salvus bash
        ;;

    root)
        # fork to be a command-line as root
        init
        bash
        ;;

    test)
        # runs the integration tests to figure out, how well everything works in here
        init
        cd /smc/src/smc-build
        salvus py.test-3 compute-integration-tests.py
        ;;

    *)
        echo $"Usage: $0 {install|update|bash|root|test}"
        exit 1
esac
