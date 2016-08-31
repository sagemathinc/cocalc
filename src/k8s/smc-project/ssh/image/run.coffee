###
This is the ssh gateway.  It:

  - Watches the database for which running projects require ssh access
  - Creates corresponding user accounts here that -- when ssh'd to -- forward the connection to the project

(c) 2016, William Stein, SageMathInc.

LICENSE: GPLv3

NOTE: This code doesn't depend on the rest of the SMC library.
###

fs            = require('fs')
async         = require('async')
child_process = require('child_process')
rethinkdb = require('rethinkdb')

conn      = undefined  # connection to rethinkdb
DATABASE  = 'smc'

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

run = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

connect_to_rethinkdb = (cb) ->
    log("connect_to_rethinkdb: connecting...")
    try
        authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
    catch
        authKey = undefined
    rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
        if not err
            log("connect_to_rethinkdb: connected")
        conn = _conn
        cb?(err)

keys_of_map = (x) -> (a for a,_ of x)

# Create a changefeed of all potentially requested-to-be-ssh'd to projects, which
# dynamically updates the projects object.
# TODO: change to union with accounts table.

projects = {}   # map from project_id to {ssh:?, kubernetes:?} for all projects with run:true
accounts = {}   # map from account_id to {ssh:?} for all accounts with an ssh key defined.

init_projects_changefeed = (cb) ->
    log("init_projects_changefeed")
    query = rethinkdb.db(DATABASE).table('projects').getAll(true, index:'run')
    query = query.pluck('project_id', 'ssh', 'kubernetes')
    query = query.union(rethinkdb.db(DATABASE).table('accounts').getAll(true, index:'ssh').pluck('account_id', 'ssh'))
    query.changes(includeInitial:true, includeStates:true).run conn, (err, cursor) ->
        if err
            log('error setting up rethinkdb query', err)
            cb?(err)
            return
        state = 'initializing'   # this is 'initializing' while processing the initial query, then changes to 'ready' when getting changefeed updates.
        cursor.each (err, x) ->
            if err
                throw "error in changefeed -- #{err}"
            if x.state
                state = x.state
                if state == 'ready'
                    log("init_projects_changefeed: done loading initial state of all projects.")
                    cb?()
                    return
            if x.new_val
                # could either be for an account or project
                if x.new_val.project_id?
                    project_id = x.new_val.project_id
                    z = projects[project_id] ?= {}
                    z.ssh = x.new_val.ssh
                    z.kubernetes = x.new_val.kubernetes
                    log(z)
                    if state == 'ready'
                        log("ssh change for '#{project_id}' and calling reconcile")
                        reconcile(project_id)
                        return
                else if x.new_val.account_id?
                    account_id = x.new_val.account_id
                    z = accounts[account_id] ?= {}
                    z.ssh = x.new_val.ssh
                    log(z)
                    if state == 'ready'
                        # Make a list of **all** project_id's that might be impacted by this account changing.
                        # Critical to include all project_id's since could change from
                        #     {ssh: {key0:[project0]}} to {ssh: {key1:[project0]}}
                        v = {}
                        for _key, project_ids of x.new_val.ssh
                            for project_id in project_ids
                                v[project_id] = true
                        if x.old_val?.ssh?
                            for _key, project_ids of x.old_val.ssh
                                for project_id in project_ids
                                    v[project_id] = true
                        reconcile_projects(keys_of_map(v))
                        return

            else if x.old_val  # no new value -- removed from changefeed result, so run is now false.
                if x.old_val.project_id?
                    project_id = x.old_val.project_id
                    delete projects[project_id]
                    reconcile(project_id)
                else if x.old_val.account_id?
                    account_id = x.old_val.account_id
                    delete accounts[account_id]
            return

# queue of project id lists, to make sure to process all of them asynchronously
# while new information might come in
_to_reconcile = []
_currently_reconciling = false

_process_reconcile_queue = () ->
    if _to_reconcile.length == 0 or _currently_reconciling
        return
    _currently_reconciling = true
    project_id    = _to_reconcile[0].project_id
    callbacks     = (x.cb for x in _to_reconcile when x.project_id == project_id)
    _to_reconcile = (x for x in _to_reconcile when x.project_id != project_id)
    _reconcile project_id, (err) ->
        for cb in callbacks
            cb?(err)
        _currently_reconciling = false
        _process_reconcile_queue()

