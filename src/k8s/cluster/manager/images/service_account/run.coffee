###
PURPOSE: open projects
AUTHOR: William Stein, 2016 (c) SageMath, Inc.
LICENSE: GPLv3

WARNING: we assume that the .zfs directory doesn't contain any directories that should get put in the bup repo!  Only files.
###

fs            = require('fs')
child_process = require('child_process')

async         = require('async')

f = () ->
    console.log "foo"
setInterval(f, 5000)
