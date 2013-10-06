#!/usr/bin/env bash

export SAGEMATHCLOUD="`dirname \`readlink -f $BASH_SOURCE\``"

$SAGEMATHCLOUD/stop_smc   # no options needed

$SAGEMATHCLOUD/start_smc "$@"   # pass command line options on

