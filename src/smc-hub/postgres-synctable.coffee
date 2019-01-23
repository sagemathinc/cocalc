##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2017, Sagemath Inc.
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

###
Server side synchronized tables built on PostgreSQL, and basic support
for user get query updates.
###

require('ts-node').register()

EventEmitter = require('events')

immutable    = require('immutable')
async        = require('async')
underscore   = require('underscore')

{defaults} = misc = require('smc-util/misc')
required = defaults.required
misc_node = require('smc-util-node/misc_node')

{pg_type, one_result, all_results, quote_field} = require('./postgres-base')

{SCHEMA} = require('smc-util/schema')

{Changes} = require('./postgres/changefeed')

exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext

    _ensure_trigger_exists: (table, select, watch, cb) =>
        dbg = @_dbg("_ensure_trigger_exists(#{table})")
        dbg("select=#{misc.to_json(select)}")
        if misc.len(select) == 0
            cb('there must be at least one column selected')
            return
        tgname = trigger_name(table, select, watch)
        trigger_exists = undefined
        async.series([
            (cb) =>
                dbg("checking whether or not trigger exists")
                @_query
                    query : "SELECT count(*) FROM pg_trigger WHERE tgname = '#{tgname}'"
                    cb    : (err, result) =>
                        if err
                            cb(err)
                        else
                            trigger_exists = parseInt(result.rows[0].count) > 0
                            cb()
            (cb) =>
                if trigger_exists
                    dbg("trigger #{tgname} already exists")
                    cb()
                    return
                dbg("creating trigger #{tgname}")
                code = trigger_code(table, select, watch)
                async.series([
                    (cb) =>
                        @_query
                            query : code.function
                            cb    : cb
                    (cb) =>
                        @_query
                            query : code.trigger
                            cb    : cb
                ], cb)
        ], cb)

    _listen: (table, select, watch, cb) =>
        dbg = @_dbg("_listen(#{table})")
        dbg("select = #{misc.to_json(select)}")
        if not misc.is_object(select)
            cb('select must be an object')
            return
        if misc.len(select) == 0
            cb('there must be at least one column')
            return
        if not misc.is_array(watch)
            cb('watch must be an array')
            return
        @_listening ?= {}
        tgname = trigger_name(table, select, watch)
        if @_listening[tgname] > 0
            dbg("already listening")
            @_listening[tgname] += 1
            cb?(undefined, tgname)
            return
        async.series([
            (cb) =>
                dbg("ensure trigger exists")
                @_ensure_trigger_exists(table, select, watch, cb)
            (cb) =>
                dbg("add listener")
                @_query
                    query : "LISTEN #{tgname}"
                    cb    : cb
        ], (err) =>
            if err
                dbg("fail: err = #{err}")
                cb?(err)
            else
                @_listening[tgname] ?= 0
                @_listening[tgname] += 1
                dbg("success")
                cb?(undefined, tgname)
        )

    _notification: (mesg) =>
        #@_dbg('notification')(misc.to_json(mesg))  # this is way too verbose...
        @emit(mesg.channel, JSON.parse(mesg.payload))

    _clear_listening_state: =>
        @_listening = {}

    _stop_listening: (table, select, watch, cb) =>
        @_listening ?= {}
        tgname = trigger_name(table, select, watch)
        if not @_listening[tgname]? or @_listening[tgname] == 0
            cb?()
            return
        if @_listening[tgname] > 0
            @_listening[tgname] -= 1
        if @_listening[tgname] == 0
            @_query
                query : "UNLISTEN #{tgname}"
                cb    : cb

    # Server-side changefeed-updated table, which automatically restart changefeed
    # on error, etc.  See SyncTable docs where the class is defined.
    synctable: (opts) =>
        opts = defaults opts,
            table    : required
            columns  : undefined
            where    : undefined
            limit    : undefined
            order_by : undefined
            where_function : undefined # if given; a function of the *primary* key that returns true if and only if it matches the changefeed
            idle_timeout_s : undefined   # TODO: currently ignored
            cb       : undefined
        if @is_standby
            opts.cb?("synctable against standby database not allowed")
            return
        return new SyncTable(@, opts.table, opts.columns, opts.where, opts.where_function, opts.limit, opts.order_by, opts.cb)

    changefeed: (opts) =>
        opts = defaults opts,
            table  : required   # Name of the table
            select : required   # Map from field names to postgres data types. These must
                                # determine entries of table (e.g., primary key).
            watch  : required   # Array of field names we watch for changes
            where  : required   # Condition involving only the fields in select; or function taking obj with select and returning true or false
            cb     : required
        if @is_standby
            opts.cb?("changefeed against standby database not allowed")
            return
        new Changes(@, opts.table, opts.select, opts.watch, opts.where, opts.cb)
        return

    # Event emitter that
    project_and_user_tracker: (opts) =>
        opts = defaults opts,
            cb : required
        if @_project_and_user_tracker?
            opts.cb(undefined, @_project_and_user_tracker)
            return
        @_project_and_user_tracker_cbs ?= []
        @_project_and_user_tracker_cbs.push(opts.cb)
        if @_project_and_user_tracker_cbs.length == 1
            x = new ProjectAndUserTracker @, (err) =>
                if not err
                    @_project_and_user_tracker = x
                    x.on 'error', =>
                        delete @_project_and_user_tracker
                else
                    x = undefined
                for cb in @_project_and_user_tracker_cbs
                    cb?(err, x)
                delete @_project_and_user_tracker_cbs


