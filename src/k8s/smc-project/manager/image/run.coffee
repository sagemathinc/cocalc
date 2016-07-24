###


###

fs        = require('fs')
async     = require('async')

rethinkdb = require('rethinkdb')
conn      = undefined  # connection to rethinkdb

connect_to_rethinkdb = (cb) ->
    authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
    rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
        conn = _conn
        cb(err)


projects = {}

# Maintain current status of all project deployments
connect_to_kubernetes = (cb) ->
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
        console.log("kubernetes terminated", code)
        process.exit()

    r.on 'error', (err) ->
        console.log("kubernetes subprocess error", err)
        process.exit()

    cb?()

# Get status of a particular project
kubectl_get_project = (project_id, cb) ->

# Start a project running
kubectl_start_project = (project_id, cb) ->

# Start the main control loop.  This queries rethinkdb
# for all projects that are supposed to be running, and
# maintains a changefeed of that result.  It first makes
# sure that Kubernetes is in sync with this, and does an
# action whenever things change.
control_loop = (cb) ->
    f = ->
        console.log 'doing nothing...'
    setInterval(f, 30000)


main = () ->
    async.series([
        (cb) ->
            async.parallel([connect_to_kubectl, connect_to_rethinkdb], cb)
        (cb) ->
            control_loop(cb)
    ], (err) ->
        console.log("DONE", err)
    )

#main()
control_loop()

# For debugging/dev
exports.connect_to_kubernetes = connect_to_kubernetes
exports.projects = projects