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

install_dockercfg = (name, cb) ->
    dbg = (m...) -> log("install_dockercfg #{name}", m...)
    async.series([
        (cb) ->
            dbg("copy over .dockercfg")
            # YES - kubelet uses /.dockercfg, not /root/.dockercfg!
            scp('/.dockercfg', "#{name}:/.dockercfg", cb)
        (cb) ->
            scp('/.dockercfg', "#{name}:/root/.dockercfg", cb)
        (cb) ->
            dbg("restart kubelet (otherwise docker image pulls still fail...)")
            run_on(name, 'service kubelet restart', cb)
    ], cb)

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
            dbg("install .dockercfg")
            install_dockercfg(name, cb)
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

install_on_new_nodes = (cb) ->
    get_nodes 'scopes=none', (err, nodes) ->
        if err
            log("ERROR getting nodes -- ", err)
            cb?(err)
        else if nodes.length == 0
            log("no nodes -- nothing to do")
            cb?()
        else
            log("configuring #{nodes.length} nodes ", nodes)
            async.map(nodes, install_scope, cb?)

last_dockercfg = ''
get_dockercfg = (cb) ->
    dbg = (m...) -> log("get_dockercfg", m...)
    dbg("get dockercfg from some minion that gets it from k8s")
    nodes = changed = undefined
    async.series([
        (cb) ->
            get_nodes 'scopes=default', (err, _nodes) ->
                nodes = _nodes; cb(err)
        (cb) ->
            if nodes.length == 0
                cb("bug -- found no nodes with default scope")
            else
                scp("#{nodes[0]}:/root/.dockercfg", "/.dockercfg", cb)
        (cb) ->
            fs.readFile "/.dockercfg", (err, data) ->
                if err
                    cb(err)
                else
                    s = data.toString()
                    if s != last_dockercfg
                        changed = true
                        last_dockercfg = s
                    else
                        changed = false
                    cb()
    ], (err) ->
        cb(err, changed)
    )

dockercfg_on_safe_nodes = (cb) ->
    changed = undefined
    async.series([
        (cb) ->
            get_dockercfg (err, _changed) ->
                changed = _changed; cb(err)
        (cb) ->
            if not changed
                log("no change to dockercfg")
                cb(); return
            log("dockercfg changed, so re-installing")
            get_nodes 'scopes=safe', (err, nodes) ->
                if err
                    log("ERROR getting nodes -- ", err)
                    cb(err)
                else if nodes.length == 0
                    cb()  # nothing to do
                else
                    log("configuring #{nodes.length} nodes ", nodes)
                    async.map(nodes, install_dockercfg, cb)
    ], (err) -> cb?(err))

init_ssh = (cb) ->
    log("create our ssh key")
    run("ssh-keygen -b 2048 -N '' -f /root/.ssh/google_compute_engine", cb)

async.series([
    (cb) ->
        init_ssh(cb)
    (cb) ->
        dockercfg_on_safe_nodes(cb)
    (cb) ->
        install_on_new_nodes(cb)
], (err) ->
        if err
            log("ERROR initializing ", err)
        else
            setInterval(install_on_new_nodes, 15*1000)
            setInterval(dockercfg_on_safe_nodes, 45*1000)   # TODO: I HATE THIS; but dockercfg changes regularly...
)