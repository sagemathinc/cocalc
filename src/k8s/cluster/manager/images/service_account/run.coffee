###
PURPOSE: open projects
AUTHOR: William Stein, 2016 (c) SageMath, Inc.
LICENSE: GPLv3

WARNING: we assume that the .zfs directory doesn't contain any directories that should get put in the bup repo!  Only files.
###

fs            = require('fs')
child_process = require('child_process')
async         = require('async')

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

run = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

run_on = (name, s, cb) ->
    run("gcloud -q compute ssh #{name} '#{s}'", cb)

scp = (src, dest, cb) ->
    run("gcloud beta -q compute scp #{src} #{dest}", cb)

install_scope = (name, cb) ->
    dbg = (m...) -> log("install_scope #{name}", m...)
    dbg()
    async.series([
        (cb) ->
            dbg("copy service.json service account secret")
            scp('/secrets/gcloud-service-account/service.json', "#{name}:/root/service.json", cb)
        (cb) ->
            dbg("activate service account")
            run_on(name, 'gcloud auth activate-service-account --key-file /root/service.json', cb)
        (cb) ->
            dbg("rm service account json file")
            run_on(name, 'rm /root/service.json', cb)
        (cb) ->
            dbg("copy over .dockercfg")
            # YES - kubelet uses /.dockercfg, not /root/.dockercfg!
            scp('/.dockercfg', "#{name}:/.dockercfg", cb)
        (cb) ->
            scp('/.dockercfg', "#{name}:/root/.dockercfg", cb)
        (cb) ->
            dbg("label to indicate done")
            run("kubectl label nodes #{name} scopes=safe --overwrite", cb)
    ], cb)

install_scope0 = (name, cb) ->  # never errors
    install_scope name, (err) ->
        if err
            log("ERROR -- failed to install service account on #{name}")
        else
            log("SUCCESS -- installed service account on #{name}")
        cb()


get_nodes = (labels, cb) ->
    run "kubectl get nodes --no-headers -l #{labels}", (err, stdout) ->
        if err
            cb("ERROR getting nodes--#{err}")
        else
            nodes = []
            for x in stdout.trim().split('\n')
                y = x.trim()
                if y
                    nodes.push(y.split(' ')[0])
            cb(undefined, nodes)

main = () ->
    get_nodes 'scopes=none', (err, nodes) ->
        if err
            log("ERROR getting nodes -- ", err)
            process.exit(1)
        else if nodes.length == 0
            return
        else
            log "configuring #{nodes.length} nodes ", nodes
            async.map nodes, install_scope, (err) ->
                if err
                    log("ERROR in install_scope -- ", err)
                else
                    log("done installing scope")

init = (cb) ->
    dbg = (m...) -> log("init", m...)
    dbg()
    async.series([
        (cb) ->
            dbg("create our ssh key")
            run("ssh-keygen -b 2048 -N '' -f /root/.ssh/google_compute_engine", cb)
        (cb) ->
            dbg("get dockercfg from some minion")
            get_nodes 'scopes!=none', (err, nodes) ->
                if err
                    cb(err)
                else if nodes.length == 0
                    cb("bug -- found no nodes with scope not none")
                else
                    scp("#{nodes[0]}:/root/.dockercfg", "/.dockercfg", cb)
    ], cb)

init (err) ->
    if not err
        setInterval(main, 15000)
