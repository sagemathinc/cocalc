###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


#
# DEPRECATED!!
#
#################################################################
#
# storage -- a node.js program/library for interacting with
# the SageMath Cloud's ZFS-based replicated distributed snapshotted
# project storage system.
#
#################################################################

#
# DEPRECATED!!
#


winston   = require 'winston'
HashRing  = require 'hashring'
rmdir     = require('rimraf')
fs        = require 'fs'
cassandra = require 'cassandra'
async     = require 'async'
misc      = require 'misc'
misc_node = require 'misc_node'
uuid      = require 'node-uuid'
_         = require 'underscore'
{defaults, required} = misc

# Set the log level to debug
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

SALVUS_HOME=process.cwd()
STORAGE_USER = 'storage'
STORAGE_TMP = '/home/storage/'
TIMEOUT = 60*2  # default timeout for ssh commands -- 2 minutes

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    fs.readFile "#{SALVUS_HOME}/data/secrets/cassandra/hub", (err, password) ->
        if err
            cb(err)
        else
            new cassandra.Salvus
                #hosts    : if process.env.USER=='wstein' then ['localhost'] else ("10.1.#{i}.2" for i in [1,2,3,4,5,7,10,11,12,13,14,15,16,17,18,19,20,21])
                hosts    : if process.env.USER=='wstein' then ['localhost'] else ("10.1.#{i}.2" for i in [1..7])
                keyspace : if process.env.USER=='wstein' then 'test' else 'salvus'        # TODO
                username : if process.env.USER=='wstein' then 'salvus' else 'hub'         # TODO
                consistency : 1
                password : password.toString().trim()
                cb       : (err, db) ->
                    set_database(db, cb)

exports.set_database = set_database = (db, cb) ->
    database = db
    init_hashrings(cb)

exports.db = () -> database # TODO -- for testing

filesystem = (project_id) -> "projects/#{project_id}"
mountpoint = (project_id) -> "/projects/#{project_id}"
exports.username = username   = (project_id) -> project_id.replace(/-/g,'')

execute_on = (opts) ->
    opts = defaults opts,
        host        : required
        command     : required
        err_on_exit : true
        err_on_stderr : true     # if anything appears in stderr then set err=output.stderr, even if the exit code is 0.
        timeout     : TIMEOUT
        user        : STORAGE_USER
        cb          : undefined
    t0 = misc.walltime()
    misc_node.execute_code
        command     : "ssh"
        args        : ["-o StrictHostKeyChecking=no", "#{opts.user}@#{opts.host}", opts.command]
        timeout     : opts.timeout
        err_on_exit : opts.err_on_exit
        cb          : (err, output) ->
            if not err? and opts.err_on_stderr and output.stderr
                # strip out the ssh key warnings, which we'll get the first time connecting to hosts, and which are not errors.
                x = (y for y in output.stderr.split('\n') when (y.trim().lenth > 0 and y.indexOf('Warning') == -1 and y.indexOf('to the list of known hosts') == -1))
                if x.length > 0
                    err = output.stderr
            winston.debug("#{misc.walltime(t0)} seconds to execute '#{opts.command}' on #{opts.host}")
            opts.cb?(err, output)


######################
# Health/status
######################
###
# healthy and up  = "zpool list -H projects" responds like this within 5 seconds?
# projects        508G    227G    281G    44%     2.22x   ONLINE  -
# Or maybe check that "zpool import" isn't a running process?
salvus@compute11a:~$ ps ax |grep zpool
 1445 ?        S      0:00 sh -c zpool import -Nf projects; mkdir -p /projects; chmod a+rx /projects
 1446 ?        D      0:00 zpool import -Nf projects

or this since we don't need "sudo zpool":

    storage@compute11a:~$ sudo zfs list projects
    NAME       USED  AVAIL  REFER  MOUNTPOINT
    projects   148G   361G  4.92M  /projects
    salvus@cloud1:~$ sudo zfs list projects
    [sudo] password for salvus:
    cannot open 'projects': dataset does not exist

###

######################
# Database error logging
######################

exports.log_error = log_error = (opts) ->
    opts = defaults opts,
        project_id : required
        mesg       : required       # json-able
        cb         : undefined
    winston.debug("log_error(#{opts.project_id}): '#{misc.to_json(opts.mesg)}' to DATABASE")
    x = "errors_zfs['#{cassandra.now()}']"
    v = {}
    v[x] = misc.to_json(opts.mesg)
    database.update
        table : 'projects'
        where : {project_id : opts.project_id}
        set   : v
        cb    : (err) -> opts.cb?(err)


exports.get_errors = get_errors = (opts) ->
    opts = defaults opts,
        project_id : required       # string (a single id) or a list of ids
        max_age_s  : undefined      # if given, only return errors that are within max_age_s seconds of now.
        cb         : required       # cb(err, {project_id:[list,of,errors], ...}
    dbg = (m) -> winston.debug("get_errors: #{m}")
    if typeof(opts.project_id) == 'string'
        v = [opts.project_id]
    else
        v = opts.project_id
    dbg("v=#{misc.to_json(v)}")
    database.select
        table   : 'projects'
        where   : {project_id : {'in':v}}
        columns : ['project_id', 'errors_zfs']
        cb      : (err, results) ->
            if err
                opts.cb(err)
            else
                if opts.max_age_s?
                    cutoff = misc.mswalltime() - opts.max_age_s*1000
                    dbg("cutoff=#{cutoff}")
                    for entry in results
                        r = entry[1]
                        for time, mesg of r
                            d = new Date(time)
                            delete r[time]
                            if d.valueOf() >= cutoff
                                r[d.toISOString()] = misc.from_json(mesg)
                else
                    for entry in results
                        r = entry[1]
                        for time, mesg of r
                            delete r[time]
                            r[(new Date(time)).toISOString()] = misc.from_json(mesg)

                ans = {}
                for entry in results
                    if misc.len(entry[1]) > 0
                        ans[entry[0]] = entry[1]
                opts.cb(undefined, ans)



######################
# Running Projects
######################

# if user doesn't exist on the given host, create them
exports.create_user = create_user = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        action     : 'create'   # 'create', 'kill' (kill all processes), 'skel' (copy over skeleton), 'chown' (chown files)
        base_url   : ''         # used when writing info.json
        chown      : false      # if true, chowns files in /project/projectid in addition to creating user.
        timeout    : 200        # time in seconds
        cb         : undefined

    winston.info("creating user for #{opts.project_id} on #{opts.host}")
    if opts.action == 'create'
        cgroup = '--cgroup=cpu:1024,memory:12G'
    else
        cgroup = ''
    execute_on
        host    : opts.host
        command : "sudo /usr/local/bin/create_project_user.py --#{opts.action} #{cgroup} --base_url=#{opts.base_url} --host=#{opts.host} #{if opts.chown then '--chown' else ''} #{opts.project_id}"
        timeout : opts.timeout
        cb      : opts.cb

is_disabled = (opts) ->
    opts = defaults opts,
        host       : required
        cb         : required
    database.select_one
        table   : 'storage_topology'
        columns : ['disabled']
        where   : {host:opts.host, data_center:host_to_datacenter[opts.host]}
        cb      : (err, result) ->
            opts.cb(err, result?[0])

# Open project on the given host.  This mounts the project, ensures the appropriate
# user exists and that ssh-based login to that user works.
exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        base_url   : ''
        chown      : false
        cb         : required   # cb(err, host used)

    winston.info("opening project #{opts.project_id} on #{opts.host}")
    dbg = (m) -> winston.debug("open_project(#{opts.project_id},#{opts.host}): #{m}")

    async.series([
        (cb) ->
            dbg("check whether or not host is disabled for maintenance")
            is_disabled
                host       : opts.host
                cb         : (err, disabled) ->
                    if err
                        cb(err)
                    else if disabled
                        dbg("host is disabled")
                        cb("host is disabled for maintenance")
                    else
                        cb()
        (cb) ->
            dbg("check that host is up and not still mounting the pool")
            execute_on
                host    : opts.host
                timeout : 10
                command : "pidof /sbin/zpool"
                err_on_exit : false
                err_on_stderr : false
                cb      : (err, output) ->
                    if err
                        dbg("host #{opts.host} appears down -- couldn't connect -- #{err}")
                        cb(err)
                    else
                        o = (output.stdout + output.stderr).trim()
                        if output.exit_code != 0 and o == ""
                            dbg("zpool not running on #{opts.host} -- ready to go.")
                            cb()
                        else
                            a = "zpool still being imported on #{opts.host} -- pid = #{o}"
                            dbg(a)
                            cb(a)

        (cb) ->
            dbg("mount filesystem")
            execute_on
                host    : opts.host
                timeout : 25   # relatively small timeout due to zfs deadlocks -- just move onto another host
                command : "sudo zfs set mountpoint=#{mountpoint(opts.project_id)} #{filesystem(opts.project_id)}&&sudo zfs mount #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        if err.indexOf('directory is not empty') != -1
                            # TODO: this was only meant to be used (and to happen) during migrating from the old format.
                            # The rm won't run below after migration, since root has no ssh key allowing access.
                            err += "mount directory not empty -- login to '#{opts.host}' and manually delete '#{mountpoint(opts.project_id)}'"
                            execute_on
                                host : opts.host
                                timeout : 120
                                user : 'root'
                                command : "rm -rf '#{mountpoint(opts.project_id)}'"
                        else if err.indexOf('filesystem already mounted') != -1  or err.indexOf('cannot unmount') # non-fatal: to be expected if fs mounted/busy already
                            err = undefined
                    cb(err)
        (cb) ->
            dbg("create user")
            create_user
                project_id : opts.project_id
                action     : 'create'
                host       : opts.host
                base_url   : opts.base_url
                chown      : opts.chown
                cb         : cb
        (cb) ->
            dbg("copy over skeleton")
            create_user
                project_id : opts.project_id
                action     : 'skel'
                host       : opts.host
                base_url   : opts.base_url
                chown      : opts.chown
                cb         : cb
        (cb) ->
            dbg("test login")
            execute_on
                host    : opts.host
                timeout : 30
                user    : username(opts.project_id)
                command : "pwd"
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else if output.stdout.indexOf(mountpoint(opts.project_id)) == -1
                        cb("failed to properly mount project")
                    else
                        cb()
    ], opts.cb)

# Current hostname of computer where project is currently opened.
exports.get_current_location = get_current_location = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required      # cb(err, hostname or undefined); undefined if project not opened.
    winston.debug("getting location of #{opts.project_id} from database")
    database.select_one
        table   : 'projects'
        where   : {project_id : opts.project_id}
        json    : ['location']
        columns : ['location']
        cb      : (err, r) ->
            if r?[0]?
                # e.g., r = [{"host":"10.3.1.4","username":"c1f1dc4adbf04fc69878012020a0a829","port":22,"path":"."}]
                if r[0].username != username(opts.project_id)
                    winston.debug("get_current_location - WARNING: project #{opts.project_id} not yet fully migrated")
                    opts.cb(undefined, undefined)
                else
                    cur_loc = r[0]?.host
                    if cur_loc == ""
                        cur_loc = undefined
                    opts.cb(undefined, cur_loc)
            else
                opts.cb(err)


# Open the project on some host, if possible.  First, try the host listed in the location field
# in the database, if it is set.  If it isn't set, try other locations until success, trying
# the ones with the newest snasphot, breaking ties at random.
exports.open_project_somewhere = open_project_somewhere = (opts) ->
    opts = defaults opts,
        project_id : required
        base_url   : ''
        exclude    : undefined  # if project not currently opened, won't open on any host in the list exclude
        prefer     : undefined  # string or array; if given prefer these hosts first, irregardless of their newness.
        cb         : required   # cb(err, host used)

    dbg = (m) -> winston.debug("open_project_somewhere(#{opts.project_id},exclude=#{misc.to_json(opts.exclude)},prefer=#{misc.to_json(opts.prefer)}): #{m}")

    cur_loc   = undefined
    host_used = undefined
    hosts     = undefined
    async.series([
        (cb) ->
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    cur_loc = x
                    cb(err)
        (cb) ->
            if not cur_loc? or (opts.prefer? and (cur_loc not in opts.prefer))
                dbg("no current location or current location not prefered")
                # we'll try all other hosts in the next step
                cb()
            else
                dbg("trying to open at currently set location")
                open_project
                    project_id : opts.project_id
                    host       : cur_loc
                    base_url   : opts.base_url
                    cb         : (err) ->
                        if not err
                            host_used = cur_loc  # success!
                            cb()
                        else
                            m = "error attempting to open on #{cur_loc} -- #{err}"
                            dbg(m)
                            # TODO: to enable automatic project move on fail, we would instead do "cb()".
                            cb(m)
        (cb) ->
            if host_used?  # done?
                cb(); return
            dbg("getting and sorting available hosts")
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    if err
                        cb(err)
                    else
                        # The Math.random() makes it so we randomize the order of the hosts with snapshots that tie.
                        # It's just a simple trick to code something that would otherwise be very awkward.
                        # TODO: This induces some distribution on the set of permutations, but I don't know if it is the
                        # uniform distribution (I only thought for a few seconds).  If not, fix it later.
                        v = ([snaps[0], Math.random(), host] for host, snaps of snapshots when snaps?.length >=1 and host != cur_loc)
                        v.sort()
                        v.reverse()

                        dbg("v = #{misc.to_json(v)}")
                        hosts = (x[2] for x in v)

                        if opts.exclude?
                            hosts = (x for x in hosts when opts.exclude.indexOf(x) == -1)

                        if opts.prefer?
                            if typeof(opts.prefer) == 'string'
                                opts.prefer = [opts.prefer]
                            # move any hosts in the prefer list to the front of the line.
                            hosts = (x for x in hosts when opts.prefer.indexOf(x) != -1).concat( (x for x in hosts when opts.prefer.indexOf(x) == -1) )

                        ## TODO: FOR TESTING -- restrict to Google
                        ##hosts = (x for x in hosts when x.slice(0,4) == '10.3')

                        dbg("hosts = #{misc.to_json(hosts)}")
                        cb()
        (cb) ->
            if host_used?  # done?
                cb(); return
            dbg("trying each possible host until one works -- hosts=#{misc.to_json(hosts)}")
            f = (host, c) ->
                if host_used?
                    c(); return
                dbg("trying to open project on #{host}")
                open_project
                    project_id : opts.project_id
                    host       : host
                    base_url   : opts.base_url
                    cb         : (err) ->
                        if not err
                            dbg("project worked on #{host}")
                            host_used = host
                        else
                            dbg("nonfatal error attempting to open on #{host} -- #{err}")
                        c()

            async.mapSeries(hosts, f, cb)
        (cb) ->
            if host_used? and host_used != cur_loc
                new_loc = {"host":host_used,"username":username(opts.project_id),"port":22,"path":"."}
                dbg("record location in database: #{misc.to_json(new_loc)}")
                database.update
                    table : 'projects'
                    set   : {location:new_loc}
                    json  : ['location']
                    where : {project_id : opts.project_id}
                    cb    : cb
            else
                cb()
    ], (err) ->
        if err
            opts.cb(err)
        else
            if not host_used?
                opts.cb("unable to find any host on which to run #{opts.project_id} -- all failed")
            else
                opts.cb(undefined, host_used)
    )


exports.close_project = close_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined  # defaults to current host, if deployed
        unset_loc  : false      # set location to undefined in the database
        umount     : false      # don't use this -- it causes ZFS deadlock, which requires machine reboots.  Horrible and not needed.
        wait_for_replicate : false  # if true, waits for post-snapshot replication to complete
        cb         : required

    if not opts.host?
        use_current_host(close_project, opts)
        return

    winston.info("close project #{opts.project_id} on #{opts.host}")
    dbg = (m) -> winston.debug("close_project(#{opts.project_id},#{opts.host}): #{m}")

    user = username(opts.project_id)
    async.series([
        (cb) ->
            if opts.wait_for_replicate and opts.unset_loc
                dbg("making a first snapshot and replicating it out, to minimize user inconvenience later")
                snapshot
                    project_id : opts.project_id
                    host       : opts.host
                    force      : true
                    wait_for_replicate      : opts.wait_for_replicate
                    only_if_not_replicating : false
                    cb         : cb
            else
                cb()
        (cb) ->
            dbg("killing all processes")
            create_user
                project_id : opts.project_id
                host       : opts.host
                action     : 'kill'
                timeout    : 30
                cb         : cb
        (cb) ->
            if not opts.umount
                dbg("skipping unmount")
                cb()
            else
                dbg("unmounting filesystem")
                execute_on
                    host    : opts.host
                    timeout : 30
                    command : "sudo zfs set mountpoint=none #{filesystem(opts.project_id)}&&sudo zfs umount #{mountpoint(opts.project_id)}"
                    cb      : (err, output) ->
                        if err
                            if err.indexOf('not currently mounted') != -1 or err.indexOf('not a ZFS filesystem') != -1   # non-fatal: to be expected (due to using both mountpoint setting and umount)
                                err = undefined
                        cb(err)
        (cb) ->
            if not opts.unset_loc
                cb(); return
            dbg("making a snapshot and replicating it out, so we don't have to rollback later")
            snapshot
                project_id : opts.project_id
                host       : opts.host
                force      : true
                wait_for_replicate : opts.wait_for_replicate
                only_if_not_replicating : false
                cb         : cb
        (cb) ->
            dbg("updating project status in database")
            set = {status:'closed'}
            if opts.unset_loc
                dbg("unsetting location in project")
                set.location = undefined
            database.update
                table : 'projects'
                set   : set
                where : {project_id : opts.project_id}
                cb    : cb
    ], opts.cb)

# Close every project on a given host -- useful for putting a node into maintenance
# mode or before a proper shutdown.  NOTE that the defaults here are different than
# for close_project, since this is aimed at maintenance and proper shutdown.
exports.close_all_projects = (opts) ->
    opts = defaults opts,
        host       : required
        unset_loc  : true          # set location to undefined in the database
        wait_for_replicate : true  # make sure that we successfully replicate each project everywhere, or returns an error.
        limit      : 10
        ttl        : undefined   # if given is a time in seconds; any project with last_edited within ttl (or timeout_disabled set) is not killed; this is used when spinning up new hosts.
        cb         : required

    dbg = (m) -> winston.debug("close_all_projects(host:#{opts.host},unset_loc:#{opts.unset_loc}): #{m}")
    errors = {}
    projects = undefined
    async.series([
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'location', 'last_edited', 'timeout_disabled']
                json    : ['location']
                limit   : 1000000   # TODO: stupidly slow
                cb      : (err, result) ->
                    if result?
                        if opts.ttl? and opts.ttl
                            cutoff = misc.mswalltime() - opts.ttl*1000  # cassandra timestamps come back in ms since UTC epoch
                            projects = (x[0] for x in result when x[1]?.host == opts.host and (not x[3] and x[2] < cutoff))
                        else
                            projects = (x[0] for x in result when x[1]?.host == opts.host)

                    dbg("got #{projects.length} projects")
                    cb(err)
        (cb) ->
            dbg("closing projects...")
            cnt = 0
            f = (project_id, cb) ->
                cnt += 1
                dbg("**************\nclosing project #{cnt}/#{projects.length}\n**********")
                close_project
                    project_id : project_id
                    host       : opts.host
                    unset_loc  : opts.unset_loc
                    wait_for_replicate : opts.wait_for_replicate
                    cb         : (err) ->
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) ->
        if err
            errors['err'] = err
        if misc.len(errors) == 0
            opts.cb()
        else
            opts.cb(errors)
    )

exports.emergency_delocate_projects = (opts) ->
    opts = defaults opts,
        host       : required
        limit      : 10
        cb         : required
    dbg = (m) -> winston.debug("emergency_delocate_projects(host:#{opts.host}): #{m}")
    projects = undefined
    async.series([
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'location', 'last_replication_error']
                json    : ['location']
                limit   : 1000000   # TODO: stupidly slow
                cb      : (err, result) ->
                    if result?
                        good_projects = (x[0] for x in result when x[1]?.host == opts.host and not x[2]?)
                        bad_projects  = (x[0] for x in result when x[1]?.host == opts.host and x[2]?)
                        projects = {good:good_projects, bad:bad_projects}
                    dbg("got #{good_projects.length} good projects and #{bad_projects.length} bad projects")
                    cb(err)
    ], (err) ->
        if err
            opts.cb(err)
        else
            opts.cb(undefined, projects)
    )