class ProjectAndUserTracker extends EventEmitter
    constructor: (_db, cb) ->
        super()
        @_db = _db
        dbg = @_dbg('constructor')
        dbg("Initializing Project and user tracker...")
        @setMaxListeners(10000)  # every changefeed might result in a listener on this one object.
        # by a "set" we mean map to bool
        @_accounts = {} # set of accounts we care about
        @_users    = {} # map from from project_id to set of users of a given project
        @_projects = {} # map from account_id to set of projects of a given user
        @_collabs  = {} # map from account_id to map from account_ids to *number* of projects you have in common
        # create changefeed listening on changes to projects table
        @_db.changefeed
            table  : 'projects'
            select : {project_id:'UUID'}
            watch  : ['users']
            where  : {}
            cb     : (err, feed) =>
                if err
                    dbg("Error = #{err}")
                    cb(err)
                else
                    dbg("Done")
                    @_feed = feed
                    @_feed.on 'change', @_handle_change
                    @_feed.on 'error', @_handle_error
                    @_feed.on 'close', (=> @_handle_error("changefeed closed"))
                    cb()
    _dbg: (f) =>
        return @_db._dbg("Tracker.#{f}")

    _handle_error: (err) =>
        if @_closed
            return
        # There was an error in the changefeed.
        # Error is totally fatal, so we close up shop.
        dbg = @_dbg("_handle_error")
        dbg("err='#{err}'")
        @emit('error', err)
        @close()

    close: =>
        if @_closed
            return
        @_closed = true
        @emit('close')
        @removeAllListeners()
        @_feed?.close()
        delete @_feed

    _handle_change: (x) =>
        if x.action == 'delete'
            project_id = x.old_val.project_id
            if not @_users[project_id]?
                # no users
                return
            for account_id of @_users[project_id]
                @_remove_user_from_project(account_id, project_id)
            return
        # users on a project changed or project created
        project_id = x.new_val.project_id
        @_db._query
            query : "SELECT jsonb_object_keys(users) AS account_id FROM projects"
            where : "project_id = $::UUID":project_id
            cb    : all_results 'account_id', (err, users) =>
                if err
                    # TODO! -- will have to try again... or make a version of _query that can't fail...?
                    return
                if not @_users[project_id]?
                    # we are not already watching this project
                    any = false
                    for account_id in users
                        if @_accounts[account_id]
                            any = true
                            break
                    if not any
                        # *and* none of our tracked users are on this project... so don't care
                        return

                # first add any users who got added, and record which accounts are relevant
                users_now    = {}
                for account_id in users
                    users_now[account_id] = true
                users_before = @_users[project_id] ? {}
                for account_id of users_now
                    if not users_before[account_id]
                        @_add_user_to_project(account_id, project_id)
                for account_id of users_before
                    if not users_now[account_id]
                        @_remove_user_from_project(account_id, project_id)

    # add and remove user from a project, maintaining our data structures (@_accounts, @_projects, @_collabs)
    _add_user_to_project: (account_id, project_id) =>
        dbg = @_dbg('_add_user_to_project')
        if account_id?.length != 36 or project_id?.length != 36
            # nothing to do -- better than crashing the server...
            dbg("WARNING: invalid account_id (='#{account_id}') or project_id (='#{project_id}')")
            return
        if @_projects[account_id]?[project_id]
            return
        @emit 'add_user_to_project', {account_id:account_id, project_id:project_id}
        users = @_users[project_id] ?= {}
        users[account_id] = true
        projects = @_projects[account_id] ?= {}
        projects[project_id] = true
        collabs = @_collabs[account_id] ?= {}
        for other_account_id of users
            if collabs[other_account_id]?
                collabs[other_account_id] += 1
            else
                collabs[other_account_id] = 1
                @emit 'add_collaborator', {account_id:account_id, collab_id:other_account_id}
            other_collabs = @_collabs[other_account_id]
            if other_collabs[account_id]?
                other_collabs[account_id] += 1
            else
                other_collabs[account_id] = 1
                @emit 'add_collaborator', {account_id:other_account_id, collab_id:account_id}

    _remove_user_from_project: (account_id, project_id, no_emit) =>
        if account_id?.length != 36 or project_id?.length != 36
            throw Error("invalid account_id or project_id")
        if not @_projects[account_id]?[project_id]
            return
        if not no_emit
            @emit 'remove_user_from_project', {account_id:account_id, project_id:project_id}
        collabs = @_collabs[account_id] ?= {}
        for other_account_id of @_users[project_id]
            @_collabs[account_id][other_account_id] -= 1
            if @_collabs[account_id][other_account_id] == 0
                delete @_collabs[account_id][other_account_id]
                if not no_emit
                    @emit 'remove_collaborator', {account_id:account_id, collab_id:other_account_id}
            @_collabs[other_account_id][account_id] -= 1
            if @_collabs[other_account_id][account_id] == 0
                delete @_collabs[other_account_id][account_id]
                if not no_emit
                    @emit 'remove_collaborator', {account_id:other_account_id, collab_id:account_id}
        delete @_users[project_id][account_id]
        delete @_projects[account_id][project_id]

    # Register the given account so that this client watches the database
    # in order to be aware of all projects and collaborators of the
    # given account.
    register: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if @_accounts[opts.account_id]?
            # already registered
            opts.cb()
            return
        @_register_todo ?= {}
        if misc.len(@_register_todo) == 0
            # no registration is currently happening
            @_register_todo[opts.account_id] = [opts.cb]
            # kick things off -- this will keep registering accounts
            # until everything is done, then set @_register_todo to undefined
            @_register()
        else
            # Accounts are being registered right now.  Add to the todo list.
            v = @_register_todo[opts.account_id]
            if v?
                v.push(opts.cb)
            else
                @_register_todo[opts.account_id] = [opts.cb]

    # Call _register to completely clear the work @_register_todo work queue.
    # NOTE: _register does each account, *one after another*, rather than doing
    # everything in parallel.   WARNING: DO NOT rewrite this to do everything in parallel,
    # unless you think you thoroughly understand the algorithm, since I think
    # doing things in parallel would horribly break!
    _register: =>
        account_id = misc.keys(@_register_todo)?[0]
        if not account_id?
            # no work
            return
        # Register this account
        dbg = @_dbg("_register")
        dbg("registering account='#{account_id}'...")
        @_db._query
            query  : "SELECT project_id, json_agg(o) as users FROM (select project_id, jsonb_object_keys(users) AS o FROM projects WHERE users ? $1::TEXT) s group by s.project_id"
            params : [account_id]
            cb     : all_results (err, x) =>
                if not err
                    @_accounts[account_id] = true
                    for a in x
                        if @_users[a.project_id]?
                            # already have data about this project
                            continue
                        else
                            for collab_account_id in a.users
                                # NOTE: Very rarely, sometimes collab_account_id is not defined
                                if collab_account_id?
                                    @_add_user_to_project(collab_account_id, a.project_id)
                # call the callbacks
                if err
                    dbg("error registering '#{account_id}' -- err=#{err}")
                else
                    dbg("successfully registered '#{account_id}'")
                for cb in @_register_todo[account_id]
                    cb?(err)
                # We are done (trying to) register account_id, for good or ill.
                delete @_register_todo[account_id]
                if misc.len(@_register_todo) > 0
                    # Deal with next account that needs to be registered
                    @_register()

    unregister: (opts) =>
        opts = defaults opts,
            account_id : required
        if not @_accounts[opts.account_id]?
            return
        v = []
        for project_id of @_projects[opts.account_id]
            v.push(project_id)
        delete @_accounts[opts.account_id]
        # Forget about any projects they we are on that are no longer
        # necessary to watch...
        for project_id in v
            need = false
            for account_id of @_users[project_id]
                if @_accounts[account_id]?
                    need = true
                    break
            if not need
                for account_id of @_users[project_id]
                    @_remove_user_from_project(account_id, project_id, true)
                delete @_users[project_id]
        return

    # return *set* of projects that this user is a collaborator on
    projects: (account_id) =>
        if not @_accounts[account_id]?
            # This should never happen, but very rarely it DOES.  I do not know why, having studied the
            # code.  But when it does, just raising an exception blows up the server really badly.
            # So for now we just async register the account, return that it is not a collaborator
            # on anything.  Then some query will fail, get tried again, and work since registration will
            # have finished.
            #throw Error("account (='#{account_id}') must be registered")
            @register(account_id:account_id, cb:->)
            return {}
        return @_projects[account_id] ? {}

    # map from collabs of account_id to number of projects they collab on (account_id itself counted twice)
    collabs: (account_id) =>
        return @_collabs[account_id]


