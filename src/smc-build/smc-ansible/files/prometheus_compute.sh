#!/usr/bin/env bash
DIR=/root/
DAEMON=$DIR/prometheus_compute.py
DAEMON_NAME=prometheus_compute
PIDFILE=$DIR/$DAEMON_NAME.pid
DAEMON_USER=root

. /lib/lsb/init-functions

do_start () {
    log_daemon_msg "Starting system $DAEMON_NAME daemon"
    sudo -H -u $DAEMON_USER sh -c "start-stop-daemon --start --background --pidfile $PIDFILE --make-pidfile --user $DAEMON_USER --chuid $DAEMON_USER --startas $DAEMON -- $DAEMON_OPTS"
    log_end_msg $?
}
do_stop () {
    log_daemon_msg "Stopping system $DAEMON_NAME daemon"
    sudo -H -u $DAEMON_USER sh -c "start-stop-daemon --stop --pidfile $PIDFILE --retry 10"
    log_end_msg $?
}

case "$1" in

    start|stop)
        do_${1}
        ;;

    restart|reload|force-reload)
        do_stop
        do_start
        ;;

    status)
        status_of_proc "$DAEMON_NAME" "$DAEMON" && exit 0 || exit $?
        ;;

    *)
        echo "Usage: /etc/init.d/$DAEMON_NAME {start|stop|restart|status}"
        exit 1
        ;;

esac
exit 0