# Call "close_project"  on all projects that have been open for
# more than ttl seconds, where opened means that location is set.
exports.close_stale_projects = (opts) ->
    opts = defaults opts,
        ttl     : 60*60*24  # time in seconds (up to a week)
        dry_run : true      # don't actually close the projects
        limit   : 2         # number of projects to close simultaneously.
        interval: 3000      # space out the project closing to give server a chance to do other things.
        unset_loc : false   # whether to unset the location field in the database after closing the project; if done, then projects will resume later on a random host (which is usually *NOT* desirable).
        cb      : required

    dbg = (m) -> winston.debug("close_stale_projects(...): #{m}")
    dbg()
    projects = undefined
    async.series([
        (cb) ->
            dbg("querying database...")
            database.stale_projects
                ttl : opts.ttl
                cb  : (err, v) ->
                    projects = v
                    cb(err)
        (cb) ->
            f = (x, cb) ->
                project_id = x.project_id
                host       = x.location.host
                dbg("close stale project #{project_id} at #{host}")
                if opts.dry_run
                    cb()
                else
                    # still stale -- could be quite a delay between getting list of stale projects and f getting called!
                    database.select_one
                        table   : 'projects'
                        columns : ['last_edited']
                        where   : {project_id : project_id}
                        cb      : (err, result) ->
                            if err
                                cb(err); return
                            last_edited = result[0]
                            if misc.mswalltime() - opts.ttl*1000 < last_edited
                                dbg("not killing, since they have edited #{project_id} in the meantime.")
                                cb(); return
                            close_project
                                project_id : project_id
                                host       : host
                                unset_loc  : opts.unset_loc
                                cb         : (err) ->
                                    if err or not opts.interval
                                        cb(err)
                                    else
                                        setTimeout(cb, opts.interval)
            async.eachLimit(projects, opts.limit, f, cb)
    ], opts.cb)


# Creates project with given id on exactly one (random) available host, and
# returns that host.  This also snapshots the projects, which puts it in the
# database.  It does not replicate the project out to all hosts.
exports.create_project = create_project = (opts) ->
    opts = defaults opts,
        project_id : required
        quota      : '5G'
        base_url   : ''
        chown      : false       # if true, chown files in filesystem (throw-away: used only for migration from old)
        exclude    : []          # hosts to not use
        unset_loc  : false
        cb         : required    # cb(err, host)   where host=ip address of a machine that has the project.

    dbg = (m) -> winston.debug("create_project(#{opts.project_id}): #{m}")

    dbg("check if the project filesystem already exists somewhere")
    get_hosts
        project_id : opts.project_id
        cb         : (err, hosts) ->
            if err
                opts.cb(err); return

            if hosts.length > 0
                if opts.exclude.length > 0
                    hosts = (h for h in hosts when opts.exclude.indexOf(h) == -1)
                if hosts.length > 0
                    opts.cb(undefined, hosts[0])
                    return

            dbg("according to DB, the project filesystem doesn't exist anywhere (allowed), so let's make it somewhere...")
            v = locations(project_id:opts.project_id)
            if v.length == 0
                opts.cb("hashrings not yet initialized")
                return
            locs = _.flatten(v)

            if opts.exclude.length > 0
                locs = (h for h in locs when opts.exclude.indexOf(h) == -1)

            dbg("try each host in locs (in random order) until one works")
            done       = false
            fs         = filesystem(opts.project_id)
            host       = undefined
            mounted_fs = false
            errors     = {}

            f = (i, cb) ->  # try ith one (in random order)!
                if done
                    cb(); return
                host = misc.random_choice(locs)
                dbg("try to allocate project on #{host} (this is attempt #{i+1})")
                misc.remove(locs, host)
                async.series([
                    (c) ->
                        dbg("creating ZFS filesystem")
                        execute_on
                            host    : host
                            command : "sudo zfs create #{fs} ; sudo zfs set snapdir=hidden #{fs} ; sudo zfs set quota=#{opts.quota} #{fs} ; sudo zfs set mountpoint=#{mountpoint(opts.project_id)} #{fs}"
                            timeout : 30
                            cb      : (err, output) ->
                                if output?.stderr?.indexOf('dataset already exists') != -1
                                    # non-fatal
                                    err = undefined
                                if not err
                                    mounted_fs = true
                                c(err)
                    (c) ->
                        dbg("created fs successfully; now create user")
                        create_user
                            project_id : opts.project_id
                            host       : host
                            action     : 'create'
                            chown      : opts.chown
                            timeout    : 30
                            cb         : c
                    (c) ->
                        dbg("copy over the template files, e.g., .sagemathcloud")
                        create_user
                            project_id : opts.project_id
                            action     : 'skel'
                            host       : host
                            timeout    : 30
                            cb         : c
                    (c) ->
                        dbg("snapshot the project")
                        snapshot
                            project_id : opts.project_id
                            host       : host
                            force      : true
                            only_if_not_replicating : false
                            cb         : c
                ], (err) ->
                    async.series([
                        (c) ->
                            if mounted_fs
                                # unmount the project on this host (even if something along the way failed above)
                                close_project
                                    project_id : opts.project_id
                                    host       : host
                                    unset_loc  : opts.unset_loc
                                    cb         : (ignore) -> c()
                            else
                                c()
                        (c) ->
                            if err
                                dbg("error #{host} -- #{err}")
                                errors[host] = err
                            else
                                done = true
                            c()
                    ], () -> cb())
                )

            async.mapSeries [0...locs.length], f, () ->
                if done
                    opts.cb(undefined, host)
                else
                    if misc.len(errors) == 0
                        opts.cb()
                    else
                        opts.cb(errors)






######################
# Managing Projects
######################

# get quota from database
exports.get_quota = get_quota = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required  # cb(err, quota in gigabytes in db)
    database.select_one
        table   : 'projects'
        where   : {project_id : opts.project_id}
        columns : ['quota_zfs']
        cb      : (err, result) ->
            if err
                opts.cb(err); return
            winston.debug("get_quota: result=#{result}")
            if not result?
                # no data in db, so try to compute and store in db (i.e., "heal").
                quota
                    project_id : opts.project_id
                    cb         : (err, r) ->
                        opts.cb(err, r?/1073741824)
            else
                opts.cb(undefined, result/1073741824)   # 2^30, since ZFS uses base 2 not SI for "GB".


exports.quota = quota = (opts) ->
    opts = defaults opts,
        project_id : required
        size       : undefined    # if given, first sets the quota
        host       : undefined    # if given, only operate on the given host; otherwise operating on all hosts of the project (and save in database if setting)
        cb         : undefined    # cb(err, quota in bytes)
    winston.info("quota -- #{misc.to_json(opts)}")

    dbg = (m) -> winston.debug("quota (#{opts.project_id}): #{m}")

    if not opts.host?
        hosts   = undefined
        results = undefined
        size    = undefined
        async.series([
            (cb) ->
                dbg("get list of hosts")
                get_hosts
                    project_id : opts.project_id
                    cb         : (err, h) ->
                        hosts = h
                        if not err and hosts.length == 0
                            err = 'no hosts -- quota not defined'
                        cb(err)
            (cb) ->
                dbg("#{if opts.size then 'set' else 'compute'} quota on all hosts: #{misc.to_json(hosts)}")
                f = (host, c) ->
                    quota
                        project_id : opts.project_id
                        size       : opts.size
                        host       : host
                        cb         : c
                async.map hosts, f, (err, r) ->
                    results = r
                    cb(err)
            (cb) ->
                if opts.size?
                    size = opts.size
                    cb()
                    return
                dbg("checking that all quotas (=#{misc.to_json(results)} consistent...")
                size = misc.max(results)
                if misc.min(results) == size
                    cb()
                else
                    winston.info("quota (#{opts.project_id}): self heal -- quota discrepancy, now self healing to max size (=#{size})")
                    f = (i, c) ->
                        host = hosts[i]
                        if results[i] >= size
                            # already maximal, so no need to set it
                            c()
                        else
                            quota
                                project_id : opts.project_id
                                size       : size
                                host       : host
                                cb         : c
                    async.map([0...hosts.length], f, cb)
            (cb) ->
                dbg("saving in database")
                database.update
                    table : 'projects'
                    where : {project_id : opts.project_id}
                    set   : {'quota_zfs':"#{size}"}
                    cb    : cb
        ], (err) ->
            opts.cb?(err, size)
        )
        return

    if not opts.size?
        dbg("getting quota on #{opts.host}")
        execute_on
            host       : opts.host
            command    : "sudo zfs get -pH -o value quota #{filesystem(opts.project_id)}"
            timeout    : 60
            cb         : (err, output) ->
                if not err
                    size = output.stdout
                    size = parseInt(size)
                opts.cb?(err, size)
    else
        dbg("setting quota on #{opts.host} to #{opts.size}")
        execute_on
            host       : opts.host
            command    : "sudo zfs set quota=#{opts.size} #{filesystem(opts.project_id)}"
            timeout    : 60
            cb         : (err, output) ->
                opts.cb?(err, opts.size)

# Find a host for this project that has the most recent snapshot
exports.updated_host = updated_host = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required   # cb(err, hostname)

    get_snapshots
        project_id : opts.project_id
        cb         : (err, snapshots) ->
            if not err and snapshots.length == 0
                err = "project doesn't have any data"
            if err
                opts.cb(err)
                return
            v = ([val[0],host] for host, val of snapshots)
            v.sort()
            host = v[v.length-1][1]
            opts.cb(undefined, host)


exports.get_usage = get_usage = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined  # if not given, choose any node with newest snapshot
        cb         : required   # cb(err, {avail:?, used:?, usedsnap:?})  # ? are strings like '17M' or '13G' as output by zfs.  NOT bytes.
                                # on success, the quota field in the database for the project is set as well
    usage = undefined
    dbg = (m) -> winston.debug("get_usage (#{opts.project_id}): #{m}")

    async.series([
        (cb) ->
            if opts.host?
                cb()
            else
                dbg("determine host")
                updated_host
                    project_id : opts.project_id
                    cb         : (err, host) ->
                        opts.host = host
                        cb(err)
        (cb) ->
            dbg("getting usage on #{opts.host}")
            execute_on
                host    : opts.host
                command : "sudo zfs list -H -o avail,used,usedsnap #{filesystem(opts.project_id)}"
                timeout    : 60
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else
                        v = output.stdout.split('\t')
                        usage = {avail:v[0].trim(), used:v[1].trim(), usedsnap:v[2].trim()}
                        cb()
        (cb) ->
            dbg("updating database with usage = #{misc.to_json(usage)}")
            database.update
                table : 'projects'
                where : {project_id : opts.project_id}
                set   : {'usage_zfs':usage}
                json  : ['usage_zfs']
                cb    : cb
    ], (err) -> opts.cb?(err, usage))





######################
# Snapshotting
######################

# set opts.host to the currently deployed host, then do f(opts).
# If project not currently deployed, do nothing.
use_current_host = (f, opts) ->
    if opts.host?
        throw("BUG! -- should never call use_best_host with host already set -- infinite recurssion")
    get_current_location
        project_id : opts.project_id
        cb         : (err, host) ->
            if err
                opts.cb?(err)
            else if host?
                opts.host = host
                f(opts)
            else
                # no current host -- nothing to do
                opts.cb?()

# Set opts.host to the best host, where best = currently deployed, or if project isn't deployed,
# it means a randomly selected host with the newest snapshot.  Then does f(opts).
use_best_host = (f, opts) ->
    dbg = (m) -> winston.debug("use_best_host(#{misc.to_json(opts)}): #{m}")
    dbg()

    if opts.host?
        throw("BUG! -- should never call use_best_host with host already set -- infinite recurssion")
    snapshots = undefined
    async.series([
        (cb) ->
            get_current_location
                project_id : opts.project_id
                cb         : (err, host) ->
                    if err
                        cb(err)
                    else if host?
                        dbg("using currently deployed host")
                        opts.host = host
                        cb()
                    else
                        dbg("no current deployed host -- choose best one")
                        cb()
        (cb) ->
            if opts.host?
                cb(); return
            get_snapshots
                project_id : opts.project_id
                cb         : (err, x) ->
                    snapshots = x
                    cb(err)
        (cb) ->
            if opts.host?
                cb(); return
            # The Math.random() makes it so we randomize the order of the hosts with snapshots that tie.
            # It's just a simple trick to code something that would otherwise be very awkward.
            # TODO: This induces some distribution on the set of permutations, but I don't know if it is the
            # uniform distribution (I only thought for a few seconds).  If not, fix it later.
            v = ([snaps[0], Math.random(), host] for host, snaps of snapshots when snaps?.length >=1 and host != cur_loc)
            v.sort()
            v.reverse()
            hosts = (x[2] for x in v)

            host = hosts[0]
            if not host?
                cb("no available host")
            else
                dbg("using host = #{misc.to_json(host)}")
                opts.host = host
                cb()
    ], (err) ->
        if err
            opts.cb(err)
        else if opts.host?
            f(opts)
        else
            opts.cb("no available host")
    )

# Compute the time of the "probable last snapshot" in seconds since the epoch in UTC,
# or undefined if there are no snapshots.
exports.last_snapshot = last_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined    # cb(err, utc_seconds_epoch)
    database.select_one
        table      : 'projects'
        where      : {project_id : opts.project_id}
        columns    : ['last_snapshot']
        cb         : (err, r) ->
            if err
                opts.cb(err)
            else
                if not r? or not r[0]?
                    opts.cb(undefined, undefined)
                else
                    opts.cb(undefined, r[0]/1000)


# Make a snapshot of a given project on a given host and record
# this in the database; also record in the database the list of (interesting) files
# that changed in this snapshot (from the last one), according to diff.
exports.snapshot = snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined    # if not given, use current location (if deployed; if not deployed does nothing)
        tag        : undefined
        force      : false        # if false (the default), don't make the snapshot if diff outputs empty list of files
                                  # (note that diff ignores ~/.*), and also don't make a snapshot if one was made within
        min_snapshot_interval_s : 90    # opts.min_snapshot_interval_s seconds.
        wait_for_replicate : false  # wait until replication has finished *and* returns error if any replication fails.

        only_if_not_replicating : true  # won't make snapshot if currently replicating -- snapshotting during replication would cause major problems during a move.
        cb         : undefined

    if not opts.host?
        use_current_host(snapshot, opts)
        return

    dbg = (m) -> winston.debug("snapshot(#{opts.project_id},#{opts.host},force=#{opts.force}): #{m}")
    dbg()

    if opts.tag?
        tag = '-' + opts.tag
    else
        tag = ''
    now = misc.to_iso(new Date())
    name = filesystem(opts.project_id) + '@' + now + tag
    async.series([
        (cb) ->
            if opts.only_if_not_replicating
                is_currently_replicating
                    project_id : opts.project_id
                    cb         : (err, is_replicating) ->
                        if is_replicating
                            cb('delay')
                        else
                            cb()
            else
                cb()
        (cb) ->
            if opts.force
                cb()
            else
                dbg("get last mod time")
                database.select_one
                    table      : 'projects'
                    where      : {project_id : opts.project_id}
                    columns    : ['last_snapshot']
                    cb         : (err, r) ->
                        if err
                            cb(err)
                        else
                            x = r[0]
                            if not x?
                                cb()
                            else
                                d = new Date(x)
                                time_since_s = (new Date() - d)/1000
                                if time_since_s < opts.min_snapshot_interval_s
                                    cb('delay')
                                else
                                    cb()
        (cb) ->
            if opts.force
                cb(); return
            dbg("get the diff")
            diff
                project_id : opts.project_id
                host       : opts.host
                cb         : (err, modified_files) ->
                    if err
                        cb(err); return
                    if modified_files.length == 0
                        cb('delay')
                    else
                        cb()
        (cb) ->
            dbg("make snapshot")
            execute_on
                host    : opts.host
                command : "sudo zfs snapshot #{name}"
                timeout : 600
                cb      : cb
        (cb) ->
            dbg("record in database that we made a snapshot")
            record_snapshot_in_db
                project_id     : opts.project_id
                host           : opts.host
                name           : now + tag
                cb             : cb
        (cb) ->
            dbg("record when we made this recent snapshot (might be slightly off if multiple snapshots at once)")
            database.update
                table : 'projects'
                where : {project_id : opts.project_id}
                set   : {last_snapshot : now}
                cb    : cb
        (cb) ->
            if opts.wait_for_replicate
                dbg("replicate -- holding up return")
                replicate
                    project_id : opts.project_id
                    cb         : cb
            else
                dbg("replicate in the background (returning anyways)")
                cb()
                replicate
                    project_id : opts.project_id
                    cb         : (err) -> # ignore
    ], (err) ->
        if err == 'delay'
            opts.cb?()
        else
            opts.cb?(err)
    )

exports.get_snapshots = get_snapshots = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined
        cb         : required
    database.select_one
        table   : 'projects'
        columns : ['locations']
        where   : {project_id : opts.project_id}
        cb      : (err, result) ->
            if err
                opts.cb(err)
                return
            result = result[0]
            if opts.host?
                if not result?
                    opts.cb(undefined, [])
                else
                    v = result[opts.host]
                    if v?
                        v = JSON.parse(v)
                    else
                        v = []
                    opts.cb(undefined, v)
            else
                ans = {}
                for k, v of result
                    ans[k] = JSON.parse(v)
                opts.cb(undefined, ans)

# status_fast: get status information about the storage, location, quota, etc., of a project
# from the database.  This function will not do any potentially slow/expensive ZFS commands.
exports.status_fast = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    dbg = (m) -> winston.debug("status_fast(#{opts.project_id}): #{m}")
    ans = undefined
    async.series([
        (cb) ->
            database.select_one
                table   : 'projects'
                where   : {project_id : opts.project_id}
                columns : ['location', 'locations', 'replicating']
                json    : ['location']
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        v = {}
                        for k,z of result[1]
                            v[k] = {newest_snapshot:misc.from_json(z)?[0], datacenter:datacenter_to_desc[host_to_datacenter[k]]}
                        ans =
                            current_location    : result[0]?.host    # the current location of the project (ip address or undefined)
                            locations           : v                  # mapping from addresses to info about (time, location, status)
                            replicating         : result[2]          # whether or not project is being replicated right now
                            canonical_locations : _.flatten(locations(project_id:opts.project_id))   # the locations determined by consistent hashing
                        cb()
        (cb) ->
            database.compute_status
                cb : (err, compute) ->
                    if err
                        cb(err)
                    else
                        v = ans.locations
                        #console.log(compute)
                        #console.log(v)
                        for c in compute
                            if c.host == '127.0.0.1' and ans.current_location == 'localhost' # special case for dev vm
                                c.host = 'localhost'
                            if v[c.host]?
                                v[c.host].status = c
                        cb()
        ], (err) -> opts.cb(err, ans))

# for interactive use
exports.status = (project_id, update) ->
    r = "project_id: #{project_id}\n"
    cur_loc = undefined
    async.series([
        (cb) ->
            get_current_location
                project_id : project_id
                cb         : (err, host) ->
                    r += "current location: #{host}\n"
                    cb()
        (cb) ->
            get_quota
                project_id : project_id
                cb         : (err, quota) ->
                    r += "quota: #{quota}GB\n"
                    cb()
        (cb) ->
            if update
                repair_snapshots_in_db
                    project_id : project_id
                    cb         : (err) -> cb()
            else
                cb()
        (cb) ->
            get_usage
                project_id : project_id
                cb         : (err, usage) ->
                    r += "usage: #{misc.to_json(usage)}\n"
                    cb()
        (cb) ->
            is_currently_replicating
                project_id : project_id
                cb         : (err, is_replicating) ->
                    r += "currently replicating: #{is_replicating}\n"
                    cb()
        (cb) ->
            database.select_one
                table   : 'projects'
                where   : {project_id : project_id}
                columns : ['last_replication_error']
                cb      : (err, result) ->
                    r += "last_replication_error: "
                    if err
                        r += "(error getting -- #{err})"
                    else
                        r += result
                    r += '\n'
                    cb()
        (cb) ->
            get_current_location
                project_id : project_id
                cb         : (err, x) ->
                    cur_loc = x
                    r += "current location: #{cur_loc}\n"
                    cb()
        (cb) ->
            get_snapshots
                project_id : project_id
                cb         : (err, s) ->
                    r += 'snapshots:\n'
                    if err
                        r += err
                    else
                        dc = 0
                        v = locations(project_id:project_id)
                        if v.length == 0
                            cb("hashrings not yet initialized")
                            return
                        active = s[cur_loc]?[0]
                        for grp in v
                            for a in grp
                                if active?
                                    if s[a]?[0] != active
                                        r += "(old) "
                                    else
                                        r += "      "
                                r += "\t#{a} (dc #{dc}): #{s[a]?[0]}, #{s[a]?[1]}, #{s[a]?[2]}, #{s[a]?[3]}, ...\n"
                            dc += 1
                            r += '\n'
                        v = _.flatten(v)
                        for a in misc.keys(s)
                            if v.indexOf(a) == -1
                                r += "\t\t#{a} (extra): #{s[a][0]}, #{s[a][1]}, #{s[a][2]}, #{s[a][3]}, ...\n"
                    cb()
    ], (err) ->
        console.log("-----------------------\n#{r}")
        if err
            console.log("ERROR: #{err}")
    )


# Compute list of all hosts that actually have some version of the project.
# WARNING: returns an empty list if the project doesn't exist in the database!  *NOT* an error.
exports.get_hosts = get_hosts = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required  # cb(err, [list of hosts])
    get_snapshots
        project_id : opts.project_id
        cb         : (err, snapshots) ->
            if err
                opts.cb(err)
            else
                opts.cb(undefined, (host for host, snaps of snapshots when snaps?.length > 0))

