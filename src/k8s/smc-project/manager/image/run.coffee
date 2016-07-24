###


###

fs        = require('fs')
async     = require('async')

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

# Create a changefeed of all potentially requested-to-be-running projects, which
# dynamically updates the projects object.
init_projects_changefeed = (cb) ->
    query = rethinkdb.db(DATABASE).table('projects').getAll(true, index:'run').pluck('project_id', 'run')
    query.changes(includeInitial:true, includeStates:true).run conn, (err, cursor) ->
        if err
            console.log('error setting up rethinkdb query', err)
            cb?(err)
            return
        state = 'initializing'
        cursor.each (err, x) ->
            if err
                console.log('error in changefeed', err)
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
    r = child_process.spawn('kubectl', ['get', 'deployments', '--show-labels',
                                        '--selector=run=smc-project', '--watch'])
    headers = undefined
    process = (line) ->
        v = line.match(/\S+/g)   # split on whitespace
        if v.length == 0
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
        console.log("kubectl terminated", code)
        process.exit(1)

    r.on 'error', (err) ->
        console.log("kubectl subprocess error", err)
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
            kubectl_start_project(project_id)
    else
        if x.kubernetes.DESIRED == '1'
            kubectl_stop_project(project_id)

reconcile_all = () ->
    _reconcile_ready = true
    for project_id, _ of projects
        reconcile(project_id)


# Start a project running
kubectl_start_project = (project_id) ->
    console.log 'kubectl_start_project ', project_id

# Stop a project from running
kubectl_stop_project = (project_id) ->
    console.log 'kubectl_stop_project ', project_id
    child_process.exec "kubectl delete deployments smc-project-#{project_id}", (err, stdout, stderr) =>
        console.log("kubectl_stop_project '#{project_id}' ", err, stdout, stderr)


# Start the main control loop.  This queries rethinkdb
# for all projects that are supposed to be running, and
# maintains a changefeed of that result.  It first makes
# sure that Kubernetes is in sync with this, and does an
# action whenever things change.
control_loop = (cb) ->
    f = ->
        #console.log 'doing nothing...'
    setInterval(f, 30000)


main = () ->
    async.series([
        (cb) ->
            async.parallel([init_kubectl_watch, connect_to_rethinkdb], cb)
        (cb) ->
            init_projects_changefeed(cb)
        (cb) ->
            control_loop(cb)
    ], (err) ->
        console.log("DONE", err)
    )

#main()
control_loop()

# For debugging/dev
exports.main = main
exports.connect_to_rethinkdb = connect_to_rethinkdb
exports.init_kubectl_watch = init_kubectl_watch
exports.init_projects_changefeed = init_projects_changefeed
exports.projects = projects