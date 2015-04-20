NTHREADS = 8

misc_node = require('misc_node')
misc = require('misc')
async = require('async')
log = console.log

done = {}
todo = []
error = []
success = []

async.series([
    (cb) ->
        log("read list of all projects migrated to btrfs so far")
        misc_node.execute_code
            command : 'gsutil'
            args    : ['ls', 'gs://smc-gb-storage']
            timeout : 200
            cb      : (err, output) ->
                if err
                    cb(err)
                else
                    i = 'gs://smc-gb-storage/'.length
                    for x in output.stdout.split('\n')
                        done[x.split('/')[3]] = true
                    log("#{misc.keys(done).length} projects migrated")
                    cb()
    (cb) ->
        log("read list of all available bup projects")
        misc_node.execute_code
            command : 'ls'
            args    : ['/archive']
            timeout : 200
            cb      : (err, output) ->
                if err
                    cb(err)
                else
                    for x in output.stdout.split('\n')
                        v = x.split('.')
                        if v[1] == 'tar'
                            project_id = v[0]
                            if not done[project_id]
                                todo.push(project_id)
                    todo.sort()
                    #todo = todo.slice(0,10)  # for testing.
                    log("#{todo.length} projects left to migrate")
                    cb()
    (cb) ->
        log("migrate each non-migrated bup project")
        i = 0
        total = todo.length
        migrate = (project_id, cb) ->
            i += 1
            log("migrating #{i}/#{total}: #{project_id} (success=#{success.length}, fail=#{error.length})")
            misc_node.execute_code
                command : '/home/salvus/salvus/salvus/scripts/gb_storage.py'
                path    : '/tmp'
                args    : ['migrate', '--source=/archive', project_id]
                timeout : 3600
                cb      : (err, output) ->
                    log("migrated #{i}")
                    console.log(output.stdout)
                    console.log(output.stderr)
                    if err
                        error.push(project_id)
                        log("ERROR migrating #{project_id} -- #{err}")
                    else
                        log("SUCCESS migrating #{project_id}")
                        success.push(project_id)
                    cb()
        async.mapLimit(todo, NTHREADS, migrate, cb)
    ], (err) ->
        log("DONE!")
        log("#{error.length} errors")
        log("#{success.length} successes")
    )