exports.record_snapshot_in_db = record_snapshot_in_db = (opts) ->
    opts = defaults opts,
        project_id     : required
        host           : required
        name           : required
        remove         : false
        cb             : undefined

    dbg = (m) -> winston.debug("record_snapshot_in_db(#{opts.project_id},#{opts.host},#{opts.name}): #{m}")

    new_snap_list = undefined
    async.series([
        (cb) ->
            dbg("get snapshots")
            get_snapshots
                project_id : opts.project_id
                host       : opts.host
                cb         : (err, v) ->
                    if err
                        cb(err)
                    else
                        if opts.remove
                            try
                                misc.remove(v, opts.name)
                            catch error
                                # snapshot not in db anymore; nothing to do.
                                cb()
                                return
                        else
                            v.unshift(opts.name)
                        new_snap_list = v
                        cb()
        (cb) ->
            dbg("set new snapshots list")
            if not new_snap_list?
                cb(); return
            set_snapshots_in_db
                project_id : opts.project_id
                host       : opts.host
                snapshots  : new_snap_list
                cb         : cb
    ], (err) -> opts.cb?(err))

# Set the list of snapshots for a given project.  The
# input list is assumed sorted in reverse order (so newest first).
set_snapshots_in_db = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        snapshots  : required
        cb         : undefined
    winston.debug("setting snapshots for #{opts.project_id} to #{misc.to_json(opts.snapshots).slice(0,100)}...")

    x = "locations['#{opts.host}']"

    if opts.snapshots.length == 0
        # deleting it
        database.delete
            thing : x
            table : 'projects'
            where : {project_id : opts.project_id}
            cb    : opts.cb
        return

    v = {}
    v[x] = JSON.stringify(opts.snapshots)
    database.update
        table : 'projects'
        where : {project_id : opts.project_id}
        set   : v
        cb    : opts.cb

# Connect to host, find out the snapshots, and put the definitely
# correct ordered (newest first) list in the database.
exports.repair_snapshots_in_db = repair_snapshots_in_db = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined   # use "all" for **all** possible hosts on the whole cluster
        cb         : undefined
    if not opts.host? or opts.host == 'all'
        hosts = undefined
        async.series([
            (cb) ->
                if opts.host == 'all'
                    hosts = all_hosts
                else
                    v = locations(project_id:opts.project_id)
                    if v.length == 0
                        cb("hashrings not yet initialized")
                        return
                    hosts = _.flatten(v)
                cb()
            (cb) ->
                f = (host, cb) ->
                    repair_snapshots_in_db
                        project_id : opts.project_id
                        host       : host
                        cb         : cb
                async.map(hosts, f, cb)
        ], (err) -> opts.cb?(err))
        return

    # other case -- a single host.

    snapshots = []
    f = filesystem(opts.project_id)
    async.series([
        (cb) ->
            # 1. get list of snapshots
            execute_on
                host    : opts.host
                command : "sudo zfs list -r -t snapshot -o name -s creation #{f}"
                timeout : 300
                cb      : (err, output) ->
                    if err
                        if output?.stderr? and output.stderr.indexOf('not exist') != -1
                            # entire project deleted from this host.
                            winston.debug("filesystem was deleted from #{opts.host}")
                            cb()
                        else
                            cb(err)
                    else
                        n = f.length
                        for x in output.stdout.split('\n')
                            x = x.slice(n+1)
                            if x
                                snapshots.unshift(x)
                        cb()
        (cb) ->
            # 2. put in database
            set_snapshots_in_db
                project_id : opts.project_id
                host       : opts.host
                snapshots  : snapshots
                cb         : cb
    ], (err) -> opts.cb?(err))

# Rollback project to newest (or a particular) snapshot
exports.rollback_to_snapshot = rollback_to_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        snapshot   : undefined  # if not given, use most recent one
        host       : required   # host on which to do all this
        cb         : undefined

    dbg = (m) -> winston.debug("rollback_to_snapshot(#{opts.project_id},#{opts.host},#{opts.snapshot}): #{m}")
    snapshot_name = opts.snapshot
    f = filesystem(opts.project_id)

    async.series([
        (cb) ->
            if snapshot_name?
                if snapshot_name.indexOf('@') == -1
                    snapshot_name = opts.project_id + "@" + snapshot_name
                cb()
            else
                dbg("get most recent snapshot name")
                # We get the list directly instead of using the database
                # so that we are most likely to have the
                # correct result, even if this is slightly slower than a db lookup
                execute_on
                    host    : opts.host
                    command : "sudo zfs list -r -t snapshot -o name -s creation #{f} | tail -1"
                    timeout : 300
                    cb      : (err, output) ->
                        if err
                            cb(err)
                        else
                            snapshot_name = output.stdout.trim()
                            cb()
        (cb) ->
            dbg("rollback to #{snapshot_name}")
            execute_on
                host    : opts.host
                command : "sudo zfs rollback #{snapshot_name}"
                timeout : 300
                cb      : cb
    ], (err) -> opts.cb?(err))


# Destroy snapshot of a given project on one or all hosts that have that snapshot,
# according to the database.  Updates the database to reflect success.
exports.destroy_snapshot = destroy_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        name       : required      # typically 'timestamp[-tag]' but could be anything... BUT DON'T!
        host       : undefined     # if not given, attempts to delete snapshot on all hosts
        cb         : undefined

    if not opts.host?
        get_snapshots
            project_id : opts.project_id
            cb         : (err, snapshots) ->
                if err
                    opts.cb?(err)
                else
                    f = (host, cb) ->
                        destroy_snapshot
                            project_id : opts.project_id
                            name       : opts.name
                            host       : host
                            cb         : cb
                    v = (k for k, s of snapshots when s.indexOf(opts.name) != -1)
                    async.each(v, f, (err) -> opts.cb?(err))
        return

    async.series([
        (cb) ->
            # 1. delete snapshot
            execute_on
                host    : opts.host
                command : "sudo zfs destroy #{filesystem(opts.project_id)}@#{opts.name}"
                timeout : 600
                cb      : (err, output) ->
                    if err
                        if output?.stderr? and output.stderr.indexOf('could not find any snapshots to destroy')
                            err = undefined
                    cb(err)
        (cb) ->
            # 2. success -- so record in database that snapshot was *deleted*
            record_snapshot_in_db
                project_id : opts.project_id
                host       : opts.host
                name       : opts.name
                remove     : true
                cb         : cb
    ], (err) -> opts.cb?(err))


# WARNING: this function is very, very, very SLOW -- often 15-30 seconds, easily.
# Hence it is really not suitable to use for anything realtime.
exports.zfs_diff = zfs_diff = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined   # undefined = currently deployed location; if not deployed, chooses one
        snapshot1  : required
        snapshot2  : undefined   # if undefined, compares with live filesystem
                                 # when defined, compares two diffs, which may be be VERY slow (e.g., 30 seconds) if
                                 # info is not available in the database.
        timeout    : 300
        cb         : required    # cb(err, list of filenames)

    dbg = (m) -> winston.debug("diff(#{misc.to_json(opts)}): #{m}")

    if not opts.host?
        use_best_host(zfs_diff, opts)
        return

    fs = filesystem(opts.project_id)
    two = if opts.snapshot2? then "#{fs}@#{opts.snapshot1}" else fs

    execute_on
        host    : opts.host
        command : "sudo zfs diff -H #{fs}@#{opts.snapshot1} #{two}"
        timeout : opts.timeout
        cb      : (err, output) ->
            if err
                opts.cb(err)
            else
                n = mountpoint(opts.project_id).length + 1
                a = []
                for h in output.stdout.split('\n')
                    v = h.split('\t')[1]
                    if v?
                        a.push(v.slice(n))
                opts.cb(undefined, a)


# Returns a list of files/paths that changed between live and the most recent snapshot.
# If host is given, it is treated as live.
# Returns empty list if project not deployed.
exports.diff = diff = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined
        timeout    : 180
        cb         : required    # cb(err, list of filenames)

    host = opts.host
    v = []
    async.series([
        (cb) ->
            if host?
                cb()
            else
                get_current_location
                    project_id : opts.project_id
                    cb         : (err, _host) ->
                        if err
                            cb(err)
                        else
                            host = host
                            cb()
        (cb) ->
            if not host?
                cb(); return
            # use find command, which is thousands of times faster than "zfs diff".
            execute_on
                host    : host
                user    : username(opts.project_id)
                command : "find . -xdev -newermt \"`ls -1 ~/.zfs/snapshot|tail -1 | sed 's/T/ /g'`\" | grep -v '^./\\.'"
                timeout : opts.timeout  # this should be really fast
                cb      : (err, output) ->
                    if err and output?.stderr == ''
                        # if the list is empty, grep yields a nonzero error code.
                        err = undefined
                    winston.debug("#{err}, #{misc.to_json(output)}")
                    if err
                        cb(err)
                    else
                        for h in output.stdout.split('\n')
                            a = h.slice(2)
                            if a
                                v.push(a)
                        cb()
        ], (err) -> opts.cb(err, v))


exports.snapshot_listing = snapshot_listing = (opts) ->
    opts = defaults opts,
        project_id      : required
        timezone_offset : 0   # difference in minutes:  UTC - local_time
        path            : ''  # '' or a day in the format '2013-12-20'
        host            : undefined
        cb              : opts.cb   # array of days when path=''
                                    # array of {utc:..., local:...} when path!=''.

    dbg = (m) -> winston.debug("snapshot_listing(#{opts.project_id}): #{m}")
    dbg(misc.to_json(opts))

    if not opts.host?
        dbg("use current host")
        use_current_host(snapshot_listing, opts)
        return

    snaps = (cb) ->
        get_snapshots
            project_id : opts.project_id
            host       : opts.host
            cb         : (err, snapshots) ->
                if err
                    cb(err)
                else
                    cb(undefined, {utc:x, local:new Date( (new Date(x+"+0000")) - opts.timezone_offset*60*1000)} for x in snapshots)

    if opts.path.length<10
        dbg("sorted list of unique days in local time, but as a file listing.")
        snaps (err,s) ->
            if err
                opts.cb(err); return
            s = (x.local.toISOString().slice(0,10) for x in s)
            s = _.uniq(s)
            dbg("result=#{misc.to_json(s)}")
            opts.cb(undefined, s)
    else if opts.path.length == 10
        dbg("snapshots for a particular day in local time")
        snaps (err,s) ->
            if err
                opts.cb(err); return
            t = []
            for x in s
                z = x.local.toISOString().slice(0,19)
                if z.slice(0,10) == opts.path
                    t.push({utc:x.utc, local:z.slice(11)})
            dbg("result=#{misc.to_json(t)}")
            opts.cb(undefined, t)
    else
        opts.cb("not implemented")



######################
# Replication
######################

hashrings = {}
topology = undefined
all_hosts = []
host_to_datacenter = {}
datacenter_to_desc = {'0':"uw-padelford", '1':"uw-4545", '2':"google-us-central1-a"}
exports.init_hashrings = init_hashrings = (cb) ->
    database.select
        table   : 'storage_topology'
        columns : ['data_center', 'host', 'vnodes']
        cb      : (err, results) ->
            if err
                cb?(err); return
            init_hashrings_2(results, cb)

init_hashrings_2 = (results, cb) ->
    topology = {}
    for r in results
        datacenter = r[0]; host = r[1]; vnodes = r[2]
        if not topology[datacenter]?
            topology[datacenter] = {}
        topology[datacenter][host] = {vnodes:vnodes}
        all_hosts.push(host)
        host_to_datacenter[host] = datacenter
    winston.debug(misc.to_json(topology))
    hashrings = {}
    for dc, obj of topology
        hashrings[dc] = new HashRing(obj)
    cb?()

# TODO -- hard coding results from above so backup node doesn't need DB access yet!
exports.init2 = (cb) ->
    results = [["0","10.1.1.4",256],["0","10.1.2.4",256],["0","10.1.3.4",256],["0","10.1.4.4",256],["0","10.1.5.4",256],["0","10.1.6.4",256],["0","10.1.7.4",256],["2","10.3.1.4",256],["2","10.3.2.4",256],["2","10.3.3.4",256],["2","10.3.4.4",256],["1","10.1.10.4",256],["1","10.1.11.4",256],["1","10.1.12.4",256],["1","10.1.13.4",256],["1","10.1.14.4",256],["1","10.1.15.4",256],["1","10.1.16.4",256],["1","10.1.17.4",256],["1","10.1.18.4",256],["1","10.1.19.4",256],["1","10.1.20.4",256],["1","10.1.21.4",256]]
    init_hashrings_2(results, cb)

exports.locations = locations = (opts) ->
    opts = defaults opts,
        project_id : required
        number     : 1        # number per data center to return

    return (ring.range(opts.project_id, opts.number) for dc, ring of hashrings)

is_currently_replicating = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    database.select_one
        table   : 'projects'
        where   : {project_id : opts.project_id}
        columns : ['replicating']
        cb      : (err, r) ->
            opts.cb(err, r?[0])

# Replicate = attempt to make it so that the newest snapshot of the project
# is available on all copies of the filesystem.
# This code right now assumes all snapshots are of the form "timestamp[-tag]".
exports.replicate = replicate = (opts) ->
    opts = defaults opts,
        project_id    : required
        repair_before : false
        cb            : undefined

    dbg = (m) -> winston.debug("replicate (#{opts.project_id}): #{m}")
    snaps   = undefined
    source  = undefined

    targets = locations(project_id:opts.project_id)
    dbg("targets = #{misc.to_json(targets)}")
    if targets.length == 0
        opts.cb("hashrings not yet initialized")
        return

    num_replicas = targets[0].length

    snapshots = undefined

    versions = []   # will be list {host:?, version:?} of out-of-date objs, grouped by data center.

    new_project = false
    clear_replicating_lock = false
    errors = {}

    lock_enabled = false
    renew_lock = (cb) ->
        dbg("renew_lock: lock_enabled=#{lock_enabled}")
        if not lock_enabled
            cb?(); return

        dbg("update replication lock")
        clear_replicating_lock = true
        database.update
            table : 'projects'
            ttl   : 180   # seconds
            where : {project_id : opts.project_id}
            set   : {'replicating': true}
            cb    : (err) ->
                if lock_enabled
                    setTimeout(renew_lock, 120*1000) # *1000 since ms
                cb?(err)

    cur_loc = undefined # current location

    async.series([
        (cb) ->
            dbg("check for lock")
            is_currently_replicating
                project_id : opts.project_id
                cb         : (err, is_replicating) ->
                    if err
                        cb(err)
                    else if is_replicating
                        errors = 'already replicating'
                        cb(true)
                    else
                        lock_enabled = true
                        renew_lock(cb)
        (cb) ->
            # TODO: maybe remove this when things are running really smoothly. -- it's pretty fast but maybe doesn't scale longterm.
            if opts.repair_before
                dbg("repair snapshots before replication, just in case")
                repair_snapshots_in_db
                    project_id : opts.project_id
                    cb         : (ignore) -> cb()
            else
                cb()
        (cb) ->
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    cur_loc = x
                    cb(err)
        (cb) ->
            dbg("determine information about all known snapshots")
            # Also find the best source for
            # replicating out (which might not be one of the
            # locations determined by the hash ring).
            tm = misc.walltime()
            get_snapshots
                project_id : opts.project_id
                cb         : (err, result) ->
                    if err
                        cb(err)
                    else
                        if not result? or misc.len(result) == 0
                            dbg("project doesn't have any snapshots at all or location.")
                            # this could happen for a new project with no data, or one not migrated.
                            winston.debug("WARNING: project #{opts.project_id} has no snapshots")
                            new_project = true
                            cb(true)
                            return

                        snapshots = result
                        snaps = ([s[0], h] for h, s of snapshots)
                        snaps.sort()
                        source = undefined

                        if cur_loc?
                            for x in snaps
                                if x[1] == cur_loc
                                    source = {version:x[0], host:x[1]}
                                    break

                        if not source?
                            # choose global newest
                            x = snaps[snaps.length - 1]
                            ver = x[0]
                            source = {version:ver, host:x[1]}

                        dbg("determine version of each target")
                        for data_center in targets
                            v = []
                            for host in data_center
                                v.push({version:snapshots[host]?[0], host:host})
                            if v.length > 0
                                versions.push(v)
                        dbg("(time=#{misc.walltime(tm)})-- status: #{misc.to_json(versions)}")
                        cb()
       (cb) ->
            dbg("STAGE 0: (safely) destroy any target replicas whose version is newer than the source")
            # Make list of versions that are newer than the source. Here's what the versions array looks like:
            # [[{"version":"2014-02-13T18:23:34","host":"10.1.3.4"},{"version":"2014-02-13T18:23:34","host":"10.1.2.4"}],[{"host":"10.1.11.4"},{"version":"2014-02-13T18:23:41","host":"10.1.16.4"}],[{"version":"2014-02-13T18:23:34","host":"10.3.8.4"},{"version":"2014-02-13T18:23:34","host":"10.3.3.4"}]]
            hosts_to_delete = (x.host for x in _.flatten(versions) when x.version > source.version)
            f = (host, c) ->
                destroy_project
                    project_id : opts.project_id
                    host       : host
                    safe       : true
                    cb         : (ignore) ->
                        # non-fatal -- don't want to stop replication just because of this -- e.g., what if host is down?
                        c()
            async.map(hosts_to_delete, f, cb)

       (cb) ->
            dbg("STAGE 1: do inter-data center replications so each data center contains at least one up to date node")
            f = (d, cb) ->
                # choose newest in the datacenter -- this one is easiest to get up to date
                dest = d[0]
                for i in [1...d.length]
                    if d[i].version > dest.version
                        dest = d[i]

                # Now make array of the elements in d that have this newest version
                # choose one at random.  This way if one machine is down/busted once,
                # there is a chance we will hit another one next time.
                # TODO: really we should try each target in turn, from best to worst, until one succeeds.
                d2 = (x for x in d when x.version == dest.version)
                dest = d2[misc.randint(0,d2.length-1)]

                if source.version == dest.version
                    cb() # already done -- there is one up to date in the dc, so no further work is needed
                else
                    send
                        project_id : opts.project_id
                        source     : source
                        dest       : dest
                        cb         : (err) ->
                            if not err
                                # means that we succeeded in the version update; record this so that
                                # the code in STAGE 2 below works.
                                dest.version = source.version
                            else
                                errors["src-#{source.host}-dest-#{dest.host}"] = err
                            cb()
            async.map(versions, f, cb)

       (cb) ->
            dbg("STAGE 2: do intra-data center replications to get all data in each data center up to date.")
            f = (d, cb) ->
                # choose last *newest* in the datacenter as source
                src = d[0]
                for i in [1...d.length]
                    if d[i].version > src.version
                        src = d[i]
                # crazy-looking nested async maps because we're writing this to handle
                # having more than 2 replicas per data center, though I have no plans
                # to actually do that.
                g = (dest, cb) ->
                    if src.version == dest.version
                        cb()
                    else
                        send
                            project_id : opts.project_id
                            source     : src
                            dest       : dest
                            cb         : (err) ->
                                if err
                                    errors["src-#{src.host}-dest-#{dest.host}"] = err
                                cb()
                async.map(d, g, cb)

            async.map(versions, f, cb)

    ], () ->
        dbg("removing lock")
        lock_enabled = false
        if misc.len(errors) > 0
            err = errors
            if typeof(err) != 'string'
                # record last replication error in the database; but don't store hitting a lock errors
                database.update
                    table : 'projects'
                    where : {project_id : opts.project_id}
                    json  : ['last_replication_error']
                    set   : {'last_replication_error':{error:err, timestamp:cassandra.now()}}
                    cb    : (e) ->
                        if e
                            dbg("failed to store last err in database: #{misc.to_json(err)}, #{e}")
                        else
                            dbg("stored last replication error in database: #{misc.to_json(err)}")
                        # *no callback*
        else
            err = undefined
            # no errors at all -- clear in db
            database.update
                table : 'projects'
                where : {project_id : opts.project_id}
                json  : ['last_replication_error']
                set   : {'last_replication_error':undefined}
                cb    : (e) ->
                    if e
                        dbg("failed to update last_replication_error: #{e}")
                    else
                        dbg("updated and removed last_replication_error")
                    # no callback

        if clear_replicating_lock
            dbg("remove lock")
            database.update
                table : 'projects'
                where : {project_id : opts.project_id}
                set   : {'replicating': false}
                cb    : () ->
                    if new_project
                        opts.cb?()
                    else
                        opts.cb?(err)
        else
           opts.cb?(err)

    )

# Scan through the database and return a map
#    {project_id:replication errors}
# for the projects with replication errors i.e. for which the last replication attempt failed.
exports.replication_errors = replication_errors = (opts) ->
    opts = defaults opts,
        cb         : required
    dbg = (m) -> winston.debug("replication_errors: #{m}")
    t = misc.walltime()
    dbg("querying database")
    database.select
        table   : 'projects'
        columns : ['project_id', 'last_replication_error']
        json    : ['last_replication_error']
        limit   : 1000000                 # need to rewrite with an index or via paging (?) or something...
        cb      : (err, result) ->
            if result?
                dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                ans = {}
                for x in result
                    if x[1]?
                        ans[x[0]] = x[1]
                dbg("#{misc.len(ans)} projects have errors")
            opts.cb(err, ans)