class SyncTable extends EventEmitter
    constructor: (_db, _table, _columns, _where, _where_function, _limit, _order_by, cb) ->
        super()
        @_db             = _db
        @_table          = _table
        @_columns        = _columns
        @_where          = _where
        @_where_function = _where_function
        @_limit          = _limit
        @_order_by       = _order_by
        t = SCHEMA[@_table]
        if not t?
            @_state = 'error'
            cb?("unknown table #{@_table}")
            return

        try
            @_primary_key = @_db._primary_key(@_table)
        catch e
            cb?(e)
            return

        @_listen_columns = {"#{@_primary_key}" : pg_type(t.fields[@_primary_key], @_primary_key)}

        # We only trigger an update when one of the columns we care about actually changes.

        if @_columns
            @_watch_columns = misc.copy(@_columns)  # don't include primary key since it can't change.
            if @_primary_key not in @_columns
                @_columns = @_columns.concat([@_primary_key])  # required
            @_select_columns = @_columns
        else
            @_watch_columns = [] # means all of them
            @_select_columns = misc.keys(SCHEMA[@_table].fields)

        @_select_query = "SELECT #{(quote_field(x) for x in @_select_columns)} FROM #{@_table}"

        #@_update = underscore.throttle(@_update, 500)

        @_init (err) =>
            if err and not cb?
                @emit("error", err)
                return
            @emit('init')
            cb?(err, @)

    _dbg: (f) =>
        return @_db._dbg("SyncTable(table='#{@_table}').#{f}")

    _query_opts: () =>
        opts = {}
        opts.query = @_select_query
        opts.where = @_where
        opts.limit = @_limit
        opts.order_by = @_order_by
        return opts

    close: (cb) =>
        @removeAllListeners()
        @_db.removeListener(@_tgname, @_notification)
        @_db.removeListener('connect', @_reconnect)
        delete @_value
        @_state = 'closed'
        @_db._stop_listening(@_table, @_listen_columns, @_watch_columns, cb)

    connect: (opts) =>
        opts?.cb?() # NO-OP -- only needed for backward compatibility

    _notification: (obj) =>
        #console.log 'notification', obj
        [action, new_val, old_val] = obj
        if action == 'DELETE' or not new_val?
            k = old_val[@_primary_key]
            if @_value.has(k)
                @_value = @_value.delete(k)
                process.nextTick(=>@emit('change', k))
        else
            k = new_val[@_primary_key]
            if @_where_function? and not @_where_function(k)
                # doesn't match -- nothing to do -- ignore
                return
            @_changed[k] = true
            @_update()

    _init: (cb) =>
        misc.retry_until_success
            f           : @_do_init
            start_delay : 3000
            max_delay   : 10000
            log         : @_dbg("_init")
            cb          : cb

    _do_init: (cb) =>
        @_state = 'init' # 'init' -> ['error', 'ready'] -> 'closed'
        @_value = immutable.Map()
        @_changed = {}
        async.series([
            (cb) =>
                # ensure database client is listening for primary keys changes to our table
                @_db._listen @_table, @_listen_columns, @_watch_columns, (err, tgname) =>
                    @_tgname = tgname
                    @_db.on(@_tgname, @_notification)
                    cb(err)
            (cb) =>
                opts = @_query_opts()
                opts.cb = (err, result) =>
                    if err
                        cb(err)
                    else
                        @_process_results(result.rows)
                        @_db.once('connect', @_reconnect)
                        cb()
                @_db._query(opts)
            (cb) =>
                @_update(cb)
            ], (err) =>
                if err
                    @_state = 'error'
                    cb(err)
                else
                    @_state = 'ready'
                    cb()
            )

    _reconnect: (cb) =>
        dbg = @_dbg("_reconnect")
        if @_state != 'ready'
            dbg("only attempt reconnect if we were already successfully connected at some point.")
            return
        # Everything was already initialized, but then the connection to the
        # database was dropped... and then successfully re-connected.  Now
        # we need to (1) setup everything again, and (2) send out notifications
        # about anything in the table that changed.

        dbg("Save state from before disconnect")
        before = @_value

        dbg("Clean up everything.")
        @_db.removeListener(@_tgname, @_notification)
        @_db.removeListener('connect', @_reconnect)
        delete @_value

        dbg("connect and initialize")
        @_init (err) =>
            if err
                cb?(err)
                return
            if @_value? and before?
                # It's highly unlikely that before or @_value would not be defined, but it could happen (see #2527)
                dbg("notify about anything that changed when we were disconnected")
                before.map (v, k) =>
                    if not v.equals(@_value.get(k))
                        @emit('change', k)
                @_value.map (v, k) =>
                    if not before.has(k)
                        @emit('change', k)
            cb?()

    _process_results: (rows) =>
        if @_state == 'closed'
            return
        for x in rows
            k = x[@_primary_key]
            v = immutable.fromJS(misc.map_without_undefined(x))
            if not v.equals(@_value.get(k))
                @_value = @_value.set(k, v)
                if @_state == 'ready'   # only send out change notifications after ready.
                    process.nextTick(=>@emit('change', k))

    # Remove from synctable anything that no longer matches the where criterion.
    _process_deleted: (rows, changed) =>
        kept = {}
        for x in rows
            kept[x[@_primary_key]] = true
        for k of changed
            if not kept[k] and @_value.has(k)
                # The record with primary_key k no longer matches the where criterion
                # so we delete it from our synctable.
                @_value = @_value.delete(k)
                if @_state == 'ready'
                    process.nextTick(=>@emit('change', k))

    # Grab any entries from table about which we have been notified of changes.
    _update: (cb) =>
        if misc.len(@_changed) == 0 # nothing to do
            cb?()
            return
        changed = @_changed
        @_changed = {}  # reset changed set -- could get modified during query below, which is fine.
        if @_select_columns.length == 1  # special case where we don't have to query for more info
            @_process_results((("#{@_primary_key}" : x) for x in misc.keys(changed)))
            cb?()
            return

        # Have to query to get actual changed data.
        @_db._query
            query : @_select_query
            where : [{"#{@_primary_key} = ANY($)" : misc.keys(changed)}, @_where]
            cb    : (err, result) =>
                if err
                    @_dbg("update")("error #{err}")
                    for k of changed
                        @_changed[k] = true   # will try again later
                else
                    @_process_results(result.rows)
                    @_process_deleted(result.rows, changed)
                cb?()

    get: (key) =>
        return if key? then @_value?.get(key) else @_value

    getIn: (x) =>
        return @_value?.getIn(x)

    has: (key) =>
        return @_value?.has(key)

    # wait until some function of this synctable is truthy
    wait: (opts) =>
        opts = defaults opts,
            until   : required     # waits until "until(@)" evaluates to something truthy
            timeout : 30           # in *seconds* -- set to 0 to disable (sort of DANGEROUS if 0, obviously.)
            cb      : required     # cb(undefined, until(@)) on success and cb('timeout') on failure due to timeout
        x = opts.until(@)
        if x
            opts.cb(undefined, x)  # already true
            return
        fail_timer = undefined
        f = =>
            x = opts.until(@)
            if x
                @removeListener('change', f)
                if fail_timer?
                    clearTimeout(fail_timer)
                    fail_timer = undefined
                opts.cb(undefined, x)
        @on('change', f)
        if opts.timeout
            fail = =>
                @removeListener('change', f)
                opts.cb('timeout')
            fail_timer = setTimeout(fail, 1000*opts.timeout)
        return

