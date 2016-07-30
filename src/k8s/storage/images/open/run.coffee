###
PURPOSE: open projects
AUTHOR: William Stein, 2016 (c) SageMath, Inc.
LICENSE: GPLv3
###

fs            = require('fs')
child_process = require('child_process')

rethinkdb     = require('rethinkdb')
async         = require('async')

# a nonnegative integer -- the number of this storage server
STORAGE_SERVER = parseInt(process.env['STORAGE_SERVER'])
GCLOUD_BUCKET  = process.env['GCLOUD_BUCKET']

conn      = undefined  # connection to rethinkdb
DATABASE  = 'smc'

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

run = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        #log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

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
FIELDS = ['run', 'storage_ready', 'last_backup_to_gcloud']
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
                if z.run and not z.storage_ready
                    init_storage(project_id)
                    return
            else if x.old_val  # no new value -- removed from changefeed result, so now not running.
                delete projects[x.old_val.project_id]
            return   # explicit return (undefined) -- otherwise last value gets returned, which stops iteration!
        cb?()

init_storage = (project_id) ->
    project = projects[project_id]
    if project.initializing
        return
    project.initializing = true
    log("init: #{project_id}", project)
    async.series([
        (cb) ->
            if not project.last_backup_to_gcloud
                log("init: #{project_id} -- never backed up to gcloud; no need to restore")
                cb()
            else
                log("init: #{project_id} -- was backed up to gcloud; must restore")
                # Files were backed up to gcloud but storage_ready is false now,
                # so we need to copy them back from gcloud to here, extract them,
                # and mark things ready.
                restore_from_gcloud(project_id, cb)
        (cb) ->
            # Declare storage ready (the driver will create paths, allocate image files, etc.).
            rethinkdb.db(DATABASE).table('projects').get(project_id).update(storage_ready:true).run(conn, cb)
    ], (err) ->
        project.initializing = false
        if err
            log("init: #{project_id} ERROR -- ", err)
        else
            log("init: #{project_id} SUCCESS")
    )

###
restore_from_gcloud -- restores the given project_id data from the bup repo in
google cloud storage to '/data/projects/[project_id].zfs'.
###
restore_from_gcloud = (project_id, cb) ->
    dbg = (m) -> log("restore_from_gcloud('#{project_id}')", m)
    source = "gs://#{GCLOUD_BUCKET}/projects/#{project_id}.zfs"
    target = "/data/projects/#{project_id}.zfs/bup/"
    dbg("restore from '#{src}'")
    async.series([
        (cb) ->
            dbg("get files from gcloud storage")
            async.parallel([
                (cb) ->
                    dbg("rsync pack files from gcloud")
                    run("mkdir -p #{target}/objects/ && gsutil -m rsync -r #{source}/bup/objects/ #{target}/objects/", cb)
                (cb) ->
                    dbg("rsync refs files from gcloud")
                    run("mkdir -p #{target}/refs/ && gsutil -m rsync -c -r #{source}/bup/refs/ #{target}/refs/", cb)
                (cb) ->
                    dbg("creating HEAD")
                    fs.writeFile("#{target}/HEAD", 'ref: refs/heads/master', cb)
            ], cb)
        (cb) ->
            dbg("extract bup repo")
            run("cd / && bup -d #{target} join `bup -d #{target} ls | tail -1` | tar xv", cb)
    ], cb)


main = () ->
    async.series [connect_to_rethinkdb, init_projects_changefeed], (err) ->
        if err
            log("FAILED TO INITIALIZE! ", err)
            process.exit(1)
        else
            log("SUCCESSFULLY INITIALIZED; now RUNNING")

main()