# Run replication on each project such that last time we tried to replicate it
# there was an error.
exports.replicate_all_with_errors  = (opts) ->
    opts = defaults opts,
        limit : 10   # no more than this many projects will be replicated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        cb    : undefined  # cb(err, {project_id:error when replicating that project})

    dbg = (m) -> winston.debug("replicate_all_with_errors(limit:#{opts.limit}): #{m}")
    projects = undefined
    errors   = {}
    done     = 0
    todo     = 0
    async.series([
        (cb) ->
            dbg('getting list of all projects with errors')
            replication_errors
                cb : (err, ans) ->
                    if err
                        cb(err)
                    else
                        projects = misc.keys(ans)
                        todo = projects.length
                        dbg("got #{todo} projects with errors")
                        cb()
        (cb) ->
            f = (project_id, cb) ->
                dbg("replicating #{project_id}")
                replicate
                    project_id : project_id
                    cb         : (err) ->
                        done += 1
                        dbg("***********\n**** STATUS: finished #{done}/#{todo} ****\n***********\n")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) ->
        if err
            errors['err'] = err
        if misc.len(errors) == 0
            errors = undefined
        opts.cb?(errors)
    )



# Scan through the entire database and list of projects that really need to be
# replicated in the sense that they do not have at least one replica in each data
# center that is within age_s seconds of their newest replica.
# In a perfect event driven world, this list would always be empty, but due to
# various types of failures and other issues, sometimes it isn't, so we have
# to periodically scan and force replication of these.
exports.projects_needing_replication = projects_needing_replication = (opts) ->
    opts = defaults opts,
        age_s     : 5*60  # 5 minutes
        cb        : required
    dbg = (m) -> winston.debug("projects_needing_replication: #{m}")
    dbg("querying database...")
    database.select
        table   : 'projects'
        columns : ['project_id', 'locations']
        limit   : 1000000                 # need to rewrite with an index or via paging (?) or something.
        cb      : (err, results) ->
            if err or not results?
                opts.cb(err); return
            dbg("got #{results.length} results")
            ans = {}
            for x in results
                if x[1]?
                    v = {}
                    for k,z of x[1]
                        v[k] = misc.from_json(z)
                    project_id = x[0]
                    locs = locations(project_id:project_id)   # replicas we care about, grouped by data center
                    if locs.length == 0
                        opts.cb("hashrings not yet initialized")
                        return

                    # first pass -- which is newest?  (TODO: could just do some list comprehension and sort.)
                    newest = undefined
                    for dc in locs
                        for host in dc
                            if v[host]?[0]? and (not newest? or v[host][0] > newest)
                                newest = v[host][0]
                    newest = new Date(newest)
                    # second pass -- age of best in each dc
                    for dc in locs
                        newest0 = undefined
                        for host in dc
                            if v[host]?[0]? and (not newest0? or v[host][0] > newest0)
                                newest0 = v[host][0]
                        age_in_s = (newest - (new Date(newest0)))/1000
                        if age_in_s >= opts.age_s
                            ans[project_id] = true
                            break
            opts.cb(undefined, misc.keys(ans))

exports.replicate_projects_needing_replication = (opts) ->
    opts = defaults opts,
        age_s     : 10*60  # 10 minutes
        limit     : 2      # max number to replicate simultaneously
        interval  : 3000
        cb        : required
    dbg = (m) -> winston.debug("replicate_projects_needing_replication: #{m}")
    projects = undefined
    errors = {}
    async.series([
        (cb) ->
            dbg("figuring out which projects to replicate...")
            projects_needing_replication
                age_s : opts.age_s
                cb    : (err, p) ->
                    projects = p
                    cb(err)
        (cb) ->
            dbg("replicating #{projects.length} projects")
            todo = projects.length
            done = 0
            f = (project_id, cb) ->
                dbg("replicating #{project_id}")
                replicate
                    project_id : project_id
                    cb         : (err) ->
                        done += 1
                        dbg("\n******************\n**** STATUS: finished #{done}/#{todo}\n**************")
                        if err
                            errors[project_id] = err
                        setTimeout(cb, opts.interval)
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) ->
        if err
            errors.err = err
        if misc.len(errors) > 0
            opts.cb(errors)
        else
            opts.cb()
    )

exports.send = send = (opts) ->
    opts = defaults opts,
        project_id : required
        source     : required    # {host:ip_address, version:snapshot_name}
        dest       : required    # {host:ip_address, version:snapshot_name}
        force      : false       # *never* set this to true unless you really know what you're doing! It's evil.
        force2     : true        # take various safer-than-F methods to send if there are errors; basically a safer (but slower!) -F.
        cb         : undefined

    dbg = (m) -> winston.debug("send(project_id:#{opts.project_id},source:#{misc.to_json(opts.source)},dest:#{misc.to_json(opts.dest)},force:#{opts.force}): #{m}")

    dbg("sending")

    if opts.source.version == opts.dest.version
        dbg("trivial special case")
        opts.cb()
        return

    tmp = "#{STORAGE_TMP}/.storage-#{opts.project_id}-src-#{opts.source.host}-#{opts.source.version}-dest-#{opts.dest.host}-#{opts.dest.version}.lz4"
    f = filesystem(opts.project_id)
    clean_up = false
    async.series([
        (cb) ->
            dbg("export range of snapshots")
            start = if opts.dest.version then "-I #{f}@#{opts.dest.version}" else ""
            clean_up = true
            execute_on
                host    : opts.source.host
                command : "sudo zfs send -RD #{start} #{f}@#{opts.source.version} | lz4c -  > #{tmp}"
                timeout : 7200
                cb      : (err, output) ->
                    winston.debug(output)
                    cb(err)
        (cb) ->
            dbg("scp to destination")
            execute_on
                host    : opts.source.host
                command : "scp -o StrictHostKeyChecking=no #{tmp} #{STORAGE_USER}@#{opts.dest.host}:#{tmp}; echo ''>#{tmp}"
                timeout    : 7200
                cb      :  (err, output) ->
                    winston.debug(output)
                    cb(err)
        (cb) ->
            dbg("receive on destination side")
            force = if opts.force then '-F' else ''
            do_recv = (cb) ->
                execute_on
                    host    : opts.dest.host
                    command : "cat #{tmp} | lz4c -d - | sudo zfs recv #{force} #{f}"
                    timeout    : 7200
                    cb      : (err, output) ->
                        dbg("output of recv: #{misc.to_json(output)}")
                        cb(err, output)
            rm = (cb) ->
                execute_on
                    host    : opts.dest.host
                    command : "rm -f #{tmp}"
                    timeout : 120
                    cb      : cb

            do_recv  (err,output) ->
                if not opts.force2
                    rm((ignored) -> cb(err))
                    return
                if not output?.stderr
                    cb(err)
                else
                    dbg("opts.force2 is true: we try to fix the problems")
                    # In some cases we try again
                    try_again = () ->
                        do_recv (err,output) ->
                            rm () ->
                                if err
                                    cb(err + output.stderr)
                                else
                                    cb()
                    # try each of several evasive actions
                    stderr = output.stderr
                    if stderr.indexOf('has been modified') != -1 and output.stderr.indexOf('most recent snapshot') != -1
                        m = "modified since most recent snapshot -- so rolling back to *most recent* snapshot"
                        dbg(m)
                        rollback_to_snapshot
                            project_id : opts.project_id
                            host       : opts.dest.host
                            cb         : try_again
                    else if stderr.indexOf('destination has snapshots') != -1 or stderr.indexOf('must specify -F to overwrite it') != -1 or  stderr.indexOf('cannot receive incremental stream: most recent snapshot of') != -1
                        m = "problem -- destination has snapshots that the source doesn't have -- destroying the target (really safely renaming)"
                        dbg(m)
                        destroy_project
                            project_id : opts.project_id
                            host       : opts.dest.host
                            safe       : true
                            cb         : (ignore) ->
                                rm ()->cb(m)
                    else
                        dbg("no evasive action for '#{output.stderr}'; at least try repairing snapshot list")
                        repair_snapshots_in_db
                            project_id : opts.project_id
                            cb         : (ignore) ->
                                rm () ->
                                    cb(err)
        (cb) ->
            dbg("update database to reflect the new list of snapshots resulting from this recv")
            # We use repair_snapshots to guarantee that this is correct.
            repair_snapshots_in_db
                project_id : opts.project_id
                host       : opts.dest.host
                cb         : cb
    ], (err) ->
        if err
            dbg("finished send -- err=#{err}")
        if clean_up
            dbg("remove the lock file")
            execute_on
                host    : opts.source.host
                command : "rm #{tmp}"
                timeout : 45
                cb      : (ignored) ->
                    opts.cb?(err)
        else
            dbg("no need to clean up -- bailing due to another process lock")
            opts.cb?(err)
    )

exports.destroy_project = destroy_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        safe       : true      # if given, instead renames the filesystem to DELETED-now()-project_id; we can delete those later...
        cb         : undefined

    dbg = (m) -> winston.debug("destroy_project(#{opts.project_id}, #{opts.host}: #{m}")

    async.series([
        (cb) ->
            dbg("kill any user processes")
            create_user
                project_id : opts.project_id
                host       : opts.host
                action     : 'kill'
                timeout    : 30
                cb         : cb
        (cb) ->
            if opts.safe
                f = filesystem(opts.project_id)
                t = filesystem("DELETED-#{cassandra.now()}-#{opts.project_id}")
                dbg("safely delete dataset (really just rename to #{t})")
                cmd = "sudo zfs rename #{f} #{t}"   # if change this, also change arg to indexOf below!!!!
                execute_on
                    host          : opts.host
                    command       : "ps ax | grep 'zfs rename' | grep #{opts.project_id}"
                    timeout       : 120
                    err_on_exit   : false
                    err_on_stderr : false
                    cb      : (err, output) ->
                        if err
                            cb("unable to connect to '#{opts.host}'")
                        else if output.stdout.indexOf("rename #{f}") != -1
                            dbg("already renaming -- left from previous attempt, since zfs is filling up with work... --")
                            cb("unable to delete data set due zfs being too busy")
                        else
                            execute_on
                                host    : opts.host
                                command : cmd
                                timeout : 360
                                cb      : (err, output) ->
                                    if err
                                        if output?.stderr? and output.stderr.indexOf('does not exist') != -1
                                            does_not_exist = true
                                            err = undefined
                                    if err or does_not_exist
                                        cb(err)
                                    else
                                        dbg("unset the mountpoint, or we'll have trouble later")
                                        execute_on
                                            host    : opts.host
                                            command : "sudo zfs set mountpoint=none #{t}"
                                            timeout : 120
                                            cb      : cb
            else
                dbg("unsafely destroying dataset")
                # I don't want to ever,ever do this, so...
                cb("opts.safe = false NOT implemented (on purpose)!")
                ###
                execute_on
                    host    : opts.host
                    command : "sudo zfs destroy -r #{filesystem(opts.project_id)}"
                    timeout : 300
                    cb      : (err, output) ->
                        if err
                            if output?.stderr? and output.stderr.indexOf('does not exist') != -1
                                err = undefined
                        cb(err)
                ###
        (cb) ->
            dbg("throw in a umount, just in case")
            create_user
                project_id : opts.project_id
                host       : opts.host
                action     : 'umount'
                timeout    : 5
                cb         : (ignored) -> cb()
        (cb) ->
            dbg("success -- so record in database that project is no longer on this host.")
            set_snapshots_in_db
                project_id : opts.project_id
                host       : opts.host
                snapshots  : []
                cb         : cb
    ], (err) -> opts.cb?(err))


# Query database for *all* project's, sort them in alphabetical order,
# then run replicate on every single one.
# At the end, all projects should be replicated out to all their locations.
# Since the actual work happens all over the cluster (none on the machine
# running this, if it is a web machine), it is reasonable safe to run
# with a higher limit... maybe.
exports.replicate_all = replicate_all = (opts) ->
    opts = defaults opts,
        limit : 10   # no more than this many projects will be replicated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        host  : undefined  # if given, only replicate projects whose current location is on this host.
        cb    : undefined  # cb(err, {project_id:error when replicating that project})

    dbg = (m) -> winston.debug("replicate_all: #{m}")

    projects = undefined
    errors = {}
    done = 0
    todo = undefined

    async.series([
        (cb) ->
            dbg("querying database...")
            if opts.host?
                database.select
                    table   : 'projects'
                    columns : ['project_id', 'location']
                    json    : ['location']
                    limit   : 1000000
                    cb      : (err, result) ->
                        if result?
                            projects = (x for x in result when x[1]?.host == opts.host)
                        cb(err)
            else
                database.select
                    table   : 'projects'
                    columns : ['project_id']
                    limit   : 1000000       # TODO: change to use paging...
                    cb      : (err, result) ->
                        projects = result
                        cb(err)
        (cb) ->
            projects.sort()
            if opts.start? and opts.stop?
                projects = projects.slice(opts.start, opts.stop)
            projects = (x[0] for x in projects)
            todo = projects.length
            dbg("#{todo} projects to replicate")
            f = (project_id, cb) ->
                dbg("replicating #{project_id}")
                replicate
                    project_id : project_id
                    cb         : (err) ->
                        done += 1
                        dbg("**** STATUS: finished #{done}/#{todo}")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) -> opts.cb?(err, errors))


###
# Backup -- backup all projects to a single zpool.
###

exports.backup_all_projects =  backup_all_projects = (opts) ->
    opts = defaults opts,
        limit      : 5
        start      : undefined
        stop       : undefined
        repeat     : false       # if true, will loop around, repeatedly backing up, over and over again; opts.cb (if defined) will get called every time it completes a backup cycle.
        projects   : undefined   # if given, only backup *this* list of projects (list of project id's)
        cb         : undefined
    dbg = (m) -> winston.debug("backup_all_projects: #{m}")
    errors = {}
    projects = opts.projects
    async.series([
        (cb) ->
            if projects?
                cb(); return
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'status']
                limit   : 1000000   # TODO: stupidly slow
                cb      : (err, result) ->
                    projects = (a[0] for a in result when a[1] != 'new')  # ignore new projects -- never opened, so no data.
                    projects.sort()
                    dbg("got #{projects.length} projects")
                    if opts.start? or opts.stop?
                        projects = projects.slice(opts.start, opts.stop)
                    cb(err)
        (cb) ->
            dbg("backing up all projects...")
            n = 0
            total = projects.length
            f = (project_id, cb) ->
                dbg("backing up project #{project_id}")
                n += 1
                dbg("******\n* #{n} of #{total}\n******")
                backup_project
                    project_id : project_id
                    cb         : (err) ->
                        if err
                            dbg("err -- #{err}, so move project #{project_id} out of the way, then try exactly one more time from scratch")
                            async.series([
                                (cb0) ->
                                    dbg("moving #{project_id} out of the way")
                                    t = filesystem("DELETED-#{cassandra.now()}-#{project_id}")
                                    misc_node.execute_code
                                        command     : "sudo"
                                        args        : ['zfs', 'rename', filesystem(project_id), t]
                                        timeout     : 300
                                        err_on_exit : true
                                        cb          : cb0
                                (cb0) ->
                                    dbg("trying one more time to backup #{project_id}")
                                    backup_project
                                        project_id : project_id
                                        cb         : cb0
                            ], (err) ->
                                if err
                                    errors[project_id] = err
                                cb()
                            )
                        else
                            cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) ->
        if err
            errors['err'] = err
        if misc.len(errors) == 0
            opts.cb?()
        else
            opts.cb?(errors)
        if opts.repeat
            dbg("!!!!!!!!!!!!!!!!!!!! Doing the whole backup again. !!!!!!!!!!!!!!!!!!!!!")
            backup_all_projects(opts)
    )


exports.backup_project = backup_project = (opts) ->
    opts = defaults opts,
        project_id : required
        remote     : undefined
        cb         : undefined
    dbg = (m) -> winston.debug("backup_project(project_id:'#{opts.project_id}'): #{m}")
    dbg("backup the project with given id from some remote server to the local projects zpool.")
    if not opts.remote?
        # We try each of the locations that have the project until one works.
        done = false
        f = (remote, cb) ->
            if done
                cb()
            else
                backup_project
                    project_id : opts.project_id
                    remote     : remote
                    cb         : (err) ->
                        if not err
                            done = true
                        cb()
        v = locations(project_id:opts.project_id)
        if v.length == 0
            opts.cb?("hashrings not yet initialized")
            return
        remotes = _.flatten(v)
        async.mapSeries remotes, f, () ->
            if done
                opts.cb?()
            else
                opts.cb?("unable to make a backup using any replica")
    else
        f                = filesystem(opts.project_id)
        local_snapshots  = undefined
        remote_snapshots = undefined
        remote_base      = undefined
        tmp              = undefined
        clean_up         = false
        async.series([
            (cb) ->
                dbg("determine local snapshots")
                misc_node.execute_code
                    command     : "sudo"
                    args        : ['zfs', 'list', '-r', '-t', 'snapshot', '-o', 'name', '-s', 'creation', f]
                    timeout     : 3600
                    err_on_exit : true
                    cb          : (err, output) ->
                        if err
                            if output?.stderr? and output.stderr.indexOf('not exist') != -1
                                dbg("no local snapshots yet")
                                local_snapshots = []
                                cb()
                            else
                                cb(err)
                        else
                            v = output.stdout.split('\n')
                            n = f.length + 1
                            local_snapshots = (a.slice(n) for a in v when a.slice(n))
                            dbg("local_snapshots = #{misc.to_json(local_snapshots).slice(0,300)}...")
                            cb()
            (cb) ->
                dbg("determine remote snapshots")
                execute_on
                        host    : opts.remote
                        command : "sudo zfs list -r -t snapshot -o name -s creation #{f}"
                        timeout : 300
                        cb      : (err, output) ->
                            if err
                                cb(err)
                            else
                                dbg("getting remote_snapshots")# -- output=#{misc.to_json(output)}")
                                v = output.stdout.split('\n')
                                n = f.length + 1
                                remote_snapshots = (a.slice(n) for a in v  when a.slice(n))
                                dbg("remote_snapshots = #{misc.to_json(remote_snapshots).slice(0,300)}...")
                                cb()
            (cb) ->
                dbg("determining replication strategy")
                i = local_snapshots.length
                if i == 0
                    dbg("just get the full remote")
                    cb()
                else
                    if remote_snapshots.indexOf(local_snapshots[i-1]) == -1
                        dbg("the remote snapshot list doesn't include the newest local snapshot")
                        # We do *NOT* rollback, since the whole point of the backup system is
                        # to make something that can't lose history, despite what might happen
                        # on any compute machine.
                        cb("clone strategy to deal with forks not implemented")
                    else
                        remote_base = local_snapshots[i-1]
                        cb()
            (cb) ->
                dbg("create replication stream")
                start = if remote_base? then "-I #{f}@#{remote_base}" else ""
                tmp = "#{STORAGE_TMP}/.backup-#{opts.project_id}-remote-#{opts.remote}-#{remote_base}-local.lz4"
                fs.exists tmp, (exists) ->
                    if exists
                        cb("#{tmp} already exists -- delete and try again")
                    else
                        clean_up = true
                        execute_on
                                host    : opts.remote
                                command : "sudo zfs send -RD #{start} #{f}@#{remote_snapshots[remote_snapshots.length-1]} | lz4c - > #{tmp} "
                                timeout : 7200
                                cb      : cb
            (cb) ->
                dbg("copy replication stream back to backup host")
                misc_node.execute_code
                    command     : "scp -o StrictHostKeyChecking=no storage@#{opts.remote}:#{tmp} #{tmp}"
                    timeout     : 7200
                    err_on_exit : false
                    cb          : cb

            (cb) ->
                dbg("apply replication stream")
                misc_node.execute_code
                    command : "cat #{tmp} | lz4c -d - | sudo zfs recv #{f}"
                    timeout : 7200
                    cb      : cb
        ], (err) ->
            if clean_up
                execute_on
                    host    : opts.remote
                    command : "rm #{tmp}"
                fs.unlink(tmp)
            opts.cb?(err)
        )



###
# Migrate -- throw away code for migrating from the old /mnt/home/blah projects to new ones
###