###
Trigger functions
###
trigger_name = (table, select, watch) ->
    if not misc.is_object(select)
        throw Error("trigger_name -- columns must be a map of colname:type")
    c = misc.keys(select)
    c.sort()
    watch = misc.copy(watch)
    watch.sort()
    if watch.length > 0
        c.push('|')
        c = c.concat(watch)
    return 'change_' + misc_node.sha1("#{table} #{c.join(' ')}").slice(0,16)

###
INPUT:
    table  -- name of a table
    select -- map from field names (of table) to their postgres types
    change -- array of field names (of table)

Creates a trigger function that fires whenever any of the given
columns changes, and sends the columns in select out as a notification.
###

trigger_code = (table, select, watch) ->
    tgname          = trigger_name(table, select, watch)
    column_decl_old = ("#{field}_old #{type ? 'text'};"   for field, type of select)
    column_decl_new = ("#{field}_new #{type ? 'text'};"   for field, type of select)
    assign_old      = ("#{field}_old = OLD.#{field};"     for field, _ of select)
    assign_new      = ("#{field}_new = NEW.#{field};"     for field, _ of select)
    build_obj_old   = ("'#{field}', #{field}_old"         for field, _ of select)
    build_obj_new   = ("'#{field}', #{field}_new"         for field, _ of select)
    if watch.length > 0
        no_change   = ("OLD.#{field} = NEW.#{field}" for field in watch.concat(misc.keys(select))).join(' AND ')
    else
        no_change = 'FALSE'
    if watch.length > 0
        x = {}
        for k in watch
            x[k] = true
        for k in misc.keys(select)
            x[k] = true
        update_of = "OF #{(quote_field(field) for field in misc.keys(x)).join(',')}"
    else
        update_of = ""
    code = {}
    code.function = """
CREATE OR REPLACE FUNCTION #{tgname}() RETURNS TRIGGER AS $$
    DECLARE
        notification json;
        obj_old json;
        obj_new json;
        #{column_decl_old.join('\n')}
        #{column_decl_new.join('\n')}
    BEGIN
        -- TG_OP is 'DELETE', 'INSERT' or 'UPDATE'
        IF TG_OP = 'DELETE' THEN
            #{assign_old.join('\n')}
            obj_old = json_build_object(#{build_obj_old.join(',')});
        END IF;
        IF TG_OP = 'INSERT' THEN
            #{assign_new.join('\n')}
            obj_new = json_build_object(#{build_obj_new.join(',')});
        END IF;
        IF TG_OP = 'UPDATE' THEN
            IF #{no_change} THEN
                RETURN NULL;
            END IF;
            #{assign_old.join('\n')}
            obj_old = json_build_object(#{build_obj_old.join(',')});
            #{assign_new.join('\n')}
            obj_new = json_build_object(#{build_obj_new.join(',')});
        END IF;
        notification = json_build_array(TG_OP, obj_new, obj_old);
        PERFORM pg_notify('#{tgname}', notification::text);
        RETURN NULL;
    END;
$$ LANGUAGE plpgsql;"""
    code.trigger = "CREATE TRIGGER #{tgname} AFTER INSERT OR DELETE OR UPDATE #{update_of} ON #{table} FOR EACH ROW EXECUTE PROCEDURE #{tgname}();"
    return code

