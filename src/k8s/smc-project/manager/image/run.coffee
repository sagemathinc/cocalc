###
This is a service that watches:

 - projects in RethinkDB to see which are requested to be run,
 - the running projects in kubernetes to see which are actually running.

When there is a discrepancy it resolves it.

(c) 2016, William Stein, SageMathInc.

LICENSE: GPLv3

NOTE: This code doesn't depend on the rest of the SMC library.
###

child_process = require('child_process')
fs            = require('fs')
async         = require('async')
temp          = require('temp')    # https://www.npmjs.com/package/temp

rethinkdb = require('rethinkdb')
conn      = undefined  # connection to rethinkdb
DATABASE  = 'smc'

projects = {}

connect_to_rethinkdb = (cb) ->
    try
        authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
    catch
        authKey = undefined
    rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
        conn = _conn
        cb?(err)

log = console.log

# Create a changefeed of all potentially requested-to-be-running projects, which
# dynamically updates the projects object.
init_projects_changefeed = (cb) ->
    query = rethinkdb.db(DATABASE).table('projects').getAll(true, index:'run').pluck('project_id', 'run')
    query.changes(includeInitial:true, includeStates:true).run conn, (err, cursor) ->
        if err
            log('error setting up rethinkdb query', err)
            cb?(err)
            return
        state = 'initializing'
        cursor.each (err, x) ->
            if err
                log('error in changefeed', err)
                process.exit(1)
            if x.state
                state = x.state
                if state == 'ready'
                    # done loading run info -- reconcile everything
                    READY = true
                    reconcile_all()
                    return
            if x.new_val
                project_id = x.new_val.project_id
                z = projects[project_id] ?= {}
                z.run = x.new_val.run
            else if x.old_val  # no new value -- removed from changefeed result, so now false.
                project_id = x.old_val.project_id
                z = projects[project_id] ?= {}
                z.run = false
            if state == 'ready' and project_id?
                reconcile(project_id)
            return   # explicit return (undefined) -- otherwise last value gets returned, which stops iteration!
        cb?()

# Maintain current status of all project deployments
init_kubectl_watch = (cb) ->
    # The Headers include: NAME   DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE  LABELS
    # kubectl get deployments --show-labels --selector=run=smc-project --watch

    headers = undefined
    process = (line) ->
        v = line.match(/\S+/g)   # split on whitespace
        if not v or v.length == 0
            return
        if line.indexOf('smc-project') == -1
            # Headers
            headers = v
        else
            # New info
            project_id = v[0].slice('smc-project-'.length)
            x = projects[project_id] ?= {}
            k = {}
            for i in [0...v.length]
                k[headers[i]] = v[i]
            x.kubernetes = k
            reconcile(project_id)

    # Initialize
    cmd "kubectl get deployments --show-labels --selector=run=smc-project", (err, output) ->
        if err
            cb?(err)
            return
        for line in output.split('\n')
            process(line)

        # Now watch
        r = child_process.spawn('kubectl', ['get', 'deployments', '--show-labels',
                                            '--selector=run=smc-project', '--watch', '--no-headers'])
        stdout = ''
        r.stdout.on 'data', (data) ->
            stdout += data.toString()
            while true
                i = stdout.indexOf('\n')
                if i == -1
                    break
                line = stdout.slice(0,i)
                stdout = stdout.slice(i+1)
                process(line)

        r.on 'exit', (code) ->
            log("kubectl terminated", code)
            process.exit(1)

        r.on 'error', (err) ->
            log("kubectl subprocess error", err)
            process.exit(1)

        cb?()

# get changed to true when we first run reconcile_all
_reconcile_ready = false
reconcile = (project_id) ->
    if not _reconcile_ready
        return
    x = projects[project_id]
    if x.run
        if not x.kubernetes? or x.kubernetes.DESIRED != '1'
            log("starting because x = ", x)
            kubectl_start_project(project_id)
    else
        if x.kubernetes.DESIRED == '1'
            log("stopping because x = ", x)
            kubectl_stop_project(project_id)

reconcile_all = () ->
    _reconcile_ready = true
    for project_id, _ of projects
        reconcile(project_id)

replace_all = (string, search, replace) ->
    string.split(search).join(replace)

# Used for starting projects:
deployment_template = fs.readFileSync('smc-project.template.yaml').toString()
deployment_yaml = (project_id) ->
    params =  #TODO
        project_id     : project_id
        image          : process.env['DEFAULT_IMAGE']          # explicitly set in the deployment yaml file
        namespace      : process.env['KUBERNETES_NAMESPACE']   # explicitly set in the deployment yaml file
        storage_server : '0'
        disk_size      : '1G'
        pull_policy    : 'IfNotPresent'
    s = deployment_template
    for k, v of params
        s = replace_all(s, "{#{k}}", v)
    return s

cmd = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        #log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

# Start a project running
kubectl_start_project = (project_id, cb) ->
    log 'kubectl_start_project ', project_id
    info = undefined
    async.series([
        (cb) ->
            temp.open {suffix:'.yaml'}, (err, _info) ->
                info = _info
                cb(err)
        (cb) ->
            fs.write(info.fd, deployment_yaml(project_id))
            fs.close(info.fd, cb)
        (cb) ->
            cmd("kubectl create -f #{info.path}", cb)
    ], (err) ->
        if err
            log "failed to start '#{project_id}': ", err
            # Try again in a few seconds  (TODO...)
            setTimeout((()->reconcile(project_id)), 5000)
        else
            log "started '#{project_id}'"
        if info?
            try
                fs.unlink(info.path)
            catch
                # ignore
        cb?(err)
    )

# Stop a project from running
kubectl_stop_project = (project_id) ->
    log 'kubectl_stop_project ', project_id
    cmd "kubectl delete deployments smc-project-#{project_id}", (err) ->
        if err
            log "failed to stop '#{project_id}': ", err
            # Try again in a few seconds  (TODO...)
            setTimeout((()->reconcile(project_id)), 5000)
        else
            log "stopped '#{project_id}'"


# Start the main control loop.  This queries rethinkdb
# for all projects that are supposed to be running, and
# maintains a changefeed of that result.  It first makes
# sure that Kubernetes is in sync with this, and does an
# action whenever things change.
sleep = (cb) ->
    f = ->  # do nothing
    setInterval(f, 60000)


main = () ->
    async.series([
        (cb) ->
            async.parallel([init_kubectl_watch, connect_to_rethinkdb], cb)
        (cb) ->
            init_projects_changefeed(cb)
        (cb) ->
            sleep(cb)
    ], (err) ->
        log("DONE", err)
    )

main()

# For debugging/dev
exports.main = main
exports.connect_to_rethinkdb = connect_to_rethinkdb
exports.init_kubectl_watch = init_kubectl_watch
exports.init_projects_changefeed = init_projects_changefeed
exports.projects = projects