#
# TEMPORARY: for migrate to work, you must:
#    - temporarily allow ssh key access to root@[all compute nodes]
#    - temporarily allow root to ssh to any project
#
exports.xxx_migrate = (opts) ->
    opts = defaults opts,
        project_id : required
        force      : false
        cb         : required
    dbg = (m) -> winston.debug("migrate(#{opts.project_id}): #{m}")
    dbg("migrate (or update) the data for project with given id to the new format")

    done = false
    old_home = undefined
    old_user = undefined
    old_host = undefined
    new_host = undefined
    now      = undefined
    rsync_failed = false
    async.series([
        (cb) ->
            if opts.force
                cb(); return
            dbg("check if project already completely migrated to new zfs storage format")
            database.select_one
                table   : 'projects'
                columns : ['storage']
                where   : {project_id : opts.project_id}
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        if result[0] == 'zfs'
                            dbg("nothing further to do -- project is now up and running using the new ZFS-based storage")
                            done = true
                            cb(true)
                        else
                            cb()
        (cb) ->
            if opts.force
                cb(); return
            dbg("get last modification time and last migration time of this project")
            database.select_one
                table   : 'projects'
                columns : ['last_edited', 'last_migrated', 'last_snapshot']
                where   : {project_id : opts.project_id}
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        last_edited = result[0]
                        last_migrated = result[1]
                        last_snapshot = result[2]
                        if (last_migrated and last_edited and (last_edited < last_migrated or last_edited<=last_snapshot)) or (last_migrated and not last_edited)
                            dbg("nothing to do  -- project hasn't changed since last successful rsync/migration or snapshot")
                            done = true
                            cb(true)
                        else
                            cb()

        (cb) ->
            dbg("determine /mnt/home path of the project")
            database.select_one
                table   : 'projects'
                columns : ['location', 'owner']
                json    : ['location']
                where   : {project_id : opts.project_id}
                cb      : (err, result) ->
                    dbg("location=#{misc.to_json(result[0])}")
                    if err
                        cb(err)
                    else
                        if not result[0] or not result[0].username or not result[0].host
                            if not result[1]
                                dbg("no owner either -- just an orphaned project entry")
                            done = true
                            database.update
                                table : 'projects'
                                set   : {'last_migrated':cassandra.now()}
                                where : {project_id : opts.project_id}
                            cb("no /mnt/home/ location for project -- migration not necessary")

                        else
                            old_user = result[0].username
                            old_home = '/mnt/home/' + result[0].username
                            old_host = result[0].host
                            cb()
        (cb) ->
            dbg("create a zfs version of the project (or find out where it is already)")
            create_project
                project_id : opts.project_id
                quota      : '10G'      # may shrink everything later...
                chown      : true       # in case of old messed up thing.
                exclude    : [old_host]
                unset_loc  : false
                cb         : (err, host) ->
                    new_host = host
                    dbg("initial zfs project host=#{new_host}")
                    cb(err)
        (cb) ->
            dbg("open the project on #{new_host}, so we can rsync old_home to it")
            open_project
                project_id : opts.project_id
                host       : new_host
                chown      : true
                cb         : cb
        (cb) ->
            dbg("rsync old_home to it.")
            new_home = mountpoint(opts.project_id)
            t = misc.walltime()
            now = cassandra.now()
            rsync = "rsync -Hax -e 'ssh -o StrictHostKeyChecking=no' --delete --exclude .forever --exclude .bup --exclude .zfs root@#{old_host}:#{old_home}/ #{new_home}/"
            execute_on
                user          : "root"
                host          : new_host
                command       : rsync
                err_on_stderr : false
                err_on_exit   : false
                timeout       : 300
                cb            : (err, output) ->
                    # we set rsync_failed here, since it is critical that we do the chown below no matter what.
                    if err
                        rsync_failed = err
                    dbg("finished rsync; it took #{misc.walltime(t)} seconds; output=#{misc.to_json(output)}")
                    if output.exit_code and output.stderr.indexOf('readlink_stat("/mnt/home/teaAuZ9M/mnt")') == -1
                        rsync_failed = output.stderr
                        # TODO: ignore errors involving sshfs; be worried about other errors.
                    cb()
        (cb) ->
            dbg("chown user files")
            create_user
                project_id : opts.project_id
                host       : new_host
                action     : 'chown'
                cb         : (err) ->
                    if rsync_failed
                        err = rsync_failed
                    cb(err)

        (cb) ->
            dbg("take a snapshot")
            snapshot
                project_id              : opts.project_id
                host                    : new_host
                min_snapshot_interval_s : 0
                wait_for_replicate      : true
                force                   : true
                cb                      : cb
        (cb) ->
            dbg("close project")
            close_project
                project_id : opts.project_id
                host       : new_host
                unset_loc  : false
                cb         : cb

        (cb) ->
            dbg("record that we successfully migrated all data at this point in time (=when rsync *started*)")
            database.update
                table : 'projects'
                set   : {'last_migrated':now}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) ->
        if done
            opts.cb()
        else
            opts.cb(err)
            if err
                log_error
                    project_id : opts.project_id
                    mesg       : {type:"migrate", "error":err}
    )


exports.xxx_migrate_all = (opts) ->
    opts = defaults opts,
        limit : 10  # no more than this many projects will be migrated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        exclude : undefined       # if given, any project_id in this array is skipped
        cb    : undefined  # cb(err, {project_id:error when replicating that project})

    projects = undefined
    errors = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("migrate_all(start=#{opts.start}, stop=#{opts.stop}): #{m}")
    t = misc.walltime()

    async.series([
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id']
                limit   : 1000000                 # should page, but no need since this is throw-away code.
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        projects = (x[0] for x in result)
                        projects.sort()
                        if opts.start? and opts.stop?
                            projects = projects.slice(opts.start, opts.stop)
                        if opts.exclude?
                            v = {}
                            for p in opts.exclude
                                v[p] = true
                            projects = (p for p in projects when not v[p])
                        todo = projects.length
                    cb(err)
        (cb) ->
            f = (project_id, cb) ->
                dbg("migrating #{project_id}")
                exports.migrate
                    project_id : project_id
                    cb         : (err) ->
                        if err
                            fail += 1
                        else
                            done += 1
                        winston.info("MIGRATE_ALL STATUS: (done=#{done} + fail=#{fail} = #{done+fail})/#{todo}")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) -> opts.cb?(err, errors))


#r=require('storage');r.init()
#x={};r.status_of_migrate_all(cb:(e,v)->console.log("DONE!"); x.v=v; console.log(x.v.done.length, x.v.todo.length))
exports.status_of_migrate_all = (opts) ->
    opts = defaults opts,
        cb    : undefined

    tm = misc.walltime()
    dbg = (m) -> winston.debug("status_of_migrate_all(): #{m}")
    dbg("querying db...")
    database.select
        table   : 'projects'
        columns : ['project_id','last_edited', 'last_migrated', 'last_snapshot', 'errors_zfs']
        limit   : 1000000
        cb      : (err, v) ->
            #dbg("v=#{misc.to_json(v)}")
            dbg("done querying in #{misc.walltime(tm)} seconds")
            if err
                opts.cb(err)
            else
                todo = []
                done = []

                for result in v
                    last_edited = result[1]
                    last_migrated = result[2]
                    last_snapshot = result[3]
                    if (last_migrated and last_edited and (last_edited < last_migrated or last_edited<=last_snapshot)) or (last_migrated and not last_edited)
                        done.push(result[0])
                    else
                        todo.push([result[0],result[4]])
                opts.cb(undefined, {done:done, todo:todo})

exports.location_all = (opts) ->
    opts = defaults opts,
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        cb    : undefined  # cb(err, {project_id:error when replicating that project})

    projects = undefined
    ans = []

    database.select
        table   : 'projects'
        columns : ['project_id','location']
        limit   : 1000000       # should page, but no need since this is throw-away code.
        cb      : (err, projects) ->
            if err
                opts.cb(err)
            else
                if projects?
                    projects.sort()
                    if opts.start? and opts.stop?
                        projects = projects.slice(opts.start, opts.stop)
                opts.cb(undefined, projects)

exports.migrate_unset_all_locs= (opts) ->
    opts = defaults opts,
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        limit : 20
        cb    : undefined  # cb(err, {project_id:actions, ...})
    dbg = (m) -> winston.debug("migrate_unset_all_locs: #{m}")
    projects    = undefined
    errors = {}
    async.series([
        (cb) ->
            dbg("querying db...")
            database.select
                table   : 'projects'
                columns : ['project_id','location']
                limit   : 1000000       # should page, but no need since this is throw-away code.
                cb      : (err, _projects) ->
                    if err
                        cb(err)
                    else
                        projects = _projects
                        projects.sort()
                        if opts.start? and opts.stop?
                            projects = projects.slice(opts.start, opts.stop)
                        projects = (p for p in projects when p[1])
                        cb()
        (cb) ->
            dbg("closing #{projects.length} projects")
            f = (p, cb) ->
                dbg("closing p=#{misc.to_json(p)}")
                async.series([
                    (c) ->
                        database.update
                            table : 'projects'
                            set   : {old_location:p[1]}
                            where : {project_id : p[0]}
                            cb    : c
                    (c) ->
                        database.update
                            table : 'projects'
                            set   : {location:undefined}
                            where : {project_id : p[0]}
                            cb    : c
                ], (err) ->
                    if err
                        errors[project_id] = err
                    cb()  # ignore errors here
                )

            async.mapLimit(projects, opts.limit, f, cb)

    ], (ignore) ->
        if misc.len(errors) > 0
            opts.cb(errors)
        else
            opts.cb()
    )


exports.repair_all = (opts) ->
    opts = defaults opts,
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        cb    : undefined  # cb(err, {project_id:actions, ...})

    dbg = (m) -> winston.debug("repair_all: #{m}")

    projects    = undefined
    wrong_locs  = {}
    wrong_snaps = {}
    async.series([
        (cb) ->
            dbg("querying db...")
            database.select
                table   : 'projects'
                columns : ['project_id','location','locations']
                limit   : 1000000       # should page, but no need since this is throw-away code.
                cb      : (err, projects) ->
                    if err
                        cb(err)
                    else
                        if projects?
                            projects.sort()
                            if opts.start? and opts.stop?
                                projects = projects.slice(opts.start, opts.stop)
                        cb()
        (cb) ->
            dbg("determining inconsistent replicas")
            for x in projects
                destroy = []
                v = locations(project_id:x[0])
                if v.length == 0
                    cb("hashrings not yet initialized")
                    return
                loc = _.flatten(v)
                if loc.indexOf(x[1]) == -1 and x[2].indexOf(x[1]) != -1
                    if not wrong_locs[x[0]]?
                        wrong_locs[x[0]] = [x[1]]
                    else
                        wrong_locs[x[0]].push(x[1])

                v = ([s[0],h] for h,s of x[2] when s.length>0)
                if v.length > 0
                    v.sort()
                    best = v[v.length-1]
                    for h,s of x[2]
                        if s.length == 0 or s[0] != best
                            if not wrong_snaps[x[0]]?
                                wrong_snaps[x[0]] = [h]
                            else
                                wrong_snaps[x[0]].push(h)
            cb()
    ], (err) -> opts.cb?(err, {wrong_locs:wrong_locs, wrong_snaps:wrong_snaps}))




###
# init
###

exports.init = init = (cb) ->
    connect_to_database(cb)

# TODO
#init (err) ->
#    winston.debug("init -- #{err}")

# ONE OFF
exports.set_status_to_new_for_all_with_empty_locations = () ->
    dbg = (m) -> winston.debug("set_status_to_new_for_all_with_empty_locations: #{m}")
    dbg("querying database... (should take a minute)")
    database.select
        table   : 'projects'
        columns : ['project_id', 'locations', 'status']
        limit   : 100000   # TODO: stupidly slow
        cb      : (err, result) ->
            projects = (a[0] for a in result when not a[1]? and not a[2]?)
            projects.sort()
            dbg("got #{projects.length} projects: #{misc.to_json(projects)}")
            database.update
                table : 'projects'
                set   : {status:'new'}
                where : {project_id : {'in':projects}}
                cb    : (err) ->
                    dbg("done!  (with err=#{err})")



############################################
# Projects that are stored on a given node
# In case we have to recover a node from scratch
# for some reason, it is useful to be able to get a list
# of the project_id's of projects that are supposed
# to be available on that node according to
# consistent hashing.
#   x={}; s.projects_on_node(host:'10.1.2.4',cb:(e,t)->x.t=t)
#   fs.writeFileSync('projects-day',x.t.join('\n'))
############################################

filter_by_host = (projects, host) ->
    v = (x[0] for x in projects when host in _.flatten(locations(project_id:x[0])))
    v.sort()
    return v


exports.all_projects_on_host = (opts) ->
    opts = defaults opts,
        host : required  # ip address
        cb   : required  # cb(err, [list of project id's])
    database.select
        table   : 'projects'
        columns : ['project_id']
        limit   : 100000   # TODO: stupidly slow
        cb      : (err, projects) ->
            if err
                opts.cb(err); return
            winston.debug("got #{projects.length} projects")
            v = filter_by_host(projects, opts.host)
            winston.debug("of these, #{v.length} are on '#{opts.host}'")
            opts.cb(undefined, v)

exports.all_projects_with_location_host = (opts) ->
    opts = defaults opts,
        host : undefined  # ip address
        cb   : required  # cb(err, [list of project id's])
    database.select
        table   : 'projects'
        columns : ['project_id', 'location']
        json    : ['location']
        limit   : 100000   # TODO: stupidly slow
        cb      : (err, projects) ->
            if err
                opts.cb(err); return
            winston.debug("got #{projects.length} projects")
            v = (x[0] for x in projects when x[1]?.host == opts.host)
            winston.debug("of these, #{v.length} are on '#{opts.host}'")
            opts.cb(undefined, v)


#  x={}; s.projects_on_node(host:'10.1.2.4',cb:(e,t)->x.t=t)
#   fs.writeFileSync('projects-day',x.t.join('\n'))
exports.recent_projects_on_host = (opts) ->
    opts = defaults opts,
        host : required  # ip address
        time : required  # 'short', 'day', 'week', 'month'
        cb   : required  # cb(err, [list of project id's])
    database.select
        table   : 'recently_modified_projects'
        columns : ['project_id']
        limit   : 100000   # TODO: stupidly slow
        where   : {ttl:opts.time}
        cb      : (err, projects) ->
            if err
                opts.cb(err); return
            winston.debug("got #{projects.length} projects")
            v = filter_by_host(projects, opts.host)
            winston.debug("of these, #{v.length} are on '#{opts.host}'")
            opts.cb(undefined, v)

# returns all projects that are on host but not on any host in other_hosts
exports.all_projects_on_host_not_on_other_hosts = (opts) ->
    opts = defaults opts,
        host : required  # ip address
        other_hosts : required  # list of ip addresses
        cb   : required  # cb(err, [list of project id's])
    database.select
        table   : 'projects'
        columns : ['project_id']
        limit   : 100000   # TODO: stupidly slow
        cb      : (err, projects) ->
            if err
                opts.cb(err); return
            winston.debug("got #{projects.length} projects")
            v = filter_by_host(projects, opts.host)
            w = {}
            for host in opts.other_hosts
                for project_id in filter_by_host(projects, host)
                    w[project_id] = true
            v = (project_id for project_id in v when not w[project_id])
            winston.debug("of these, #{v.length} are on '#{opts.host}' but not on '#{misc.to_json(opts.other_hosts)}'")
            opts.cb(undefined, v)

################################################################
# New (and final!?) storage system
#
# - everything will be stored in a new pool called "storage"
# - /storage/streams -- where streams are stored
# - /storage/images  -- where sparse image files are temporarily located
# - /storage/
#
################################################################

TIMEOUT2 = 15*60

class exports.Project
    constructor: (@project_id) ->
        if typeof @project_id != 'string'
            @dbg("constructor", "project_id (=#{@project_id}) must be a string!")

    dbg: (f, m) =>
        winston.debug("Project(#{@project_id}).#{f}: #{m}")

    execute: (opts) =>
        opts = defaults opts,
            host    : required
            command : required     # string -- smc_storage [...cmd...] project_id
            timeout : TIMEOUT2
            cb      : undefined

        execute_on
            host    : opts.host
            command : "./smc_storage.py --pool=storage --mnt=/test/#{@project_id} #{opts.command} #{@project_id}"
            timeout : opts.timeout
            cb      : opts.cb

    # Take a snapshot of the current project.  Does not replicate.
    snapshot: (opts) =>
        opts = defaults opts,
            host : required
            cb   : undefined

    # Snapshot filesystem containing image file, send it to streams path.
    save: (opts) =>

    # Sync out the streams from host to all replicas.
    replicate: (opts) =>
        opts = defaults opts,
            host   : required
            delete : false   # if true, deletes any files on target not on the host.  DANGEROUS.
            cb     : undefined
        @dbg("replicate")
        errors = {}
        f = (target, cb) =>
            @dbg("replicate to #{target}")
            @execute
                host    : opts.host
                command : "replicate #{if opts.delete then '--delete' else ''} #{target}"
                cb      : (err) =>
                    if err
                        @dbg("replicate to #{target} failed -- #{err}")
                        errors[target] = err
                    cb()
        targets = (host for host in _.flatten(locations(project_id:@project_id)) when host != opts.host)
        async.map targets, f, () =>
            if misc.len(errors) > 0
                opts.cb?(errors)
            else
                opts.cb?()

    # Mount the given project, so that the relevant filesystem is properly recv'd and mounted
    mount: () =>

    # Unmount the given project; the filesystem can be remounted quickly.
    umount: () =>

    # Actually close the project; uses less resources (no sparse images in pool), but mounting will take longer.
    close: () =>

class exports.Host
    constructor: (@host) ->
        if typeof @project_id != 'string'
            @dbg("constructor", "host(=#{@host}) must be a string!")

    dbg: (f, m) =>
        winston.debug("Host(#{@host}).#{f}: #{m}")

    projects: (opts) =>
        opts = defaults opts,
            cb : required
        # return map project_id : Project, for all projects on this host, where "on this host"
        # means there is a directory streams/project_id

    replicate_all: (opts) =>
        opts = required opts,
            limit  : 5      # maximum number of projects to replicate at once
            cb     : undefined
        #@projects
        #    cb

exports.xxx_migrate2 = (opts) ->
    opts = defaults opts,
        project_id : required
        status     : undefined
        destroy    : false     # if true, completely destroy the old images and do a new migration from scratch
        host       : undefined
        exclude_hosts :  []  #['10.3.1.4', '10.3.2.4', '10.3.3.4', '10.3.4.4', '10.3.5.4', '10.3.6.4', '10.3.7.4', '10.3.8.4']
        cb         : required
    dbg = (m) -> winston.debug("migrate2(#{opts.project_id}): #{m}")
    dbg("migrate2 (or update) the data for project with given id to the new format2")
    needs_update = undefined
    last_migrated2 = cassandra.now()
    host = opts.host
    client = undefined
    last_migrate2_error = undefined   # could be useful to know below...
    async.series([
        (cb) ->
            dbg("getting last migration error...")
            database.select_one
                table : 'projects'
                columns : ['last_migrate2_error']
                where : {project_id : opts.project_id}
                cb    : (err, result) =>
                    if err
                        cb(err)
                    else
                        last_migrate2_error = result[0]
                        dbg("last_migrate2_error = #{last_migrate2_error}")
                        cb()
        (cb) ->
            dbg("setting last_migrate2_error to start...")
            database.update
                table : 'projects'
                set   : {last_migrate2_error : 'start'}
                where : {project_id : opts.project_id}
                cb    : cb
        (cb) ->
            if host?
                cb(); return
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    if x not in opts.exclude_hosts
                        host = x
                    else
                        host = undefined
                    cb(err)
        (cb) ->
            if host?
                cb(); return
            dbg("project not deployed, so choose best host based on snapshots")
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                        # randomize so not all in DC0...
                        v = ([snaps[0], Math.random(), host] for host, snaps of snapshots when snaps?.length >=1)
                        v.sort()
                        v.reverse()
                        v = ([x[0], x[2]] for x in v)
                        dbg("v = #{misc.to_json(v)}")
                        if v.length == 0
                            # nothing to do -- project never opened
                            cb()
                        else
                            newest = v[0][0]
                            dbg("v=#{misc.to_json(v)}")
                            w = (x for x in v when x[1] not in opts.exclude_hosts)
                            dbg("w=#{misc.to_json(w)}")
                            if w.length == 0 or w[0][0] != newest
                                # newest good is too old, so go with a possibly bad node :-(
                                host = v[0][1]
                            else
                                host = w[0][1]
                            cb()
        (cb) ->
            if not host?
                cb(); return
            dbg("connect to host #{host}")
            if opts.status?
                opts.status.host = host
            require('storage_server').client
                host : host
                cb   : (err, _client) ->
                    client = _client
                    cb(err)
        (cb) ->
            if not host?
                cb(); return
            dbg("do migrate action")
            if opts.destroy
                action = 'migrate_clean'
            else
                action = 'migrate'
            client.action
                project_id : opts.project_id
                action     : action
                cb         : (err, resp) ->
                    dbg("#{action} returned: #{misc.to_json(resp)}")
                    cb(err)
        (cb) ->
            dbg("success -- record time of successful migration start in database")
            database.update
                table : 'projects'
                set   : {last_migrated2 : last_migrated2,  location2:host, last_migrate2_error:undefined}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) =>
        if err
            database.update
                table : 'projects'
                set   : {last_migrate2_error : misc.to_json(err), last_migrated2 : last_migrated2}
                where : {project_id : opts.project_id}
        opts.cb(err)
    )