###

NOTES: The following is a way to back the changes with a small table.
This allows to have changes which are larger than the hard 8000 bytes limit.
HSY did this with the idea of having a temporary workaround for a bug related to this.
https://github.com/sagemathinc/cocalc/issues/1718

1. Create a table trigger_notifications via the db-schema.
   For performance reasons, the table itself should be created with "UNLOGGED"
   see: https://www.postgresql.org/docs/current/static/sql-createtable.html
   (I've no idea how to specify that in the code here)

        schema.trigger_notifications =
            primary_key : 'id'
            fields:
                id:
                    type : 'uuid'
                    desc : 'primary key'
                time:
                    type : 'timestamp'
                    desc : 'time of when the change was created -- used for TTL'
                notification:
                    type : 'map'
                    desc : "notification payload -- up to 1GB"
            pg_indexes : [ 'time' ]

2. Modify the trigger function created by trigger_code above such that
   pg_notifies no longer contains the data structure,
   but a UUID for an entry in the trigger_notifications table.
   It creates that UUID on its own and stores the data via a normal insert.

         notification_id = md5(random()::text || clock_timestamp()::text)::uuid;
         notification = json_build_array(TG_OP, obj_new, obj_old);
         INSERT INTO trigger_notifications(id, time, notification)
         VALUES(notification_id, NOW(), notification);

3. PostgresQL::_notification is modified in such a way, that it looks up that UUID
   in the trigger_notifications table:

        @_query
            query: "SELECT notification FROM trigger_notifications WHERE id ='#{mesg.payload}'"
            cb : (err, result) =>
                if err
                    dbg("err=#{err}")
                else
                    payload = result.rows[0].notification
                    # dbg("payload: type=#{typeof(payload)}, data=#{misc.to_json(payload)}")
                    @emit(mesg.channel, payload)

   Fortunately, there is no string -> json conversion necessary.

4. Below, that function and trigger implement a TTL for the trigger_notifications table.
   The `date_trunc` is a good idea, because then there is just one lock + delete op
   per minute, instead of potentially at every write.

-- 10 minutes TTL for the trigger_notifications table, deleting only every full minute

CREATE FUNCTION delete_old_trigger_notifications() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM trigger_notifications
  WHERE time < date_trunc('minute', NOW() - '10 minute'::interval);
  RETURN NULL;
END;
$$;

-- creating the trigger

CREATE TRIGGER trigger_delete_old_trigger_notifications
  AFTER INSERT ON trigger_notifications
  EXECUTE PROCEDURE delete_old_trigger_notifications();

###

