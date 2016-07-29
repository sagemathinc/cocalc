rethinkdb = require('rethinkdb')
async     = require('async')

# a nonnegative integer -- the number of this storage server
STORAGE_SERVER = parseInt(process.env['STORAGE_SERVER'])

conn      = undefined  # connection to rethinkdb
DATABASE  = 'smc'

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

connect_to_rethinkdb = (cb) ->
    try
        authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
    catch
        authKey = undefined
    rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
        conn = _conn
        cb?(err)

# Create a changefeed of all projects that are (requested to be) running and
# are hosted on this storage server.  The main point of this service is to
# ensure that these projects are available to use.
FIELDS = ['run', 'disk_size', 'last_backup_to_gcloud']
projects = {}
init_projects_changefeed = (cb) ->
    query = rethinkdb.db(DATABASE).table('projects').getAll(true, index:'run').filter(storage_server:STORAGE_SERVER)
    query = query.pluck(['project_id'].concat(FIELDS))
    query.changes(includeInitial:true).run conn, (err, cursor) ->
        if err
            log('error setting up rethinkdb query', err)
            cb?(err)
            return
        cursor.each (err, x) ->
            if err
                throw "error in changefeed -- #{err}"
            if x.new_val
                project_id = x.new_val.project_id
                z = projects[project_id] ?= {}
                for k, v of x.new_val
                    z[k] = v
                if z.run and not z.init
                    init(project_id)
                    return
            else if x.old_val  # no new value -- removed from changefeed result, so now not running.
                delete projects[x.old_val.project_id]
            return   # explicit return (undefined) -- otherwise last value gets returned, which stops iteration!
        cb?()

init = (project_id, cb) ->
    log("init: #{project_id}", projects[project_id])
    # ensure the image file exists locally; if not, download it from gcloud or create it.

    cb?()

main = () ->
    async.series [connect_to_rethinkdb, init_projects_changefeed], (err) ->
        if err
            log("FAILED TO INITIALIZE! ", err)
            process.exit(1)
        else
            log("SUCCESSFULLY INITIALIZED; now RUNNING")

main()