exports.xxxx_migrate2_all = (opts) ->
    opts = defaults opts,
        limit : 10  # no more than this many projects will be migrated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        exclude : undefined    # if given, any project_id in this array is skipped
        exclude_hosts : undefined  # don't migrate using any host in this list
        retry_errors : false   # also retry to migrate ones that failed with an error last time (normally those are ignored the next time)
        status: undefined      # if given, should be a list, which will get status for projects push'd as they are running.
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("migrate2_all(start=#{opts.start}, stop=#{opts.stop}): #{m}")
    t = misc.walltime()
    limit = 100000

    async.series([
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'last_snapshot', 'last_migrated2', 'last_migrate2_error']
                limit   : limit                 # should page, but no need since this is throw-away code.
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        result.sort()
                        if opts.start? and opts.stop?
                            result = result.slice(opts.start, opts.stop)
                        else if opts.start?
                            result = result.slice(opts.start)
                        else if opts.stop?
                            result = result.slice(0, opts.stop)
                        if opts.retry_errors
                            projects = (x[0] for x in result when x[3]? or (not x[2]? or x[1] > x[2]))
                        else
                            # don't try any projects with errors, unless they have been newly modified
                            projects = (x[0] for x in result when (not x[2]? or x[1] > x[2]))
                        if opts.exclude?
                            v = {}
                            for p in opts.exclude
                                v[p] = true
                            projects = (p for p in projects when not v[p])
                        todo = projects.length
                        dbg("of these -- #{todo} in the range remain to be migrated")
                    cb(err)
        (cb) ->
            i = 1
            f = (i, cb) ->
                project_id = projects[i]
                dbg("*******************************************")
                dbg("Starting to migrate #{project_id}: #{i+1}/#{todo}")
                dbg("*******************************************")
                if opts.status?
                    stat = {status:'migrating...', project_id:project_id}
                    opts.status.push(stat)
                exports.migrate2
                    project_id : project_id
                    status     : stat
                    exclude_hosts : opts.exclude_hosts
                    cb         : (err) ->
                        if err
                            if stat?
                                stat.status='failed'
                                stat.error = err
                            fail += 1
                        else
                            if stat?
                                stat.status='done'
                            done += 1
                        dbg("*******************************************")
                        dbg("MIGRATE_ALL STATUS: (success=#{done} + fail=#{fail} = #{done+fail})/#{todo}")
                        dbg("*******************************************")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit([0...projects.length], opts.limit, f, cb)
    ], (err) -> opts.cb?(err, errors))

exports.xxxx_migrate2_all_status = (opts) ->
    opts = defaults opts,
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        cb    : undefined  # cb(err, {errors:projects with errors, update:projects needing update})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("migrate2_all_status(start=#{opts.start}, stop=#{opts.stop}): #{m}")
    t = misc.walltime()

    dbg("querying database...")
    database.select
        table   : 'projects'
        columns : ['project_id', 'last_snapshot', 'last_migrated2', 'last_migrate2_error']
        limit   : 1000000                 # should page, but no need since this is throw-away code.
        cb      : (err, result) ->
            if err
                opts.cb?(err)
                return
            dbg("got #{result.length} projects from the database in #{misc.walltime(t)} seconds")
            result.sort()
            if opts.start? and opts.stop?
                result = result.slice(opts.start, opts.stop)
            else if opts.start?
                result = result.slice(opts.start)
            else if opts.stop?
                result = result.slice(0, opts.stop)

            v = (x for x in result when x[2]? and not x[3]?)
            dbg("#{v.length} projects have been successfully migrated")
            dbg("#{result.length - v.length} projects still need to be migrated")

            v_errors = (x for x in result when x[3]?)
            dbg("#{v_errors.length} projects failed to migrate due to ERRORS")

            v_update = ([x[0],new Date(x[1]), new Date(x[2])] for x in result when not x[3]? and x[1]? and x[2]? and x[1]>x[2])
            dbg("#{v_update.length} projects have been successfully migrated already but need to be updated due to project usage")

            opts.cb?(err, {errors:v_errors,update:v_update})



exports.xxx_migrate3 = (opts) ->
    opts = defaults opts,
        project_id : required
        server     : undefined   # rsync here...
        status     : undefined
        destroy    : false       # if true, destroy project first
        cb         : required
    dbg = (m) -> winston.debug("migrate3(#{opts.project_id}): #{m}")
    dbg()

    needs_update = undefined
    last_migrated3 = cassandra.now()
    host = opts.host
    client = undefined
    last_migrate3_error = undefined   # could be useful to know below...
    async.series([
        (cb) ->
            dbg("getting last migration error...")
            database.select_one
                table : 'projects'
                columns : ['last_migrate3_error']
                where : {project_id : opts.project_id}
                cb    : (err, result) =>
                    if err
                        cb(err)
                    else
                        last_migrate3_error = result[0]
                        dbg("last_migrate3_error = #{last_migrate3_error}")
                        cb()
        (cb) ->
            dbg("setting last_migrate3_error to start...")
            database.update
                table : 'projects'
                set   : {last_migrate3_error : 'start'}
                where : {project_id : opts.project_id}
                cb    : cb
        (cb) ->
            if host?
                cb(); return
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    host = x
                    cb(err)
        (cb) ->
            if host?
                cb(); return
            dbg("project not deployed, so choose best host based on snapshots")
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    # randomize so not all in DC0...
                    v = ([snaps[0], Math.random(), host] for host, snaps of snapshots when snaps?.length >=1)
                    v.sort()
                    v.reverse()
                    dbg("v = #{misc.to_json(v)}")
                    if v.length == 0
                        # nothing to do -- project never opened
                        cb()
                    else
                        host = v[0][2]
                        cb()
        (cb) ->
            if not host?
                cb(); return
            dbg("project is available on #{host}")
            if opts.status?
                opts.status.project_host = host
            client = require('storage_server').client_project(project_id : opts.project_id)
            if client?
                cb()
            else
                cb("what the heck -- client not defined!?")
        (cb) ->
            if not host?
                cb(); return
            if opts.destroy
                dbg("destroy it")
                client.destroy
                    cb : cb
            else
                cb()
        (cb) ->
            if not host?
                cb(); return
            if opts.destroy
                dbg("delete it from db")
                client.action
                    action : 'sync_put_delete'
                    cb     : cb
            else
                cb()
        (cb) ->
            if not host?
                cb(); return
            client.open
                host : opts.server
                cb   : (err, data) =>
                    if err
                        cb(err)
                    else
                        if opts.status? and data?.host?
                            opts.status.migrate_host = data.host
                        cb()
        (cb) ->
            if not host?
                cb(); return
            dbg("do migrate action")
            client.migrate_from
                host : host
                cb   : cb
        (cb) ->
            if not host?
                cb(); return
            dbg("take a snapshot")
            client.snapshot
                cb   : cb
        (cb) ->
            if not host?
                cb(); return
            dbg("now save and close project")
            client.close(cb:cb)
        (cb) ->
            dbg("success -- record time of successful migration start in database")
            database.update
                table : 'projects'
                set   : {last_migrated3 : last_migrated3,  last_migrate3_error:undefined}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) =>
        if err
            database.update
                table : 'projects'
                set   : {last_migrate3_error : misc.to_json(err), last_migrated3 : last_migrated3}
                where : {project_id : opts.project_id}
        opts.cb(err)
    )


exports.xxx_migrate3_all = (opts) ->
    opts = defaults opts,
        limit : 20  # no more than this many projects will be migrated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        retry_errors : false   # also retry to migrate ones that failed with an error last time (normally those are ignored the next time)
        retry_all : false      # if true, just redo everything
        status: undefined      # if given, should be a list, which will get status for projects push'd as they are running.
        max_age_h : undefined  # if given, only consider projects that were modified in the last max_age_h hours.
        oldest_first : false
        only_new : false       # only try to migrate projects we haven't tried to migrate before.
        timeout : 7200         # timeout on any given migration -- actually leaves them running, but moves on...
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("#{new Date()} -- migrate3_all: #{m}")
    t = misc.walltime()
    limit = 100000


    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['last_edited', 'project_id', 'last_migrated3', 'last_migrate3_error']
                limit   : limit                 # should page, but no need since this is throw-away code.
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        result.sort()
                        if not opts.oldest_first
                            result.reverse()

                        if opts.start? and opts.stop?
                            result = result.slice(opts.start, opts.stop)
                        else if opts.start?
                            result = result.slice(opts.start)
                        else if opts.stop?
                            result = result.slice(0, opts.stop)

                        if opts.only_new
                            result = (x for x in result when not x[2]? and not x[3]?)

                        if opts.max_age_h?
                            cutoff = cassandra.hours_ago(opts.max_age_h)
                            result = (x for x in result when x[0]? and misc.to_iso(new Date(x[0])) >= cutoff)
                            dbg("considering only the #{result.length} projects that have a snapshot from within the last #{opts.max_age_h} hours")
                        if opts.retry_all
                            projects = (x[1] for x in result)
                        else if opts.retry_errors
                            projects = (x[1] for x in result when x[3]? or (not x[2]? or x[0] > x[2]))
                        else
                            # don't try any projects with errors, unless they have been newly modified
                            projects = (x[1] for x in result when (not x[2]? or x[0] > x[2]))
                        if opts.exclude?
                            v = {}
                            for p in opts.exclude
                                v[p] = true
                            projects = (p for p in projects when not v[p])
                        todo = projects.length
                        dbg("of these -- #{todo} in the range remain to be migrated")
                    cb(err)
        (cb) ->
            i = 1
            times = []
            start0 = misc.walltime()
            g = (i, cb) ->
                project_id = projects[i]
                dbg("*******************************************")
                dbg("Starting to migrate #{project_id}: #{i+1}/#{todo}")
                dbg("*******************************************")
                start = misc.walltime()
                if opts.status?
                    stat = {status:'migrating...', project_id:project_id}
                    opts.status.push(stat)
                exports.migrate3
                    project_id : project_id
                    status     : stat
                    cb         : (err) ->

                        tm = misc.walltime(start)
                        times.push(tm)
                        avg_time = times.reduce((t,s)->t+s)/times.length
                        eta_time = ((todo - times.length) * avg_time)/opts.limit

                        total_time = misc.walltime(start0)
                        avg_time2 = total_time / times.length
                        eta_time2 = (todo - times.length) * avg_time2

                        if err
                            if stat?
                                stat.status='failed'
                                stat.error = err
                                stat.walltime = misc.walltime(tm)
                            fail += 1
                        else
                            if stat?
                                stat.status='done'
                            done += 1
                        dbg("******************************************* ")
                        dbg("finished #{project_id} in #{tm} seconds     ")
                        dbg("MIGRATE_ALL (#{opts.limit} at once) STATUS: (success=#{done} + fail=#{fail} = #{done+fail})/#{todo}; #{todo-done-fail} left")
                        dbg("    total time     : #{total_time}")
                        dbg("    avg time per   : #{avg_time}s/each")
                        dbg("    eta if per     : #{eta_time/3600}h or #{eta_time/60}m")
                        dbg("    effective avg  : #{avg_time2}s/each")
                        dbg("    effective eta  : #{eta_time2/3600}h or #{eta_time2/60}m")
                        dbg("*******************************************")
                        if err
                            errors[project_id] = err
                        cb()
            f = (i, cb) ->
                h = () ->
                    dbg("timed out #{i}=#{projects[i]} after #{opts.timeout} seconds")
                    cb()
                timer = setTimeout(h, opts.timeout*1000)
                g i, () ->
                    clearTimeout(timer)
                    cb()

            async.mapLimit([0...projects.length], opts.limit, f, cb)
    ], (err) -> opts.cb?(err, errors))




exports.migrate4_schedule = (opts) ->
    opts = defaults opts,
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})
    dbg = (m) -> winston.debug("migrate4: #{m}")
    projects = undefined
    hosts = {}
    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id']
                limit   : 1000000
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results ")
                        result.sort()
                        projects = result
                    cb(err)
        (cb) ->
            dbg("creating schedule")
            for project_id in projects
                host = hashrings['1'].range(project_id, 1)[0]
                if not hosts[host]?
                    hosts[host] = [project_id]
                else
                    hosts[host].push(project_id)
            dbg("saving schedule to disk")
            for k, v of hosts
                fs.writeFileSync(k, v.join('\n'))
            cb()
    ], opts.cb?())


exports.migrate4_store_repos_in_db = (opts) ->
    opts = defaults opts,
        limit : 3   # number to store at once
        status : required
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})
    storage_server = require('storage_server')
    db = undefined
    projects = undefined

    # this happens sometimes... due to disconnect from database...
    process.addListener "uncaughtException", (err) ->
        winston.error("Uncaught exception: #{err}")

    async.series([
        (cb) ->
            storage_server.get_database (err, d) ->
                db = d
                cb(err)
        (cb) ->
            fs.readdir '/home/salvus/bup', (err, files) ->
                projects = files
                projects.sort()
                cb(err)
        (cb) ->
            g = (project_id, c) ->
                s = {project_id:project_id}
                opts.status.push(s)
                cs = db.chunked_storage(id:project_id)
                t = misc.walltime()
                cs.sync
                    path : "/home/salvus/bup/#{project_id}"
                    cb   : (err) ->
                        s.time = misc.walltime(t)
                        if err
                            s.error = err # error *recorded*
                        c() # keep going no matter what

            f = (project_id, c) ->
                h = () ->
                    dbg("timed out #{project_id} after 15 minutes")
                    c()
                    c = undefined
                timer = setTimeout(h, 15*60*1000)
                g project_id, () ->
                    clearTimeout(timer)
                    c?()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) -> opts.cb?(err))

exports.xxxmigrate_bup_all = (opts) ->
    opts = defaults opts,
        limit : 20           # no more than this many projects will be migrated simultaneously
        start : undefined    # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        retry_errors : false   # also retry to migrate ones that failed with an error last time (normally those are ignored the next time)
        retry_all : false      # if true, just redo everything
        status: undefined      # if given, should be a list, which will get status for projects push'd as they are running.
        max_age_h : undefined  # if given, only consider projects that were modified in the last max_age_h hours.
        only_new : false       # only try to migrate projects we haven't tried to migrate before.
        timeout : 7200         # timeout on any given migration -- actually leaves them running, but moves on...
        exclude : []
        loop  : 0              # if >=1; call it again with same inputs once it finishes
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("#{new Date()} -- migrate_bup_all: #{m}")
    t = misc.walltime()
    limit = 100000


    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            dbg("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'last_edited', 'last_migrate_bup', 'last_migrate_bup_error', 'abuser', 'last_snapshot']
                limit   : limit
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        result.sort()
                        if opts.start? and opts.stop?
                            result = result.slice(opts.start, opts.stop)
                        else if opts.start?
                            result = result.slice(opts.start)
                        else if opts.stop?
                            result = result.slice(0, opts.stop)

                        dbg("filter out known abusers: before #{result.length}")
                        result = (x for x in result when not x[4]?)
                        dbg("filter out known abusers: after #{result.length}")

                        dbg("filter out those that haven't ever had a snapshot: before #{result.length}")
                        result = (x for x in result when x[5]?)
                        dbg("filter out those that haven't ever had a snapshot: after #{result.length}")

                        if opts.only_new
                            result = (x for x in result when not x[2]? and not x[3]?)

                        if opts.max_age_h?
                            cutoff = cassandra.hours_ago(opts.max_age_h)
                            result = (x for x in result when x[1]? and misc.to_iso(new Date(x[1])) >= cutoff)
                            dbg("considering only the #{result.length} projects that have a snapshot from within the last #{opts.max_age_h} hours")
                        if opts.retry_all
                            projects = (x[0] for x in result)
                        else if opts.retry_errors
                            projects = (x[0] for x in result when x[3]? or (not x[2]? or x[1] > x[2]))
                        else
                            # don't try any projects with errors, unless they have been newly modified
                            projects = (x[0] for x in result when (not x[2]? or x[1] > x[2]))
                        if opts.exclude?
                            v = {}
                            for p in opts.exclude
                                v[p] = true
                            projects = (p for p in projects when not v[p])
                        todo = projects.length
                        dbg("of these -- #{todo} in the range remain to be migrated")
                    cb(err)
        (cb) ->
            i = 1
            times = []
            start0 = misc.walltime()
            g = (i, cb) ->
                project_id = projects[i]
                dbg("*******************************************")
                dbg("Starting to migrate #{project_id}: #{i+1}/#{todo}")
                dbg("*******************************************")
                start = misc.walltime()
                if opts.status?
                    stat = {status:'migrating...', project_id:project_id}
                    opts.status.push(stat)
                exports.migrate_bup
                    project_id : project_id
                    status     : stat
                    cb         : (err) ->

                        tm = misc.walltime(start)
                        times.push(tm)
                        avg_time = times.reduce((t,s)->t+s)/times.length
                        eta_time = ((todo - times.length) * avg_time)/opts.limit

                        total_time = misc.walltime(start0)
                        avg_time2 = total_time / times.length
                        eta_time2 = (todo - times.length) * avg_time2

                        if err
                            if stat?
                                stat.status='failed'
                                stat.error = err
                                stat.walltime = tm
                            fail += 1
                        else
                            if stat?
                                stat.status='done'
                            done += 1
                        dbg("******************************************* ")
                        dbg("finished #{project_id} in #{tm} seconds     ")
                        dbg("MIGRATE_ALL (loop=#{opts.loop+1}, #{opts.limit} at once) STATUS: (success=#{done} + fail=#{fail} = #{done+fail})/#{todo}; #{todo-done-fail} left")
                        dbg("    total time     : #{total_time}")
                        dbg("    avg time per   : #{avg_time}s/each")
                        dbg("    eta if per     : #{eta_time/3600}h or #{eta_time/60}m")
                        dbg("    effective avg  : #{avg_time2}s/each")
                        dbg("    effective eta  : #{eta_time2/3600}h or #{eta_time2/60}m")
                        dbg("*******************************************")
                        if err
                            errors[project_id] = err
                        cb()
            f = (i, cb) ->
                h = () ->
                    dbg("timed out #{i}=#{projects[i]} after #{opts.timeout} seconds")
                    cb()
                timer = setTimeout(h, opts.timeout*1000)
                g i, () ->
                    clearTimeout(timer)
                    cb()

            async.mapLimit([0...projects.length], opts.limit, f, cb)
    ], (err) ->
        if opts.loop
            f = () =>
                opts.loop += 1
                exports.migrate_bup_all(opts)
            winston.debug("WAITING 90 seconds to space things out... before doing loop #{opts.loop+1}")
            setTimeout(f, 1000*90)
            return
        opts.cb?(err, errors)
    )


# This NOW ASSUMES that prepare_bup completed.
exports.xxxmigrate_bup = (opts) ->
    opts = defaults opts,
        project_id : required
        server     : undefined   # rsync here...
        status     : undefined
        cb         : required
    dbg = (m) -> winston.debug("migrate3(#{opts.project_id}): #{m}")
    dbg()

    needs_update = undefined
    last_migrate_bup = cassandra.now()
    host = undefined
    hosts = undefined
    client = undefined
    last_migrate_bup_error = undefined   # could be useful to know below...
    abuser = undefined
    lastmod = undefined
    hashrings = undefined
    servers_by_dc = {}
    servers_by_id = {}
    targets = undefined
    async.series([
        (cb) ->
            dbg("getting last migration error...")
            database.select_one
                table : 'projects'
                columns : ['last_migrate_bup_error', 'last_snapshot']
                where : {project_id : opts.project_id}
                cb    : (err, result) =>
                    if err
                        cb(err)
                    else
                        last_migrate_bup_error = result[0]
                        lastmod = result[1]
                        dbg("last_migrate_bup_error = #{last_migrate_bup_error}")
                        cb()
        (cb) ->
            dbg("setting last_migrate_bup_error to start...")
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : "start"}
                where : {project_id : opts.project_id}
                cb    : cb
        (cb) ->
            if host?
                cb(); return
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    host = x
                    cb(err)
        (cb) ->
            dbg("get ordered list of hosts, based on newest snapshots")
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    # randomize so not all in same DC0...
                    v = ([snaps[0], Math.random(), host] for host, snaps of snapshots when snaps?.length >=1)
                    v.sort()
                    v.reverse()
                    v = (x[2] for x in v when x[2] != host)
                    if host?
                        v = [host].concat(v)
                    dbg("v = #{misc.to_json(v)}")
                    if v.length == 0
                        # nothing to do -- project never opened
                        hosts = undefined
                        cb()
                    else
                        hosts = v
                        cb()
        (cb) ->
            if not hosts?
                cb(); return
            dbg("project is available on #{hosts}")
            if opts.status?
                opts.status.hosts = hosts
            cb()

        (cb) ->
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                where     : {dummy:true}
                objectify : true
                cb        : (err, servers) =>
                    if err
                        cb(err)
                    else
                        for x in servers
                            x.host = cassandra.inet_to_str(x.host)
                            v = servers_by_dc[x.dc]
                            if not v?
                                servers_by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            servers_by_id[x.server_id] = x
                        hashrings = {}
                        for dc, servers of servers_by_dc
                            v = {}
                            for server in servers
                                v[server.server_id] = {vnodes:128}
                            console.log('making hashring from', v)
                            hashrings[dc] = new HashRing(v)
                        cb()


        (cb) ->
            dbg("get targets")
            database.select_one
                table : 'projects'
                where : {project_id : opts.project_id}
                columns : ['bup_last_save']
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        if result[0]? and misc.len(result[0]) == 3
                            targets = (servers_by_id[server_id].host for server_id, z of result[0])
                        else
                            targets = (servers_by_id[hashrings["#{n}"].range(opts.project_id, 1)[0]].host for n in [0,1,2])
                        cb()

        (cb) ->
            if not hosts?
                cb(); return
            done = false
            errors = {}
            f = (host, c) ->
                if done
                    c(); return
                dbg("run python script to migrate over from #{host}")
                misc_node.execute_code
                    command     : "/home/salvus/salvus/salvus/scripts/bup_storage_custom.py"
                    args        : ["migrate_remote", host, targets.join(','), Math.round(lastmod/1000), opts.project_id]
                    timeout     : 60*60
                    err_on_exit : false
                    cb          : (err, output) ->
                        if err
                            errors[host] = err
                            c()
                        else
                            out = output.stdout + output.stderr
                            if out.indexOf('ABUSE') != -1
                                done = true
                                # mark as an abusive project
                                abuser = true
                            if out.indexOf('SUCCESS') != -1
                                done = true
                                c()
                            else
                                errors[host] = output.stderr
                                c()

            async.mapSeries hosts, f, (err) ->
                if not done
                    cb("unable to migrate from any host! -- #{misc.to_json(errors)}")
                else
                    cb()
        (cb) ->
            dbg("success -- record time of successful migration start in database")
            database.update
                table : 'projects'
                set   : {last_migrate_bup : last_migrate_bup,  last_migrate_bup_error:undefined, abuser:abuser}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) =>
        if err
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : misc.to_json(err), last_migrate_bup : last_migrate_bup}
                where : {project_id : opts.project_id}
        opts.cb(err)
    )