# { ssh: { 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGp72O475RyG/DwX9A4o+Kud6KN49w4w4kr9/e9Ex5KG': [ 'fe0c040d-6601-4d15-bfe4-19f3536e3d96' ] } }

# Compute *sorted* list public keys that are allowed to access this project.
compute_authorized_keys = (project_id) ->
    authorized_keys = {}
    #log 'compute_authorized_keys ', project_id, accounts
    for account_id, info of accounts
        for key, v of info.ssh
            for id in v
                if id == project_id
                    authorized_keys[key] = true
    ret = keys_of_map(authorized_keys).sort()
    return ret

# write forced ssh-command entries into the authorized keys file
# command="ssh -q -t [PROJECTID-WITHOUT-DASHES]@[compute6-us.sagemath.com] $SSH_ORIGINAL_COMMAND",no-user-rc [PUBLIC KEY]
compute_authorized_keys_file = (project_id, username) ->
    keys       = compute_authorized_keys(project_id)
    ip_address = projects[project_id]?.kubernetes?.ip
    if not ip_address?
        return ''
    else
        return ("command=\"ssh -q -t #{username}@#{ip_address} $SSH_ORIGINAL_COMMAND\" #{key}" for key in keys).join('\n')

global_dash = new RegExp('-', 'g')
previous_auth_write = {}
_reconcile = (project_id, cb) ->
    dbg = (m...) -> log("reconcile('#{project_id}')", m...)
    dbg()

    # username derived from project_id ?
    username = project_id.replace(global_dash, '')

    # compute the authorized_keys file for this project
    new_auth  = compute_authorized_keys_file(project_id, username)

    # get the last authorized_keys file that we wrote
    last_auth = previous_auth_write[project_id] ? ''

    if new_auth == last_auth
        dbg("no change since last time we wrote the auth file")
        cb()
        return

    # determine and apply changes to filesystem
    home_path = "/home/#{username}"
    ssh_path  = "#{home_path}/.ssh"
    auth_path = "#{ssh_path}/authorized_keys"
    priv_path = "#{ssh_path}/id_ed25519"
    dbg("change -- now updating '#{auth_path}'...")
    async.series([
        (cb) ->
            dbg("make the user, if necessary")
            fs.stat home_path, (err) ->
                if err
                    # create the user
                    run("useradd --create-home #{username}", cb)
                else
                    cb()
        (cb) ->
            dbg("create .ssh directory, if necessary")
            fs.stat ssh_path, (err) ->
                if err
                    async.series([
                        (cb) ->
                            fs.mkdir(ssh_path, 0o700, cb)
                        (cb) ->
                            run("chown #{username}. #{ssh_path}", cb)
                    ], cb)
                else
                    cb()
        (cb) ->
            dbg("write .ssh/authorized_keys, if necessary")
            fs.writeFile(auth_path, new_auth, cb)
        (cb) ->
            dbg("write #{priv_path}")
            fs.writeFile(priv_path, projects[project_id].ssh.private, cb)
        (cb) ->
            dbg("change permission mode of #{priv_path}")
            cb()
        (cb) ->
            dbg("set ownership")
            run("chown #{username}. #{auth_path} #{ssh_path}", cb)
    ], (err) ->
        if not err
            # record that new_auth is the last version of authorized_keys that was written out.
            previous_auth_write[project_id] = new_auth
        cb(err)
    )

reconcile = (project_id, cb) ->
    _to_reconcile.push(project_id:project_id, cb:cb)
    _process_reconcile_queue()

reconcile_projects = (v, cb) ->
    async.map(v, reconcile, (err)->cb?(err))

reconcile_all = (cb) ->
    log("reconcile_all")
    v = (project_id for project_id, _ of projects)
    reconcile_projects(v, cb)

start_ssh_server = (cb) ->
    dbg = (m...) -> log("start_ssh_server", m...)
    dbg()
    run("service ssh start")

main = () ->
    async.series [connect_to_rethinkdb,
                  init_projects_changefeed,
                  reconcile_all,
                  start_ssh_server], (err) ->
        if err
            log("FAILED TO INITIALIZE! ", err)
            process.exit(1)
        else
            log("SUCCESSFULLY INITIALIZED; now RUNNING")

main()