exports.project_uid = project_uid = (project_id) ->
    shasum = require('crypto').createHash('sha512')
    shasum.update(project_id)
    n = Math.floor(parseInt(shasum.digest('hex').slice(0,8), 16) / 2)
    if n <=65537
        n += 65537
    return n



exports.prepare_bup = (opts) ->
    opts = defaults opts,
        limit : 1           # no more than this many simultaneous tasks
        start : 0
        end   : 10
        reverse : false
        dryrun : false
        cb    : undefined
        errors : required
    dbg = (m) -> winston.debug("prepare_bup(): #{m}")
    dbg()
    work = []

    servers_by_id = {}
    servers_by_dc = {}
    servers_hosting_project = {}
    projects_on_server = {}

    save_time = misc.to_iso(new Date(1396569559669))

    async.series([
        (cb) ->
            dbg("connect to database")
            connect_to_database(cb)
        (cb) ->
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                objectify : true
                cb        : (err, servers) =>
                    if err
                        cb(err)
                    else
                        for x in servers
                            x.host = cassandra.inet_to_str(x.host)
                            servers_by_id[x.server_id] = x
                            v = servers_by_dc[x.dc]
                            if not v?
                                servers_by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            projects_on_server[x.server_id] = []
                        cb()
        (cb) ->
            dbg("read in project allocation files")
            f = (server_id, cb) ->
                fs.readFile "bups/#{server_id}", (err, data) =>
                    if err
                        cb(err)
                    else
                        for project_id in data.toString().split('\n')
                            projects_on_server[server_id].push(project_id)
                            if not servers_hosting_project[project_id]?
                                servers_hosting_project[project_id] = []
                            if server_id.length != 36
                                weird.error
                            servers_hosting_project[project_id].push(server_id)
                        cb()
            v = ['0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc', '0985aa3e-c5e9-400e-8faa-32e7d5399dab', '2d7f86ce-14a3-41cc-955c-af5211f4a85e', '3056288c-a78d-4f64-af21-633214e845ad', '306ad75d-ffe0-43a4-911d-60b8cd133bc8', '44468f71-5e2d-4685-8d60-95c9d703bea0', '4e4a8d4e-4efa-4435-8380-54795ef6eb8f', '630910c8-d0ef-421f-894e-6f58a954f215', '767693df-fb0d-41a0-bb49-a614d7fbf20d', '795a90e2-92e0-4028-afb0-0c3316c48192', '801019d9-008a-45d4-a7ce-b72f6e99a74d', '806edbba-a66b-4710-9c65-47dd70503fc9', '8f5247e5-d449-4356-9ca7-1d971c79c7df', '94d4ebc1-d5fc-4790-affe-ab4738ca0384', '9e43d924-684d-479b-b601-994e17b7fd86', 'a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e', 'b9cd6c52-059d-44e1-ace0-be0a26568713', 'bc74ea05-4878-4c5c-90e2-facb70cfe338', 'c2ba4efc-8b4d-4447-8b0b-6a512e1cac97', 'd0bfc232-beeb-4062-9ad5-439c794594f3', 'd47df269-f3a3-47ed-854b-17d6d31fa4fd', 'dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1', 'e06fb88a-1683-41d6-97d8-92e1f3fb5196', 'e676bb5a-c46c-4b72-8d87-0ef62e4a5c88', 'e682408b-c165-4635-abef-d0c5809fee26', 'eec826ad-f395-4a1d-bfb1-20f5a19d4bb0', 'f71dab5b-f40c-48db-a3d2-eefe6ec55f01']
            async.map(v, f, cb)

        (cb) ->
            dbg("come up with a work schedule")

            # make some hashrings so that our work schedule is consistent between runs
            hashrings = {}
            for dc, servers of servers_by_dc
                v = {}
                for server in servers
                    v[server.server_id] = {vnodes:128}
                console.log('making hashring from', v)
                hashrings[dc] = new HashRing(v)

            data_centers = misc.keys(servers_by_dc)

            for project_id, servers of servers_hosting_project
                # Now for the real work.  servers is an array of the server_id's hosting the project right now.
                # We want to have the project with 1 copy in each dc, and for consistency for now will make
                # that the first one determined by consistent hashing.... if there are none already; otherwise,
                # we take the first of those available sorted in alphabetical order.
                # Once we know where we want things, we then delete some, copy some, and finally bup restore as well
                have = {}
                for dc in data_centers
                    have[dc] = false

                target = []
                servers.sort()

                for server_id in servers
                    dc = servers_by_id[server_id].dc
                    if not have[dc]
                        target.push(server_id)
                        have[dc] = true
                for dc, val of have
                    if not val
                        server_id = hashrings[dc].range(project_id, 1, true)[0]
                        #dbg("#{project_id}: adding new server_id = #{server_id}")
                        if server_id.length != 36
                            hash.ring.broken
                        target.push(server_id)

                if target.length != data_centers.length
                    cb("bug -- found target #{misc.to_json(target)} which has wrong length -- #{project_id}")

                # now target is a list of 3 (num dc's) servers and they are where we want our data.

                # we make our tasks so they can be done in parallel safely.

                # 1. copy data to servers that want from servers where we have data and want (!) and restore
                have_data = (server_id for server_id in target when server_id in servers)
                source = have_data[0]
                if not source?
                    cb("bug -- we don't have any data--  #{project_id}")
                for server_id in target
                    if server_id not in have_data
                        if server_id.length != 36
                             total.bug
                        work.push({project_id:project_id, action:'copy_and_restore', src:source, dest:server_id})

                # 2. delete data from where we don't want it
                for server_id in servers
                    if server_id not in target
                        work.push({project_id:project_id, action:'delete', server_id:server_id})

                # 3. bup restore working directory
                for server_id in target
                    if server_id in have_data
                        work.push({project_id:project_id, action:'restore', server_id:server_id})

                if not opts.reverse and opts.end != -1 and work.length >= opts.end
                    break

            # sort the work by project id
            work.sort (a,b) ->
                if a.project_id < b.project_id
                    return -1
                else if a.project_id > b.project_id
                    return 1
                else
                    return 0

            cb()

        (cb) ->
            if opts.end == -1
                opts.end = work.length
            dbg("do tasks #{opts.start} - #{opts.end-1} on the work schedule doing #{opts.limit} in parallel")
            #dbg("work to do: #{misc.to_json(work.slice(opts.start, opts.end))}")

            exec_on = (server_id, cmd, cb) ->
                host = servers_by_id[server_id]?['host']
                if not host?
                    dbg("invalid server #{server_id}")
                    cb("target server #{server_id} not found")
                    return
                dbg("on #{host}: #{cmd}")
                misc_node.execute_code
                    command     : "ssh"
                    args        : ["-o StrictHostKeyChecking=no", "root@#{host}", cmd]
                    timeout     : 120*60
                    err_on_exit : false
                    verbose     : false
                    cb          : (err, output) ->
                        if err
                            dbg("#{host}: #{cmd} -- FAIL #{err}")
                            cb(err)
                        else
                            v = output.stderr.split('\n')
                            for x in v
                               x = x.trim()
                               if x.length > 1 and x.indexOf('chattr:')==-1 and x.indexOf('WARNING') == -1 and x.indexOf('ECDSA') == -1
                                   dbg("{host}: #{cmd} -- ERROR due to '#{x}'")
                                   cb(output.stderr); return
                            cb()

            task_delete = (project_id, server_id, cb) ->
                if project_id.length != 36
                    cb("invalid uuid -- #{project_id}")
                else
                    exec_on(server_id, "rm -rf /bup/bups/#{project_id}", cb)

            task_copy = (project_id, src, dest, cb) ->
                host = servers_by_id[dest]?.host
                if not host?
                    cb("target server #{dest} not found")
                if project_id.length != 36
                    cb("invalid uuid -- #{project_id}")
                else
                    exec_on(src, "rsync -axH /bup/bups/#{project_id}/ #{host}:/bup/bups/#{project_id}/", cb)

            task_restore = (project_id, server_id, cb) ->
                uid = project_uid(project_id)
                if project_id.length != 36
                    cb("invalid uuid -- #{project_id}")
                    return
                done = false
                async.series([
                    (cb) ->
                        database.select_one
                            table : 'projects'
                            where : {project_id : project_id}
                            columns : ['bup_repo_corrupt']
                            cb      : (err, result) ->
                                if err
                                    cb(err)
                                else
                                    if result[0]?
                                        cb("bup repo known to be corrupt")
                                    else
                                        cb()
                    (cb) ->
                        database.select_one
                            table : 'projects'
                            where : {project_id : project_id}
                            columns : ['bup_last_save']
                            cb      : (err, result) ->
                                if err
                                    cb(err)
                                else
                                    if result[0]? and result[0][server_id]?
                                        done = true
                                    cb()
                    (cb) ->
                        if done
                            cb(); return
                        c = "rm -rf /bup/projects/#{project_id} && BUP_DIR=/bup/bups/#{project_id} bup restore --outdir=/bup/projects/#{project_id} master/latest/ ; chown -R #{uid}:#{uid} /bup/projects/#{project_id}"
                        exec_on server_id, c, (err) =>
                            if err
                                if err.indexOf('issing') != -1
                                    database.update
                                        table : 'projects'
                                        where : {project_id : project_id}
                                        set   : {'bup_repo_corrupt':true}
                                        cb    : (e) ->
                                            cb(err)
                                else
                                    cb(err)
                            else
                                cb()
                    (cb) ->
                        if done
                            cb(); return
                        q = "UPDATE projects set bup_last_save[?]=? where project_id=?"
                        database.cql(q, [server_id, save_time, project_id], cb)
                ], cb)

            i = opts.start
            goal = opts.end - 1
            do_task = (task, cb) ->
                dbg("******** #{i}/#{goal} ******* ")
                i += 1
                dbg("doing task #{misc.to_json(task)}")
                if opts.dryrun
                    cb(); return
                switch task.action
                    when 'delete'
                        task_delete(task.project_id, task.server_id, cb)
                    when 'copy_and_restore'
                        task_copy task.project_id, task.src, task.dest, (err) ->
                            if err
                                cb(err)
                            else
                                task_restore(task.project_id, task.dest, cb)
                    when 'restore'
                        task_restore(task.project_id, task.server_id, cb)
                    else
                        cb("unknown action #{task.action}")
            f = (task, cb) ->
                do_task task, (err) ->
                    if err
                        opts.errors.push(err)
                        winston.debug("ERROR -- #{err} on task #{misc.to_json(task)}")
                    cb()

            if opts.reverse
                work.reverse()
            if opts.end != -1
                work = work.slice(opts.start, opts.end)
            else
                work = work.slice(opts.start)
            async.mapLimit(work, opts.limit, f, cb)

    ], (err) -> opts.cb?(err))



exports.bup_set_quotas = (opts) ->
    opts = defaults opts,
        start : 0
        end : 10
        limit : 1
        qlimit : 1000000
        errors : required
        cb : undefined
    dbg = (m) -> winston.debug("bup_set_quotas: #{m}")
    dbg()

    work = []
    server_id_to_host = {}
    async.series([
        (cb) ->
            dbg("connect to database")
            connect_to_database(cb)
        (cb) ->
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                objectify : true
                cb        : (err, servers) =>
                    if err
                        cb(err)
                    else
                        for x in servers
                            server_id_to_host[x.server_id] = cassandra.inet_to_str(x.host)
                        cb()

        (cb) ->
            dbg("get all projects")
            database.select
                table     : 'projects'
                limit     : opts.qlimit
                columns   : ['project_id', 'bup_last_save', 'bup_working_size_kb', 'bup_repo_size_kb', 'settings']
                objectify : true
                cb        : (err, result) ->
                    if err
                        cb(err); return
                    for r in result
                        if r.bup_last_save? and (not r.bup_working_size_kb? or not r.bup_repo_size_kb? or not r.settings?['disk']?)
                            work.push({project_id:r.project_id, host:(server_id_to_host[server_id] for server_id,tm of r.bup_last_save)[0]})
                    cb()
        (cb) ->
            dbg("now do the work")
            exec_on = (host, cmd, cb) ->
                dbg("on #{host}: #{cmd}")
                misc_node.execute_code
                    command     : "ssh"
                    args        : ["-o StrictHostKeyChecking=no", "root@#{host}", cmd]
                    timeout     : 60*60
                    err_on_exit : false
                    verbose     : false
                    cb          : (err, output) ->
                        if err
                            dbg("#{host}: #{cmd} -- FAIL #{err}")
                            cb(err)
                        else
                            v = output.stderr.split('\n')
                            for x in v
                               x = x.trim()
                               if x.length > 1 and x.indexOf('chattr:')==-1 and x.indexOf('WARNING') == -1 and x.indexOf('ECDSA') == -1
                                   dbg("{host}: #{cmd} -- ERROR due to '#{x}'")
                                   cb(output.stderr); return
                            cb(undefined, output.stdout)

            i = 0
            f = (task, cb) ->
                dbg("*** #{i}/#{work.length-1} ***: #{misc.to_json(task)}")
                i += 1
                bup_repo_size_kb = undefined
                bup_working_size_kb = undefined
                async.series([
                    (cb) ->
                        exec_on task.host, "du -s -x --block-size=KB /bup/bups/#{task.project_id}", (err, output) ->
                            if err
                                cb(err)
                            else
                                bup_repo_size_kb = parseInt(output.split()[0].split('k')[0])
                                cb()
                    (cb) ->
                        exec_on task.host, "du -s -x --block-size=KB /bup/projects/#{task.project_id}", (err, output) ->
                            if err
                                cb(err)
                            else
                                bup_working_size_kb = parseInt(output.split()[0].split('k')[0])
                                cb()
                    (cb) ->
                        database.update
                            table : "projects"
                            set   : {bup_repo_size_kb : bup_repo_size_kb, bup_working_size_kb:bup_working_size_kb}
                            where : {project_id : task.project_id}
                            cb    : cb
                    (cb) ->
                        size = Math.round(bup_working_size_kb/1000)
                        cpu_shares = 1
                        if size <= 5000
                            disk = 5000
                        else
                            disk = 2*size
                        if size >= 11000
                            # If I ever upped their quota, they deserver more cpu
                            cpu_shares = 8
                        database.cql("UPDATE projects SET settings[?]=? WHERE project_id=?", ['disk',"#{disk}",task.project_id], cb)
                ], cb)

            work.sort (a,b) ->
                if a.project_id < b.project_id
                    return -1
                else if a.project_id > b.project_id
                    return 1
                else
                    return 0
            work = work.slice(opts.start, opts.end)
            g = (task, cb) ->
                f (task, err) ->
                    if err
                        errors.push({task:task, error:err})
                        winston.debug("error! -- #{err}")
                        winston.debug("#{errors.length} ERRORS so far")
                cb()
            async.mapLimit(work, opts.limit, f, cb)
    ], (err) -> opts.cb?(err))




exports.migrate2_bup_all = (opts) ->
    opts = defaults opts,
        limit : 1            # no more than this many projects will be migrated simultaneously
        qlimit : 100000
        start : undefined    # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        status: undefined      # if given, should be a list, which will get status for projects push'd as they are running.
        timeout : 2000         # timeout on any given migration -- actually leaves them running, but moves on...
        exclude : []
        only  : undefined      # if given, *ONLY* migrate projects in this list.
        reverse : false
        sort_by_time : true    # if true, stort by time (with newest first)
        loop  : 0              # if >=1; call it again with same inputs once it finishes
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("#{new Date()} -- migrate2_bup_all: #{m}")
    t = misc.walltime()
    servers = {by_id:{}, by_dc:{}}

    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                where     : {dummy:true}
                objectify : true
                cb        : (err, results) =>
                    if err
                        cb(err)
                    else
                        for x in results
                            x.host = cassandra.inet_to_str(x.host)
                            v = servers.by_dc[x.dc]
                            if not v?
                                servers.by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            servers.by_id[x.server_id] = x
                        cb()
        (cb) ->
            dbg("querying database...")
            where = undefined
            if opts.only
                where = {project_id:{'in':opts.only}}
            database.select
                table   : 'projects'
                columns : ['project_id', 'last_edited', 'bup_last_save', 'last_migrate_bup_error', 'abuser', 'last_snapshot']
                objectify : true
                limit   : opts.qlimit
                where   : where
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        result.sort (a,b) ->
                            if opts.sort_by_time
                                if a.last_edited > b.last_edited
                                    return -1
                                else if a.last_edited < b.last_edited
                                    return 1
                            if a.project_id < b.project_id
                                return -1
                            else if a.project_id > b.project_id
                                return 1
                            else
                                return 0

                        dbg("filter out known abusers: before #{result.length}")
                        result = (x for x in result when not x.abuser?)
                        dbg("filter out known abusers: after #{result.length}")

                        dbg("filter out those that haven't ever had a snapshot: before #{result.length}")
                        result = (x for x in result when x.last_snapshot?)
                        dbg("filter out those that haven't ever had a snapshot: after #{result.length}")

                        dbg("filter out those that are already done: before #{result.length}")
                        v = []
                        t = new Date(1396877998939)
                        for x in result
                            if not x.bup_last_save? or misc.len(x.bup_last_save) < 3
                                v.push(x)
                            else
                                for k, tm of x.bup_last_save
                                    if tm < t or tm < x.last_edited
                                        v.push(x)
                                        break
                        result = v
                        if opts.start? and opts.stop?
                            result = result.slice(opts.start, opts.stop)
                        else if opts.start?
                            result = result.slice(opts.start)
                        else if opts.stop?
                            result = result.slice(0, opts.stop)


                        projects = result
                        todo = projects.length
                        dbg("of these -- #{todo} in the range remain to be migrated")
                    cb(err)
        (cb) ->
            i = 1
            times = []
            start0 = misc.walltime()
            g = (i, cb) ->
                project = projects[i]
                project_id = project.project_id
                dbg("*******************************************")
                dbg("Starting to migrate #{project_id}: #{i+1}/#{todo}")
                dbg("*******************************************")
                start = misc.walltime()
                if opts.status?
                    stat = {status:'migrating...', project_id:project_id}
                    opts.status.push(stat)
                exports.migrate2_bup
                    project_id    : project_id
                    bup_last_save : project.bup_last_save
                    status        : stat
                    servers       : servers
                    cb            : (err) ->

                        tm = misc.walltime(start)
                        times.push(tm)
                        avg_time = times.reduce((t,s)->t+s)/times.length
                        eta_time = ((todo - times.length) * avg_time)/opts.limit

                        total_time = misc.walltime(start0)
                        avg_time2 = total_time / times.length
                        eta_time2 = (todo - times.length) * avg_time2

                        if err
                            if stat?
                                stat.status='failed'
                                stat.error = err
                                stat.walltime = tm
                            fail += 1
                        else
                            if stat?
                                stat.status='done'
                            done += 1
                        dbg("******************************************* ")
                        dbg("finished #{project_id} in #{tm} seconds     ")
                        dbg("MIGRATE_ALL (loop=#{opts.loop+1}, #{opts.limit} at once) STATUS: (success=#{done} + fail=#{fail} = #{done+fail})/#{todo}; #{todo-done-fail} left")
                        dbg("    total time     : #{total_time}")
                        dbg("    avg time per   : #{avg_time}s/each")
                        dbg("    eta if per     : #{eta_time/3600}h or #{eta_time/60}m")
                        dbg("    effective avg  : #{avg_time2}s/each")
                        dbg("    effective eta  : #{eta_time2/3600}h or #{eta_time2/60}m")
                        dbg("*******************************************")
                        if err
                            errors[project_id] = err
                        cb()
            f = (i, cb) ->
                h = () ->
                    dbg("timed out #{i}=#{projects[i]} after #{opts.timeout} seconds")
                    cb()
                timer = setTimeout(h, opts.timeout*1000)
                g i, () ->
                    clearTimeout(timer)
                    cb()

            v = [0...projects.length]
            if opts.reverse
                v.reverse()
            async.mapLimit(v, opts.limit, f, cb)
    ], (err) ->
        if opts.loop
            f = () =>
                opts.loop += 1
                exports.migrate2_bup_all(opts)
            winston.debug("WAITING 90 seconds to space things out... before doing loop #{opts.loop+1}")
            setTimeout(f, 1000*90)
            return
        opts.cb?(err, errors)
    )

exports.xxxmigrate2_bup = (opts) ->
    opts = defaults opts,
        project_id    : required
        bup_last_save : {}
        status        : undefined
        servers       : required
        cb            : required
    dbg = (m) -> winston.debug("migrate2_bup(#{opts.project_id}): #{m}")
    dbg()

    needs_update = undefined
    last_migrate_bup = cassandra.now()
    host = undefined
    hosts = undefined
    client = undefined
    last_migrate_bup_error = undefined   # could be useful to know below...
    abuser = undefined
    lastmod = undefined
    hashrings = undefined
    targets = undefined
    servers = opts.servers

    dbg("determine bup_last_save")
    if misc.len(opts.bup_last_save) < 3
        # ensure have at least one from each dc
        dcs = ("#{servers.by_id[x].dc}" for x in misc.keys(opts.bup_last_save))
        for dc in ['0','1','2']
            if dc not in dcs
                opts.bup_last_save[misc.random_choice(servers.by_dc[dc]).server_id] = new Date(0)
    dbg("bup_last_save=#{misc.to_json(opts.bup_last_save)}")



    async.series([
        (cb) ->
            if servers?
                cb(); return
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                where     : {dummy:true}
                objectify : true
                cb        : (err, results) =>
                    if err
                        cb(err)
                    else
                        for x in results
                            x.host = cassandra.inet_to_str(x.host)
                            v = servers.by_dc[x.dc]
                            if not v?
                                servers.by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            servers.by_id[x.server_id] = x
                        cb()

        (cb) ->
            dbg("setting last_migrate_bup_error to start...")
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : "start"}
                where : {project_id : opts.project_id}
                cb    : cb
        (cb) ->
            dbg("success -- record bup_last_save, etc.  in database -- so if interrupted use same choice next time")
            f = (k, c) ->
                d = opts.bup_last_save[k]
                if d.low? and d.low==0
                    d = new Date(0)
                database.cql("UPDATE projects set bup_last_save[?]=? WHERE project_id=?",
                             [k, d, opts.project_id], c)
            async.map(misc.keys(opts.bup_last_save), f, cb)
        (cb) ->
            cb(); return
            if host?
                cb(); return
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    host = x
                    cb(err)
        (cb) ->
            dbg("get ordered list of hosts, based on newest snapshots")
            dc0 = ("10.1.#{i}.4" for i in [1..7])
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    v = ([snaps[0], h] for h, snaps of snapshots when snaps?.length >=1)
                    v.sort (a,b) ->
                       if a[0] > b[0]
                           return -1
                       if a[0] < b[0]
                           return 1
                       #if a[1].slice(0,4) == '10.3'
                       #    return 1
                       #if b[1].slice(0,4) == '10.3'
                       #    return -1
                       #if a[1] in dc0
                       #    return -1
                       #if b[1] in dc0
                       #    return -1
                       return 0
                    v = (x[1] for x in v when x[1] != host)
                    if host?
                        v = [host].concat(v)
                    dbg("v = #{misc.to_json(v)}")
                    if v.length == 0
                        # nothing to do -- project never opened
                        hosts = undefined
                        cb()
                    else
                        hosts = v
                        cb()
        (cb) ->
            if not hosts?
                cb(); return
            dbg("project is available on #{hosts}")
            if opts.status?
                opts.status.hosts = hosts
            cb()


        (cb) ->
            if not hosts?
                cb(); return
            done = false
            targets = (servers.by_id[id].host for id in misc.keys(opts.bup_last_save))
            targets.sort()
            if opts.status?
                opts.status.targets = targets
            errors = {}
            f = (host, c) ->
                if done
                    c(); return
                it = misc.random_choice((x for x in targets when x != '10.1.1.5'))
                other_targets = (x for x in targets when x != it)
                dbg("run python script on #{it} to migrate over from #{host} to #{targets.join(',')}...")
                execute_on
                    user        : 'root'
                    host        : it
                    command     : "/home/salvus/salvus/salvus/scripts/bup_storage.py migrate_remote #{host} --targets=#{other_targets.join(',')} #{opts.project_id}"
                    timeout     : 3*60*60
                    err_on_exit : false
                    err_on_stderr : false
                    cb          : (err, output) ->
                        if err
                            errors[host] = err
                            c()
                        else
                            out = output.stdout + output.stderr
                            if out.indexOf('ABUSE') != -1
                                done = true
                                # mark as an abusive project
                                abuser = true
                            if out.indexOf('SUCCESS') != -1
                                done = true
                                c()
                            else
                                errors[host] = output.stderr
                                c()

            async.mapSeries hosts, f, (err) ->
                if not done
                    cb(errors)
                else
                    cb()
        (cb) ->
            dbg("success -- record bup_last_save, etc.  in database")
            f = (k, c) ->
                database.cql("UPDATE projects set bup_last_save[?]=? WHERE project_id=?",
                             [k, last_migrate_bup, opts.project_id], c)
            async.map(misc.keys(opts.bup_last_save), f, cb)
        (cb) ->
            dbg("success -- record other stuff  in database")
            database.update
                table : 'projects'
                set   : {last_migrate_bup : last_migrate_bup,  last_migrate_bup_error:undefined, abuser:abuser}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) ->
        if err
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : misc.to_json(err), last_migrate_bup : last_migrate_bup}
                where : {project_id : opts.project_id}
        if opts.status?
            opts.status.error = err
        opts.cb(err)
    )



exports.delete_all_bup_saves = (limit, cb) ->
    projects = undefined

    j = 0
    f = (project, c) ->
        j += 1
        if true or j % 1000 == 0
            console.log("#{j}/#{projects.length}")
        if not project.bup_last_save?
            c(); return
        console.log("updating #{project.project_id}")
        database.update
            table : "projects"
            set   : {bup_last_save: undefined, settings: undefined, bup_repo_size_kb:undefined, bup_working_size_kb:undefined}
            where : {project_id : project.project_id}
            consistency : 2
            cb    : c
    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            console.log("querying database...")
            database.select
                table   : 'projects'
                columns : ['project_id', 'bup_last_save']
                consistency : 2
                objectify : true
                limit   : limit
                cb      : (err, r) ->
                    projects = (x for x in r when x.bup_last_save?)
                    cb(err)
        (cb) ->
            console.log("got #{projects.length} results")
            async.mapLimit projects, 10, f, (err) ->
                console.log("DONE")
                cb()
    ], cb)


# fs.writeFileSync('s.json', JSON.stringify(s))

exports.project_to_user = (projects, cb) ->
    users = {}
    f = (project_id, cb) ->
        get_current_location
           project_id : project_id
           cb         : (err, host) ->
               if err
                   cb(err)
               else
                   users[project_id] = "#{username(project_id)}@#{host}"
                   cb()
    async.map(projects, f, (err) -> cb(err, users))




shuffle = (a) ->
    i = a.length
    while --i > 0
        j = ~~(Math.random() * (i + 1))
        t = a[j]
        a[j] = a[i]
        a[i] = t
    a


exports.migrate2_bup_all = (opts) ->
    opts = defaults opts,
        limit : 1            # no more than this many projects will be migrated simultaneously
        qlimit : 100000
        start : undefined    # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        status: undefined      # if given, should be a list, which will get status for projects push'd as they are running.
        timeout : 60*60        # timeout on any given migration -- actually leaves them running, but moves on...
        exclude : []
        only  : undefined      # if given, *ONLY* migrate projects in this list.
        force : false
        reverse : false
        replicate: true       
        sort_by_time : true    # if true, stort by time (with newest first)
        shuffle : false
        loop  : 0              # if >=1; call it again with same inputs once it finishes
        cb    : undefined      # cb(err, {project_id:errors when migrating that project})

    projects = undefined
    errors   = {}
    done = 0
    fail = 0
    todo = undefined
    dbg = (m) -> winston.debug("#{new Date()} -- migrate2_bup_all: #{m}")
    t = misc.walltime()
    servers = {by_id:{}, by_dc:{}, by_host:{}}

    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                where     : {dummy:true}
                objectify : true
                cb        : (err, results) =>
                    if err
                        cb(err)
                    else
                        for x in results
                            x.host = cassandra.inet_to_str(x.host)
                            v = servers.by_dc[x.dc]
                            if not v?
                                servers.by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            servers.by_id[x.server_id] = x
                            servers.by_host[x.host] = x
                        cb()
        (cb) ->
            dbg("querying database...")
            where = undefined
            if opts.only
                where = {project_id:{'in':opts.only}}
            database.select
                table   : 'projects'
                columns : ['project_id', 'last_edited', 'bup_last_save', 'abuser', 'last_snapshot']
                objectify : true
                limit   : opts.qlimit
                where   : where
                consistency : 1
                cb      : (err, result) ->
                    if result?
                        dbg("got #{result.length} results in #{misc.walltime(t)} seconds")
                        result.sort (a,b) ->
                            if opts.sort_by_time
                                if a.last_edited > b.last_edited
                                    return -1
                                else if a.last_edited < b.last_edited
                                    return 1
                            if a.project_id < b.project_id
                                return -1
                            else if a.project_id > b.project_id
                                return 1
                            else
                                return 0
                        if opts.shuffle
                            result = shuffle(result)
                        if opts.force
                            projects = result
                            cb(); return 

                        dbg("filter out known abusers: before #{result.length}")
                        result = (x for x in result when not x.abuser?)
                        dbg("filter out known abusers: after #{result.length}")

                        dbg("filter out those that haven't ever had a snapshot: before #{result.length}")
                        result = (x for x in result when x.last_snapshot?)
                        dbg("filter out those that haven't ever had a snapshot: after #{result.length}")

                        dbg("filter out those that are already done: before #{result.length}")
                        v = []
                        t = new Date(1396877998939)
                        for x in result
                            if not x.bup_last_save? or ((opts.replicate and misc.len(x.bup_last_save) < 3) or misc.len(x.bup_last_save)<1)
                                v.push(x)
                            else
                                if opts.replicate
                                    for k, tm of x.bup_last_save
                                        if tm < t or tm < x.last_edited
                                            v.push(x)
                                            break
                                else
                                    tm = Math.max((tm for k, tm of x.bup_last_save)...)  # best time
                                    if tm <= t or tm < x.last_edited
                                        v.push(x)
                                    
                        result = v
                        if opts.start? and opts.stop?
                            result = result.slice(opts.start, opts.stop)
                        else if opts.start?
                            result = result.slice(opts.start)
                        else if opts.stop?
                            result = result.slice(0, opts.stop)


                        projects = result
                        todo = projects.length
                        dbg("of these -- #{todo} in the range remain to be migrated")
                    cb(err)
        (cb) ->
            i = 1
            times = []
            start0 = misc.walltime()
            g = (i, cb) ->
                project = projects[i]
                project_id = project.project_id
                dbg("*******************************************")
                dbg("Starting to migrate #{project_id}: #{i+1}/#{todo}")
                dbg("*******************************************")
                start = misc.walltime()
                if opts.status?
                    stat = {status:'migrating...', project_id:project_id}
                    opts.status.push(stat)
                exports.migrate2_bup
                    project_id    : project_id
                    bup_last_save : project.bup_last_save
                    status        : stat
                    servers       : servers
                    replicate     : opts.replicate
                    cb            : (err) ->

                        tm = misc.walltime(start)
                        times.push(tm)
                        avg_time = times.reduce((t,s)->t+s)/times.length
                        eta_time = ((todo - times.length) * avg_time)/opts.limit

                        total_time = misc.walltime(start0)
                        avg_time2 = total_time / times.length
                        eta_time2 = (todo - times.length) * avg_time2

                        if err
                            if stat?
                                stat.status='failed'
                                stat.error = err
                                stat.walltime = tm
                            fail += 1
                        else
                            if stat?
                                stat.status='done'
                            done += 1
                        dbg("******************************************* ")
                        dbg("finished #{project_id} in #{tm} seconds     ")
                        dbg("MIGRATE_ALL (loop=#{opts.loop+1}, #{opts.limit} at once) STATUS: (success=#{done} + fail=#{fail} = #{done+fail})/#{todo}; #{todo-done-fail} left")
                        dbg("    total time     : #{total_time}")
                        dbg("    avg time per   : #{avg_time}s/each")
                        dbg("    eta if per     : #{eta_time/3600}h or #{eta_time/60}m")
                        dbg("    effective avg  : #{avg_time2}s/each")
                        dbg("    effective eta  : #{eta_time2/3600}h or #{eta_time2/60}m")
                        dbg("*******************************************")
                        if err
                            errors[project_id] = err
                        cb()
            f = (i, cb) ->
                h = () ->
                    dbg("timed out #{i}=#{misc.to_json(projects[i])} after #{opts.timeout} seconds")
                    cb()
                timer = setTimeout(h, opts.timeout*1000)
                g i, () ->
                    clearTimeout(timer)
                    cb()

            v = [0...projects.length]
            if opts.reverse
                v.reverse()
            async.mapLimit(v, opts.limit, f, cb)
    ], (err) ->
        if opts.loop
            f = () =>
                opts.loop += 1
                exports.migrate2_bup_all(opts)
            winston.debug("WAITING 2 minutes to space things out... before doing loop #{opts.loop+1}")
            setTimeout(f, 1000*60*2)
            return
        opts.cb?(err, errors)
    )

exports.data_center = data_center = (h) ->
    a = h.split('.')
    if a[1] == '3'
        return 2
    if parseInt(a[2]) >= 10
        return 0
    return 1

exports.migrate2_bup = (opts) ->
    opts = defaults opts,
        project_id    : required
        bup_last_save : {}
        status        : undefined
        servers       : required
        replicate     : true
        cb            : required
    dbg = (m) -> winston.debug("migrate2_bup(#{opts.project_id}): #{m}")
    dbg()

    needs_update = undefined
    last_migrate_bup = cassandra.now()
    host = undefined
    hosts = undefined
    client = undefined
    last_migrate_bup_error = undefined   # could be useful to know below...
    abuser = undefined
    lastmod = undefined
    hashrings = undefined
    targets = undefined
    servers = opts.servers




    async.series([
        (cb) ->
             dbg("re-determine bup_last_save")
             database.select_one
                 where : {project_id : opts.project_id}
                 columns : ['bup_last_save']
                 table   : 'projects'
                 consistency : 2
                 cb      : (err, result) -> 
                     if err
                         cb(err); return 
                     if not result[0]
                         opts.bup_last_save = {}
                     else
                         opts.bup_last_save = result[0]
                     dbg("result=#{misc.to_json(result)}")
                     if misc.len(opts.bup_last_save) < 3
                         # ensure have at least one from each dc
                         dcs = ("#{servers.by_id[x].dc}" for x in misc.keys(opts.bup_last_save))
                         for dc in ['0','1','2']
                             if dc not in dcs
                                 opts.bup_last_save[misc.random_choice(servers.by_dc[dc]).server_id] = new Date(0)
                     dbg("bup_last_save=#{misc.to_json(opts.bup_last_save)}")
                     cb()
        (cb) ->
            if servers?
                cb(); return
            dbg("get storage server information")
            database.select
                table     : "storage_servers"
                columns   : ['server_id', 'host', 'port', 'dc']
                where     : {dummy:true}
                objectify : true
                cb        : (err, results) =>
                    if err
                        cb(err)
                    else
                        for x in results
                            x.host = cassandra.inet_to_str(x.host)
                            v = servers.by_dc[x.dc]
                            if not v?
                                servers.by_dc[x.dc] = [x]
                            else
                                v.push(x)
                            servers.by_id[x.server_id] = x
                        cb()

        (cb) ->
            dbg("setting last_migrate_bup_error to start...")
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : "start"}
                where : {project_id : opts.project_id}
                cb    : cb
        (cb) ->
            dbg("success -- record bup_last_save, etc.  in database -- so if interrupted use same choice next time")
            f = (k, c) ->
                d = opts.bup_last_save[k]
                if d.low? and d.low==0
                    d = new Date(0)
                database.cql("UPDATE projects set bup_last_save[?]=? WHERE project_id=?",
                             [k, d, opts.project_id], c)
            async.map(misc.keys(opts.bup_last_save), f, cb)
        (cb) ->
            if host?
                cb(); return
            dbg("get current location of project from database")
            get_current_location
                project_id : opts.project_id
                cb         : (err, x) ->
                    host = x
                    cb(err)
        (cb) ->
            dbg("get ordered list of hosts, based on newest snapshots")
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    v = ([snaps[0], h] for h, snaps of snapshots when snaps?.length >=1)
                    v.sort (a,b) ->
                       if a[0] > b[0]
                           return -1
                       if a[0] < b[0]
                           return 1
                       return 0
                    v = (x[1] for x in v when x[1] != host)
                    if host?
                        v = [host].concat(v)
                    # huge number of very old unused projects hosted on 10.1.1.4 but not touched in forever
                    #v = (x for x in v when x not in ['10.1.1.4','10.1.2.4','10.1.3.4','10.1.4.4'])
                    dbg("v = #{misc.to_json(v)}")
                    if v.length == 0
                        # nothing to do -- project never opened
                        hosts = undefined
                        cb()
                    else
                        hosts = v
                        cb()
        (cb) ->
            if not hosts?
                cb(); return
            dbg("project is available on #{hosts}")
            if opts.status?
                opts.status.hosts = hosts
            cb()


        (cb) ->
            if not hosts?
                cb(); return
            done = false
            targets = (servers.by_id[id].host for id in misc.keys(opts.bup_last_save))
            targets.sort()
            if opts.status?
                opts.status.targets = targets
            errors = {}
            f = (host, c) ->
                if done
                    c(); return


                # choose the migration_host to be the one in the same DC as the host of the project that we're migrating from.
                host_dc = data_center(host)
                for migrate_host in targets
                    if data_center(migrate_host) == host_dc
                        break

                # or choose it at random
                #migrate_host = misc.random_choice((x for x in targets when x != '10.1.18.5' and x != '10.1.1.5') ) 

                if opts.replicate
                    other_targets = (x for x in targets when x != migrate_host)
                else
                    other_targets = []
                    for x in targets
                        if x != migrate_host
                            # record where we really replicated in database.
                            delete opts.bup_last_save[servers.by_host[x].server_id]
                    if misc.len(opts.bup_last_save) != 1
                        #console.log("servers=", servers)
                        cb("BUG! - number of other targets wrong: targets=#{misc.to_json(targets)}; other_targets=#{misc.to_json(other_targets)}; migrate_host=#{migrate_host}; bup_last_save=#{misc.to_json(opts.bup_last_save)}")

                        return

                dbg("run python script on #{migrate_host} to migrate over from #{host} to #{targets.join(',')}...")
                execute_on
                    user        : 'root'
                    host        : migrate_host
                    command     : "/home/salvus/salvus/salvus/scripts/bup_storage.py migrate_remote #{host} --targets=#{other_targets.join(',')} #{opts.project_id}"
                    timeout     : 3*60*60
                    err_on_exit : false
                    err_on_stderr : false
                    cb          : (err, output) ->
                        if err
                            errors[host] = err
                            c()
                        else
                            out = output.stdout + output.stderr
                            if out.indexOf('ABUSE') != -1
                                done = true
                                # mark as an abusive project
                                abuser = true
                            if out.indexOf('SUCCESS') != -1
                                done = true
                                c()
                            else
                                errors[host] = output.stderr
                                c()

            async.mapSeries hosts, f, (err) ->
                if not done
                    cb(errors)
                else
                    cb()
        (cb) ->
            dbg("success -- record bup_last_save, etc.  in database")
            f = (k, c) ->
                database.cql("UPDATE projects set bup_last_save[?]=? WHERE project_id=?",
                             [k, last_migrate_bup, opts.project_id], c)
            async.map(misc.keys(opts.bup_last_save), f, cb)
        (cb) ->
            dbg("success -- record other stuff  in database")
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error:undefined, abuser:abuser}
                where : {project_id : opts.project_id}
                cb    : cb
    ], (err) ->
        if err
            database.update
                table : 'projects'
                set   : {last_migrate_bup_error : misc.to_json(err), last_migrate_bup : last_migrate_bup}
                where : {project_id : opts.project_id}
        if opts.status?
            opts.status.error = err
        opts.cb(err)
    )

