#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

"""
User (and project) client queries

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
"""

MAX_CHANGEFEEDS_PER_CLIENT = 2000

# Reject all patches that have timestamp that is more than 3 minutes in the future.
MAX_PATCH_FUTURE_MS = 1000*60*3

EventEmitter = require('events')
async        = require('async')
underscore   = require('underscore')

{one_result, all_results, count_result, pg_type, quote_field} = require('./postgres-base')

{UserQueryQueue} = require('./postgres-user-query-queue')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{PROJECT_UPGRADES, SCHEMA} = require('smc-util/schema')

{file_use_times} = require('./postgres/file-use-times')

exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
    # Cancel all queued up queries by the given client
    cancel_user_queries: (opts) =>
        opts = defaults opts,
            client_id  : required
        @_user_query_queue?.cancel_user_queries(opts)

    user_query: (opts) =>
        opts = defaults opts,
            client_id  : undefined  # if given, uses to control number of queries at once by one client.
            priority   : undefined  # (NOT IMPLEMENTED) priority for this query (an integer [-10,...,19] like in UNIX)
            account_id : undefined
            project_id : undefined
            query      : required
            options    : []
            changes    : undefined
            cb         : undefined

        if opts.account_id?
            # Check for "sudo" by admin to query as a different user, which is done by specifying
            #    options = [..., {account_id:'uuid'}, ...].
            for x in opts.options
                if x.account_id?
                    # Check user is an admin, then change opts.account_id
                    @get_account
                        columns    : ['groups']
                        account_id : opts.account_id
                        cb         : (err, r) =>
                            if err
                                opts.cb?(err)
                            else if r['groups']? and 'admin' in r['groups']
                                opts.account_id = x.account_id
                                opts.options = (y for y in opts.options when not y['account_id']?)
                                # now do query with new opts and options not including account_id sudo.
                                @user_query(opts)
                            else
                                opts.cb?('user must be admin to sudo')
                    return

        if not opts.client_id?
            # No client_id given, so do not use query queue.
            delete opts.priority
            delete opts.client_id
            @_user_query(opts)
            return

        if not @_user_query_queue?
            o =
                do_query   : @_user_query
                dbg        : @_dbg('user_query_queue')
                concurrent : @concurrent
            @_user_query_queue ?= new UserQueryQueue(o)

        @_user_query_queue.user_query(opts)

    _user_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            query      : required
            options    : []         # used for initial query; **IGNORED** by changefeed!;
                                    #  - Use [{set:true}] or [{set:false}] to force get or set query
                                    #  - For a set query, use {delete:true} to delete instead of set.  This is the only way
                                    #    to delete a record, and won't work unless delete:true is set in the schema
                                    #    for the table to explicitly allow deleting.
            changes    : undefined  # id of change feed
            cb         : undefined  # cb(err, result)  # WARNING -- this *will* get called multiple times when changes is true!
        id = misc.uuid().slice(0,6)
        dbg = @_dbg("_user_query(id=#{id})")
        dbg(misc.to_json(opts.query))
        if misc.is_array(opts.query)
            dbg('array query instead')
            @_user_query_array(opts)
            return

        subs =
            '{account_id}' : opts.account_id
            '{project_id}' : opts.project_id
            '{now}'        : new Date()

        if opts.changes?
            changes =
                id : opts.changes
                cb : opts.cb

        v = misc.keys(opts.query)
        if v.length > 1
            dbg("FATAL no key")
            opts.cb?('FATAL: must specify exactly one key in the query')
            return
        table = v[0]
        query = opts.query[table]
        if misc.is_array(query)
            if query.length > 1
                dbg("FATAL not implemented")
                opts.cb?("FATAL: array of length > 1 not yet implemented")
                return
            multi = true
            query = query[0]
        else
            multi = false
        is_set_query = undefined
        if opts.options?
            if not misc.is_array(opts.options)
                dbg("FATAL options")
                opts.cb?("FATAL: options (=#{misc.to_json(opts.options)}) must be an array")
                return
            for x in opts.options
                if x.set?
                    is_set_query = !!x.set
            options = (x for x in opts.options when not x.set?)
        else
            options = []

        if misc.is_object(query)
            query = misc.deep_copy(query)
            misc.obj_key_subs(query, subs)
            if not is_set_query?
                is_set_query = not misc.has_null_leaf(query)
            if is_set_query
                dbg("do a set query")
                if changes
                    dbg("FATAL: changefeed")
                    opts.cb?("FATAL: changefeeds only for read queries")
                    return
                if not opts.account_id? and not opts.project_id?
                    dbg("FATAL: anon set")
                    opts.cb?("FATAL: no anonymous set queries")
                    return
                dbg("user_set_query")
                @user_set_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        dbg("returned #{err}")
                        opts.cb?(err, {"#{table}":x})
            else
                # do a get query
                if changes and not multi
                    dbg("FATAL: changefeed multi")
                    opts.cb?("FATAL: changefeeds only implemented for multi-document queries")
                    return

                if changes
                    err = @_inc_changefeed_count(opts.account_id, opts.project_id, table, changes.id)
                    if err
                        dbg("err changefeed count -- #{err}")
                        opts.cb?(err)
                        return

                dbg("user_get_query")
                @user_get_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : options
                    multi      : multi
                    changes    : changes
                    cb         : (err, x) =>
                        dbg("returned #{err}")
                        if err and changes
                            # didn't actually make the changefeed, so don't count it.
                            @_dec_changefeed_count(changes.id, table)
                        opts.cb?(err, if not err then {"#{table}":x})
        else
            dbg("FATAL - invalid table")
            opts.cb?("FATAL: invalid user_query of '#{table}' -- query must be an object")

    ###
    TRACK CHANGEFEED COUNTS

    _inc and dec below are evidently broken, in that it's CRITICAL that they match up exactly, or users will be
    locked out until they just happen to switch to another hub with different tracking, which is silly.

    TODO: DISABLED FOR NOW!
    ###

    # Increment a count of the number of changefeeds by a given client so we can cap it.
    _inc_changefeed_count: (account_id, project_id, table, changefeed_id) =>
        return
        client_name = "#{account_id}-#{project_id}"
        cnt = @_user_get_changefeed_counts ?= {}
        ids = @_user_get_changefeed_id_to_user ?= {}
        if not cnt[client_name]?
            cnt[client_name] = 1
        else if cnt[client_name] >= MAX_CHANGEFEEDS_PER_CLIENT
            return "user may create at most #{MAX_CHANGEFEEDS_PER_CLIENT} changefeeds; please close files, refresh browser, restart project"
        else
            # increment before successfully making get_query to prevent huge bursts causing trouble!
            cnt[client_name] += 1
        @_dbg("_inc_changefeed_count(table='#{table}')")("{#{client_name}:#{cnt[client_name]} ...}")
        ids[changefeed_id] = client_name
        return false

    # Corresonding decrement of count of the number of changefeeds by a given client.
    _dec_changefeed_count: (id, table) =>
        return
        client_name = @_user_get_changefeed_id_to_user[id]
        if client_name?
            @_user_get_changefeed_counts?[client_name] -= 1
            delete @_user_get_changefeed_id_to_user[id]
            cnt = @_user_get_changefeed_counts
            if table?
                t = "(table='#{table}')"
            else
                t = ""
            @_dbg("_dec_changefeed_count#{t}")("counts={#{client_name}:#{cnt[client_name]} ...}")

    # Handle user_query when opts.query is an array.  opts below are as for user_query.
    _user_query_array: (opts) =>
        if opts.changes and opts.query.length > 1
            opts.cb?("FATAL: changefeeds only implemented for single table")
            return
        result = []
        f = (query, cb) =>
            @user_query
                account_id : opts.account_id
                project_id : opts.project_id
                query      : query
                options    : opts.options
                cb         : (err, x) =>
                    result.push(x); cb(err)
        async.mapSeries(opts.query, f, (err) => opts.cb(err, result))

    user_query_cancel_changefeed: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined    # not really asynchronous
        dbg = @_dbg("user_query_cancel_changefeed(id='#{opts.id}')")
        feed = @_changefeeds?[opts.id]
        if feed?
            dbg("actually cancelling feed")
            @_dec_changefeed_count(opts.id)
            delete @_changefeeds[opts.id]
            feed.close()
        else
            dbg("already cancelled before (no such feed)")
        opts.cb?()

    _query_is_cmp: (obj) =>
        if not misc.is_object(obj)
            return false
        for k, _ of obj
            if k not in misc.operators
                return false
            return k
        return false

    _user_get_query_columns: (query, remove_from_query) =>
        v = misc.keys(query)
        if remove_from_query?
            # If remove_from_query is specified it should be an array of strings
            # and we do not includes these in what is returned.
            v = underscore.difference(v, remove_from_query)
        return v

    _require_is_admin: (account_id, cb) =>
        if not account_id?
            cb("FATAL: user must be an admin")
            return
        @is_admin
            account_id : account_id
            cb         : (err, is_admin) =>
                if err
                    cb(err)
                else if not is_admin
                    cb("FATAL: user must be an admin")
                else
                    cb()

    # Ensure that each project_id in project_ids is such that the account is in one of the given
    # groups for the project, or that the account is an admin.  If not, cb(err).
    _require_project_ids_in_groups: (account_id, project_ids, groups, cb) =>
        s = {"#{account_id}": true}
        require_admin = false
        @_query
            query : "SELECT project_id, users#>'{#{account_id}}' AS user FROM projects"
            where : "project_id = ANY($)":project_ids
            cache : true
            cb    : all_results (err, x) =>
                if err
                    cb(err)
                else
                    known_project_ids = {}  # we use this to ensure that each of the given project_ids exists.
                    for p in x
                        known_project_ids[p.project_id] = true
                        if p.user?.group not in groups
                            require_admin = true
                    # If any of the project_ids don't exist, reject the query.
                    for project_id in project_ids
                        if not known_project_ids[project_id]
                            cb("FATAL: unknown project_id '#{misc.trunc(project_id,100)}'")
                            return
                    if require_admin
                        @_require_is_admin(account_id, cb)
                    else
                        cb()

    _query_parse_options: (options) =>
        r = {}
        for x in options
            for name, value of x
                switch name
                    when 'only_changes'
                        r.only_changes = !!value
                    when 'limit'
                        r.limit = value
                    when 'slice'
                        r.slice = value
                    when 'order_by'
                        if value[0] == '-'
                            value = value.slice(1) + " DESC "
                        r.order_by = value
                    when 'delete'
                        null
                        # ignore delete here - is parsed elsewhere
                    when 'heartbeat'
                        @_dbg("_query_parse_options")("TODO/WARNING -- ignoring heartbeat option from old client")
                    else
                        r.err = "unknown option '#{name}'"
        return r

    ###
    SET QUERIES
    ###
    _parse_set_query_opts: (opts) =>
        r = {}

        if opts.project_id?
            dbg = r.dbg = @_dbg("user_set_query(project_id='#{opts.project_id}', table='#{opts.table}')")
        else if opts.account_id?
            dbg = r.dbg = @_dbg("user_set_query(account_id='#{opts.account_id}', table='#{opts.table}')")
        else
            return {err:"FATAL: account_id or project_id must be specified"}

        if not SCHEMA[opts.table]?
            return {err:"FATAL: table '#{opts.table}' does not exist"}

        dbg(misc.to_json(opts.query))

        if opts.options
            dbg("options=#{misc.to_json(opts.options)}")

        r.query      = misc.copy(opts.query)
        r.table      = opts.table
        r.db_table   = SCHEMA[opts.table].virtual ? opts.table
        r.account_id = opts.account_id
        r.project_id = opts.project_id

        s = SCHEMA[opts.table]

        if opts.account_id?
            r.client_query = s?.user_query
        else
            r.client_query = s?.project_query

        if not r.client_query?.set?.fields?
            return {err:"FATAL: user set queries not allowed for table '#{opts.table}'"}

        if not @_mod_fields(opts.query, r.client_query)
            dbg("shortcut -- no fields will be modified, so nothing to do")
            return

        for field in misc.keys(r.client_query.set.fields)
            if r.client_query.set.fields[field] == undefined
                return {err: "FATAL: user set query not allowed for #{opts.table}.#{field}"}
            val = r.client_query.set.fields[field]
            if typeof(val) == 'function'
                try
                    r.query[field] = val(r.query, @)
                catch err
                    return {err:"FATAL: error setting '#{field}' -- #{err}"}
            else
                switch val
                    when 'account_id'
                        if not r.account_id?
                            return {err: "FATAL: account_id must be specified"}
                        r.query[field] = r.account_id
                    when 'project_id'
                        if not r.project_id?
                            return {err: "FATAL: project_id must be specified"}
                        r.query[field] = r.project_id
                    when 'time_id'
                        r.query[field] = uuid.v1()
                    when 'project_write'
                        if not r.query[field]?
                            return {err: "FATAL: must specify #{opts.table}.#{field}"}
                        r.require_project_ids_write_access = [r.query[field]]
                    when 'project_owner'
                        if not r.query[field]?
                            return {err:"FATAL: must specify #{opts.table}.#{field}"}
                        r.require_project_ids_owner = [r.query[field]]

        if r.client_query.set.admin
            r.require_admin = true

        r.primary_keys = @_primary_keys(r.db_table)

        r.json_fields = @_json_fields(r.db_table, r.query)

        for k, v of r.query
            if k in r.primary_keys
                continue
            if r.client_query?.set?.fields?[k] != undefined
                continue
            if s.admin_query?.set?.fields?[k] != undefined
                r.require_admin = true
                continue
            return {err: "FATAL: changing #{r.table}.#{k} not allowed"}

        # HOOKS which allow for running arbitrary code in response to
        # user set queries.  In each case, new_val below is only the part
        # of the object that the user requested to change.

        # 0. CHECK: Runs before doing any further processing; has callback, so this
        # provides a generic way to quickly check whether or not this query is allowed
        # for things that can't be done declaratively.  The check_hook can also
        # mutate the obj (the user query), e.g., to enforce limits on input size.
        r.check_hook = r.client_query.set.check_hook

        # 1. BEFORE: If before_change is set, it is called with input
        #   (database, old_val, new_val, account_id, cb)
        # before the actual change to the database is made.
        r.before_change_hook = r.client_query.set.before_change

        # 2. INSTEAD OF: If instead_of_change is set, then instead_of_change_hook
        # is called with input
        #      (database, old_val, new_val, account_id, cb)
        # *instead* of actually doing the update/insert to
        # the database.  This makes it possible to run arbitrary
        # code whenever the user does a certain type of set query.
        # Obviously, if that code doesn't set the new_val in the
        # database, then new_val won't be the new val.
        r.instead_of_change_hook = r.client_query.set.instead_of_change

        # 3. AFTER:  If set, the on_change_hook is called with
        #   (database, old_val, new_val, account_id, cb)
        # after everything the database has been modified.
        r.on_change_hook = r.client_query.set.on_change

        # 4. instead of query
        r.instead_of_query = r.client_query.set.instead_of_query

        #dbg("on_change_hook=#{on_change_hook?}, #{misc.to_json(misc.keys(client_query.set))}")

        # Set the query options -- order doesn't matter for set queries (unlike for get), so we
        # just merge the options into a single dictionary.
        # NOTE: As I write this, there is just one supported option: {delete:true}.
        r.options = {}
        if r.client_query.set.options?
            for x in r.client_query.set.options
                for y, z of x
                    r.options[y] = z
        if opts.options?
            for x in opts.options
                for y, z of x
                    r.options[y] = z
        dbg("options = #{misc.to_json(r.options)}")

        if r.options.delete and not r.client_query.set.delete
            # delete option is set, but deletes aren't explicitly allowed on this table.  ERROR.
            return {err: "FATAL: delete from #{r.table} not allowed"}

        return r

    _user_set_query_enforce_requirements: (r, cb) =>
        async.parallel([
            (cb) =>
                if r.require_admin
                    @_require_is_admin(r.account_id, cb)
                else
                    cb()
            (cb) =>
                if r.require_project_ids_write_access?
                    if r.project_id?
                        err = undefined
                        for x in r.require_project_ids_write_access
                            if x != r.project_id
                                err = "FATAL: can only query same project"
                                break
                        cb(err)
                    else
                        @_require_project_ids_in_groups(r.account_id, r.require_project_ids_write_access,\
                                         ['owner', 'collaborator'], cb)
                else
                    cb()
            (cb) =>
                if r.require_project_ids_owner?
                    @_require_project_ids_in_groups(r.account_id, r.require_project_ids_owner,\
                                     ['owner'], cb)
                else
                    cb()
        ], cb)

    _user_set_query_where: (r) =>
        where = {}
        for primary_key in @_primary_keys(r.db_table)
            type  = pg_type(SCHEMA[r.db_table].fields[primary_key])
            value = r.query[primary_key]
            if type == 'TIMESTAMP' and not misc.is_date(value)
                # Javascript is better at parsing its own dates than PostgreSQL
                value = new Date(value)
            where["#{primary_key}=$::#{type}"] = value
        return where

    _user_set_query_values: (r) =>
        values = {}
        s = SCHEMA[r.db_table]
        for key, value of r.query
            type = pg_type(s?.fields?[key])
            if type?
                if type == 'TIMESTAMP' and not misc.is_date(value)
                    # (as above) Javascript is better at parsing its own dates than PostgreSQL
                    value = new Date(value)
                values["#{key}::#{type}"] = value
            else
                values[key] = value
        return values

    _user_set_query_hooks_prepare: (r, cb) =>
        if r.on_change_hook? or r.before_change_hook? or r.instead_of_change_hook?
            for primary_key in r.primary_keys
                if not r.query[primary_key]?
                    cb("FATAL: query must specify (primary) key '#{primary_key}'")
                    return
            # get the old value before changing it
            # TODO: optimization -- can we restrict columns below?
            @_query
                query : "SELECT * FROM #{r.db_table}"
                where : @_user_set_query_where(r)
                cb    : one_result (err, x) =>
                    r.old_val = x; cb(err)
        else
            cb()

    _user_query_set_count: (r, cb) =>
        @_query
            query : "SELECT COUNT(*) FROM #{r.db_table}"
            where : @_user_set_query_where(r)
            cb    : count_result(cb)

    _user_query_set_delete: (r, cb) =>
        @_query
            query : "DELETE FROM #{r.db_table}"
            where : @_user_set_query_where(r)
            cb    : cb

    _user_set_query_conflict: (r) =>
        return r.primary_keys

    _user_query_set_upsert: (r, cb) =>
        @_query
            query    : "INSERT INTO #{r.db_table}"
            values   : @_user_set_query_values(r)
            conflict : @_user_set_query_conflict(r)
            cb       : cb

    # Record is already in DB, so we update it:
    # this function handles a case that involves both
    # a jsonb_merge and an update.
    _user_query_set_upsert_and_jsonb_merge: (r, cb) =>
        jsonb_merge = {}
        for k of r.json_fields
            v = r.query[k]
            if v?
                jsonb_merge[k] = v
        set = {}
        for k, v of r.query
            if v? and k not in r.primary_keys and not jsonb_merge[k]?
                set[k] = v
        @_query
            query       : "UPDATE #{r.db_table}"
            jsonb_merge : jsonb_merge
            set         : set
            where       : @_user_set_query_where(r)
            cb          : cb

    _user_set_query_main_query: (r, cb) =>
        r.dbg("_user_set_query_main_query")
        if r.options.delete
            for primary_key in r.primary_keys
                if not r.query[primary_key]?
                    cb("FATAL: delete query must set primary key")
                    return
            r.dbg("delete based on primary key")
            @_user_query_set_delete(r, cb)
            return
        if r.instead_of_change_hook?
            r.instead_of_change_hook(@, r.old_val, r.query, r.account_id, cb)
        else
            if misc.len(r.json_fields) == 0
                # easy case -- there are no jsonb merge fields; just do an upsert.
                @_user_query_set_upsert(r, cb)
                return
            # HARD CASE -- there are json_fields... so we are doing an insert
            # if the object isn't already in the database, and an update
            # if it is.  This is ugly because I don't know how to do both
            # a JSON merge as an upsert.
            cnt = undefined  # will equal number of records having the primary key (so 0 or 1)
            async.series([
                (cb) =>
                    @_user_query_set_count r, (err, n) =>
                        cnt = n; cb(err)
                (cb) =>
                    if cnt == 0
                        # Just insert (do as upsert to avoid error in case of race)
                        @_user_query_set_upsert(r, cb)
                    else
                        # Do as an update -- record is definitely already in db since cnt > 0.
                        # This would fail in the unlikely (but possible) case that somebody deletes
                        # the record between the above count and when we do the UPDATE.
                        # Using a transaction could avoid this.
                        # Maybe such an error is reasonable and it's good to report it as such.
                        @_user_query_set_upsert_and_jsonb_merge(r, cb)
            ], cb)

    user_set_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            options    : undefined     # options=[{delete:true}] is the only supported nontrivial option here.
            cb         : required   # cb(err)
        if @is_standby
            opts.cb("set queries against standby not allowed")
            return
        r = @_parse_set_query_opts(opts)
        #r.dbg("parsed query opts = #{misc.to_json(r)}")
        if not r?  # nothing to do
            opts.cb()
            return
        if r.err
            opts.cb(r.err)
            return

        async.series([
            (cb) =>
                @_user_set_query_enforce_requirements(r, cb)
            (cb) =>
                if r.check_hook?
                    r.check_hook(@, r.query, r.account_id, r.project_id, cb)
                else
                    cb()
            (cb) =>
                @_user_set_query_hooks_prepare(r, cb)
            (cb) =>
                if r.before_change_hook?
                    r.before_change_hook(@, r.old_val, r.query, r.account_id, cb)
                else
                    cb()
            (cb) =>
                if r.instead_of_query?
                    opts1 = misc.copy_without(opts, ['cb', 'changes', 'table'])
                    r.instead_of_query @, opts1, cb
                else
                    @_user_set_query_main_query(r, cb)
            (cb) =>
                if r.on_change_hook?
                    r.on_change_hook(@, r.old_val, r.query, r.account_id, cb)
                else
                    cb()
        ], (err) => opts.cb(err))

    # mod_fields counts the fields in query that might actually get modified
    # in the database when we do the query; e.g., account_id won't since it gets
    # filled in with the user's account_id, and project_write won't since it must
    # refer to an existing project.  We use mod_field **only** to skip doing
    # no-op queries. It's just an optimization.
    _mod_fields: (query, client_query) =>
        for field in misc.keys(query)
            if client_query.set.fields[field] not in ['account_id', 'project_write']
                return true
        return false

    _user_get_query_json_timestamps: (obj, fields) =>
        # obj is an object returned from the database via a query
        # Postgres JSONB doesn't support timestamps, so we convert
        # every json leaf node of obj that looks like JSON of a timestamp
        # to a Javascript Date.
        for k, v of obj
            if fields[k]
                obj[k] = misc.fix_json_dates(v, fields[k])

    # fill in the default values for obj using the client_query spec.
    _user_get_query_set_defaults: (client_query, obj, fields) =>
        if not misc.is_array(obj)
            obj = [obj]
        else if obj.length == 0
            return
        s = client_query?.get?.fields ? {}
        for k in fields
            v = s[k]
            if v?
                # k is a field for which a default value (=v) is provided in the schema
                for x in obj
                    # For each obj pulled from the database that is defined...
                    if x?
                        # We check to see if the field k was set on that object.
                        y = x[k]
                        if not y?
                            # It was NOT set, so we deep copy the default value for the field k.
                            x[k] = misc.deep_copy(v)
                        else if typeof(v) == 'object' and typeof(y) == 'object' and not misc.is_array(v)
                            # y *is* defined and is an object, so we merge in the provided defaults.
                            for k0, v0 of v
                                if not y[k0]?
                                    y[k0] = v0

    _user_set_query_project_users: (obj, account_id) =>
        dbg = @_dbg("_user_set_query_project_users")
        if not obj.users?
            # nothing to do -- not changing users.
            return
        ##dbg("disabled")
        ##return obj.users
        #   - ensures all keys of users are valid uuid's (though not that they are valid users).
        #   - and format is:
        #          {group:'owner' or 'collaborator', hide:bool, upgrades:{a map}}
        #     with valid upgrade fields.
        upgrade_fields = PROJECT_UPGRADES.params
        users = {}
        # TODO: we obviously should check that a user is only changing the part
        # of this object involving themselves... or adding/removing collaborators.
        # That is not currently done below.  TODO TODO TODO  SECURITY.
        for id, x of obj.users
            if misc.is_valid_uuid_string(id)
                for key in misc.keys(x)
                    if key not in ['group', 'hide', 'upgrades', 'ssh_keys']
                        throw Error("unknown field '#{key}")
                if x.group? and (x.group not in ['owner', 'collaborator'])
                    throw Error("invalid value for field 'group'")
                if x.hide? and typeof(x.hide) != 'boolean'
                    throw Error("invalid type for field 'hide'")
                if x.upgrades?
                    if not misc.is_object(x.upgrades)
                        throw Error("invalid type for field 'upgrades'")
                    for k,_ of x.upgrades
                        if not upgrade_fields[k]
                            throw Error("invalid upgrades field '#{k}'")
                if x.ssh_keys
                    # do some checks.
                    if not misc.is_object(x.ssh_keys)
                        throw Error("ssh_keys must be an object")
                    for fingerprint, key of x.ssh_keys
                        if not key # deleting
                            continue
                        if not misc.is_object(key)
                            throw Error("each key in ssh_keys must be an object")
                        for k, v of key
                            # the two dates are just numbers not actual timestamps...
                            if k not in ['title', 'value', 'creation_date', 'last_use_date']
                                throw Error("invalid ssh_keys field '#{k}'")
                users[id] = x
        return users

    project_action: (opts) =>
        opts = defaults opts,
            project_id     : required
            action_request : required   # action is object {action:?, time:?}
            cb             : required
        if opts.action_request.action == 'test'
            # used for testing -- shouldn't trigger anything to happen.
            opts.cb()
            return
        dbg = @_dbg("project_action(project_id='#{opts.project_id}',action_request=#{misc.to_json(opts.action_request)})")
        dbg()
        project = undefined
        action_request = misc.copy(opts.action_request)
        set_action_request = (cb) =>
            dbg("set action_request to #{misc.to_json(action_request)}")
            @_query
                query     : "UPDATE projects"
                where     : 'project_id = $::UUID':opts.project_id
                jsonb_set : {action_request : action_request}
                cb        : cb
        async.series([
            (cb) =>
                action_request.started = new Date()
                set_action_request(cb)
            (cb) =>
                dbg("get project")
                @compute_server.project
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        project = x; cb(err)
            (cb) =>
                dbg("doing action")
                switch action_request.action
                    when 'save'
                        project.save
                            min_interval : 1   # allow frequent explicit save (just an rsync)
                            cb           : cb
                    when 'restart'
                        project.restart
                            cb           : cb
                    when 'stop'
                        project.stop
                            cb           : cb
                    when 'start'
                        project.start
                            cb           : cb
                    when 'close'
                        project.close
                            cb           : cb
                    else
                        cb("FATAL: action '#{opts.action_request.action}' not implemented")
        ], (err) =>
            if err
                action_request.err = err
            action_request.finished = new Date()
            dbg("finished!")
            set_action_request()
        )

    # This hook is called *before* the user commits a change to a project in the database
    # via a user set query.
    # TODO: Add a pre-check here as well that total upgrade isn't going to be exceeded.
    # This will avoid a possible subtle edge case if user is cheating and always somehow
    # crashes server...?
    _user_set_query_project_change_before: (old_val, new_val, account_id, cb) =>
        dbg = @_dbg("_user_set_query_project_change_before #{account_id}, #{misc.to_json(old_val)} --> #{misc.to_json(new_val)}")
        dbg()

        if new_val?.action_request? and (new_val.action_request.time - (old_val?.action_request?.time ? 0) != 0)
            # Requesting an action, e.g., save, restart, etc.
            dbg("action_request -- #{misc.to_json(new_val.action_request)}")
            #
            # WARNING: Above, we take the difference of times below, since != doesn't work as we want with
            # separate Date objects, as it will say equal dates are not equal. Example:
            # coffee> x = JSON.stringify(new Date()); {from_json}=require('misc'); a=from_json(x); b=from_json(x); [a!=b, a-b]
            # [ true, 0 ]

            # Launch the action -- success or failure communicated back to all clients through changes to state.
            # Also, we don't have to worry about permissions here; that this function got called at all means
            # the user has write access to the projects table entry with given project_id, which gives them permission
            # to do any action with the project.
            @project_action
                project_id     : new_val.project_id
                action_request : misc.copy_with(new_val.action_request, ['action', 'time'])
                cb         : (err) =>
                    dbg("action_request #{misc.to_json(new_val.action_request)} completed -- #{err}")
            cb()
            return

        if not new_val.users?  # not changing users
            cb(); return
        old_val = old_val?.users ? {}
        new_val = new_val?.users ? {}
        for id in misc.keys(old_val).concat(new_val)
            if account_id != id
                # make sure user doesn't change anybody else's allocation
                if not underscore.isEqual(old_val?[id]?.upgrades, new_val?[id]?.upgrades)
                    err = "FATAL: user '#{account_id}' tried to change user '#{id}' allocation toward a project"
                    dbg(err)
                    cb(err)
                    return
        cb()

    # This hook is called *after* the user commits a change to a project in the database
    # via a user set query.  It could undo changes the user isn't allowed to make, which
    # might require doing various async calls, or take actions (e.g., setting quotas,
    # starting projects, etc.).
    _user_set_query_project_change_after: (old_val, new_val, account_id, cb) =>
        dbg = @_dbg("_user_set_query_project_change_after #{account_id}, #{misc.to_json(old_val)} --> #{misc.to_json(new_val)}")
        dbg()
        old_upgrades = old_val.users?[account_id]?.upgrades
        new_upgrades = new_val.users?[account_id]?.upgrades
        if new_upgrades? and not underscore.isEqual(old_upgrades, new_upgrades)
            dbg("upgrades changed for #{account_id} from #{misc.to_json(old_upgrades)} to #{misc.to_json(new_upgrades)}")
            project = undefined
            async.series([
                (cb) =>
                    @ensure_user_project_upgrades_are_valid
                        account_id : account_id
                        cb         : cb
                (cb) =>
                    if not @compute_server?
                        cb()
                    else
                        dbg("get project")
                        @compute_server.project
                            project_id : new_val.project_id
                            cb         : (err, p) =>
                                project = p; cb(err)
                (cb) =>
                    if not project?
                        cb()
                    else
                        dbg("determine total quotas and apply")
                        project.set_all_quotas(cb:cb)
            ], cb)
        else
            cb()

    ###
    GET QUERIES
    ###

    # Make any functional substitutions defined by the schema.
    # This may mutate query in place.
    _user_get_query_functional_subs: (query, fields) =>
        if fields?
            for field, val of fields
                if typeof(val) == 'function'
                    query[field] = val(query, @)

    _parse_get_query_opts: (opts) =>
        if opts.changes? and not opts.changes.cb?
            return {err: "FATAL: user_get_query -- if opts.changes is specified, then opts.changes.cb must also be specified"}

        r = {}
        # get data about user queries on this table
        if opts.project_id?
            r.client_query = SCHEMA[opts.table]?.project_query
        else
            r.client_query = SCHEMA[opts.table]?.user_query

        if not r.client_query?.get?
            return {err: "FATAL: get queries not allowed for table '#{opts.table}'"}

        if not opts.account_id? and not opts.project_id? and not SCHEMA[opts.table].anonymous
            return {err: "FATAL: anonymous get queries not allowed for table '#{opts.table}'"}

        r.table = SCHEMA[opts.table].virtual ? opts.table

        r.primary_keys = @_primary_keys(opts.table)

        # Are only admins allowed any get access to this table?
        r.require_admin = !!r.client_query.get.admin

        # Verify that all requested fields may be read by users
        for field in misc.keys(opts.query)
            if r.client_query.get.fields?[field] == undefined
                return {err: "FATAL: user get query not allowed for #{opts.table}.#{field}"}

        # Functional substitutions defined by schema
        @_user_get_query_functional_subs(opts.query, r.client_query.get?.fields)

        if r.client_query.get?.instead_of_query?
            return r

        # Sanity check: make sure there is something in the query
        # that gets only things in this table that this user
        # is allowed to see, or at least a check_hook.
        if not r.client_query.get.pg_where? and not r.client_query.get.check_hook?
            return {err: "FATAL: user get query not allowed for #{opts.table} (no getAll filter - pg_where or check_hook)"}

        # Apply default options to the get query (don't impact changefeed)
        # The user can overide these, e.g., if they were to want to explicitly increase a limit
        # to get more file use history.
        user_options = {}
        for x in opts.options
            for y, z of x
                user_options[y] = true

        get_options = undefined
        if @is_heavily_loaded() and r.client_query.get.options_load?
            get_options = r.client_query.get.options_load
        else if r.client_query.get.options?
            get_options = r.client_query.get.options
        if get_options?
            # complicated since options is a list of {opt:val} !
            for x in get_options
                for y, z of x
                    if not user_options[y]
                        opts.options.push(x)
                        break

        r.json_fields = @_json_fields(opts.table, opts.query)
        return r

    # _json_fields: map from field names to array of fields that should be parsed as timestamps
    # These keys of his map are also used by _user_query_set_upsert_and_jsonb_merge to determine
    # JSON deep merging for set queries.
    _json_fields: (table, query) =>
        json_fields = {}
        for field, info of SCHEMA[table].fields
            if (query[field]? or query[field] == null) and (info.type == 'map' or info.pg_type == 'JSONB')
                json_fields[field] = info.date ? []
        return json_fields

    _user_get_query_where: (client_query, account_id, project_id, user_query, table, cb) =>
        dbg = @_dbg("_user_get_query_where")
        dbg()

        pg_where = client_query.get.pg_where

        if @is_heavily_loaded() and client_query.get.pg_where_load?
            # use a different query if load is heavy
            pg_where = client_query.get.pg_where_load

        if not pg_where?
            pg_where = []
        if pg_where == 'projects'
            pg_where = ['projects']

        if typeof(pg_where) == 'function'
            pg_where = pg_where(user_query, @)
        if not misc.is_array(pg_where)
            cb("FATAL: pg_where must be an array (of strings or objects)")
            return

        # Do NOT mutate the schema itself!
        pg_where = misc.deep_copy(pg_where)

        # expand 'projects' in query, depending on whether project_id is specified or not.
        # This is just a convenience to make the db schema simpler.
        for i in [0...pg_where.length]
            if pg_where[i] == 'projects'
                if user_query.project_id
                    pg_where[i] = {"project_id = $::UUID" : 'project_id'}
                else
                    pg_where[i] = {"project_id = ANY(select project_id from projects where users ? $::TEXT)" : 'account_id'}

        # Now we fill in all the parametrized substitions in the pg_where list.
        subs = {}
        for x in pg_where
            if misc.is_object(x)
                for key, value of x
                    subs[value] = value

        sub_value = (value, cb) =>
            switch value
                when 'account_id'
                    if not account_id?
                        cb('FATAL: account_id must be given')
                        return
                    subs[value] = account_id
                    cb()
                when 'project_id'
                    if project_id?
                        subs[value] = project_id
                        cb()
                    else if not user_query.project_id
                        cb("FATAL: must specify project_id")
                    else if SCHEMA[table].anonymous
                        subs[value] = user_query.project_id
                        cb()
                    else
                        @user_is_in_project_group
                            account_id : account_id
                            project_id : user_query.project_id
                            groups     : ['owner', 'collaborator']
                            cb         : (err, in_group) =>
                                if err
                                    cb(err)
                                else if in_group
                                    subs[value] = user_query.project_id
                                    cb()
                                else
                                    cb("FATAL: you do not have read access to this project")
                when 'project_id-public'
                    if not user_query.project_id?
                        cb("FATAL: must specify project_id")
                    else
                        if SCHEMA[table].anonymous
                            @has_public_path
                                project_id : user_query.project_id
                                cb         : (err, has_public_path) =>
                                    if err
                                        cb(err)
                                    else if not has_public_path
                                        cb("project does not have any public paths")
                                    else
                                        subs[value] = user_query.project_id
                                        cb()
                        else
                            cb("FATAL: table must allow anonymous queries")
                else
                    cb()

        async.map misc.keys(subs), sub_value, (err) =>
            if err
                cb(err)
                return
            for x in pg_where
                if misc.is_object(x)
                    for key, value of x
                        x[key] = subs[value]

            # impose further restrictions (more where conditions)
            pg_where.push(@_user_get_query_filter(user_query, client_query))

            cb(undefined, pg_where)

    # Additional where object condition imposed by user's get query
    _user_get_query_filter: (user_query, client_query) =>
        # If the schema lists the value in a get query as 'null', then we remove it;
        # nulls means it was only there to be used by the initial where filter
        # part of the query.
        for field, val of client_query.get.fields
            if val == 'null'
                delete user_query[field]

        where = {}
        for field, val of user_query
            if val?
                if client_query.get.remove_from_query? and client_query.get.remove_from_query.includes(field)
                    # do not include any field that explicitly excluded from the query
                    continue
                if @_query_is_cmp(val)
                    # A comparison, e.g.,
                    # field :
                    #    '<=' : 5
                    #    '>=' : 2
                    for op, v of val
                        if op == '=='  # not in SQL, but natural for our clients to use it
                            op = '='
                        where["#{quote_field(field)} #{op} $"] = v
                else
                    where["#{quote_field(field)} = $"] = val

        return where

    _user_get_query_options: (options, multi, schema_options) =>
        r = {}

        if schema_options?
            options = options.concat(schema_options)

        # Parse option part of the query
        {limit, order_by, slice, only_changes, err} = @_query_parse_options(options)

        if err
            return {err: err}
        if only_changes
            r.only_changes = true
        if limit?
            r.limit = limit
        else if not multi
            r.limit = 1
        if order_by?
            r.order_by = order_by
        if slice?
            return {err: "slice not implemented"}
        return r

    _user_get_query_do_query: (query_opts, client_query, user_query, multi, json_fields, cb) =>
        query_opts.cb = all_results (err, x) =>
            if err
                cb(err)
            else
                if misc.len(json_fields) > 0
                    # Convert timestamps to Date objects, if **explicitly** specified in the schema
                    for obj in x
                        @_user_get_query_json_timestamps(obj, json_fields)

                if not multi
                    x = x[0]
                # Fill in default values and remove null's
                @_user_get_query_set_defaults(client_query, x, misc.keys(user_query))
                # Get rid of undefined fields -- that's the default and wastes memory and bandwidth
                if x?
                    for obj in x
                        misc.map_mutate_out_undefined(obj)
                cb(undefined, x)
        @_query(query_opts)

    _user_get_query_query: (table, user_query, remove_from_query) =>
        return "SELECT #{(quote_field(field) for field in @_user_get_query_columns(user_query, remove_from_query)).join(',')} FROM #{table}"

    _user_get_query_satisfied_by_obj: (user_query, obj, possible_time_fields) =>
        #dbg = @_dbg("_user_get_query_satisfied_by_obj)
        #dbg(user_query, obj)
        for field, value of obj
            date_keys = possible_time_fields[field]
            if date_keys
                value = misc.fix_json_dates(value, date_keys)
            if (q = user_query[field])?
                if (op = @_query_is_cmp(q))
                    #dbg(value:value, op: op, q:q)
                    x = q[op]
                    switch op
                        when '=='
                            if value != x
                                return false
                        when '!='
                            if value == x
                                return false
                        when '>='
                            if value < x
                                return false
                        when '<='
                            if value > x
                                return false
                        when '>'
                            if value <= x
                                return false
                        when '<'
                            if value >= x
                                return false
                else if value != q
                    return false
        return true

    _user_get_query_changefeed: (changes, table, primary_keys, user_query,
                                 where, json_fields, account_id, client_query, cb) =>
        dbg = @_dbg("_user_get_query_changefeed(table='#{table}')")
        dbg()
        # WARNING: always call changes.cb!  Do not do something like f = changes.cb, then call f!!!!
        # This is because the value of changes.cb may be changed by the caller.
        if not misc.is_object(changes)
            cb("FATAL: changes must be an object with keys id and cb")
            return
        if not misc.is_valid_uuid_string(changes.id)
            cb("FATAL: changes.id must be a uuid")
            return
        if typeof(changes.cb) != 'function'
            cb("FATAL: changes.cb must be a function")
            return
        for primary_key in primary_keys
            if not user_query[primary_key]? and user_query[primary_key] != null
                cb("FATAL: changefeed MUST include primary key (='#{primary_key}') in query")
                return
        watch  = []
        select = {}
        init_tracker = tracker = free_tracker = undefined
        possible_time_fields = misc.deep_copy(json_fields)
        feed = undefined

        for field, val of user_query
            type = pg_type(SCHEMA[table]?.fields?[field])
            if type == 'TIMESTAMP'
                possible_time_fields[field] = 'all'
            if val == null and field not in primary_keys
                watch.push(field)
            else
                select[field] = type

        if misc.len(possible_time_fields) > 0
            # Convert (likely) timestamps to Date objects.
            process = (x) =>
                if not x?
                    return
                if x.new_val?
                    @_user_get_query_json_timestamps(x.new_val, possible_time_fields)
                    if x.action == 'insert'  # do not do this for delete or update actions!
                        @_user_get_query_set_defaults(client_query, x.new_val, misc.keys(user_query))
                if x.old_val?
                    @_user_get_query_json_timestamps(x.old_val, possible_time_fields)
        else
            process = (x) =>
                if not x?
                    return
                if x.new_val?
                    if x.action == 'insert'  # do not do this for delete or update actions!
                        @_user_get_query_set_defaults(client_query, x.new_val, misc.keys(user_query))

        async.series([
            (cb) =>
                # check for alternative where test for changefeed.
                pg_changefeed = client_query?.get?.pg_changefeed
                if not pg_changefeed?
                    cb(); return

                if pg_changefeed == 'projects'
                    tracker_add = (project_id) => feed.insert({project_id:project_id})
                    tracker_remove = (project_id) => feed.delete({project_id:project_id})
                    pg_changefeed =  (db, account_id) =>
                        where  : (obj) =>
                            # Check that this is a project we have read access to
                            if not db._project_and_user_tracker?.get_projects(account_id)[obj.project_id]
                                return false
                            # Now check our actual query conditions on the object.
                            # This would normally be done by the changefeed, but since
                            # we are passing in a custom where, we have to do it.
                            if not @_user_get_query_satisfied_by_obj(user_query, obj, possible_time_fields)
                                return false
                            return true

                        select : {'project_id':'UUID'}

                        init_tracker : (tracker) =>
                            tracker.on "add_user_to_project-#{account_id}", tracker_add
                            tracker.on "remove_user_from_project-#{account_id}", tracker_remove

                        free_tracker : (tracker) =>
                            dbg("freeing project tracker events")
                            tracker.removeListener("add_user_to_project-#{account_id}", tracker_add)
                            tracker.removeListener("remove_user_from_project-#{account_id}", tracker_remove)


                else if pg_changefeed == 'one-hour'
                    pg_changefeed = ->
                        where : (obj) ->
                            if obj.time?
                                return new Date(obj.time) >= misc.hours_ago(1)
                            else
                                return true
                        select : {id:'UUID', time:'TIMESTAMP'}

                else if pg_changefeed == 'five-minutes'
                    pg_changefeed = ->
                        where : (obj) ->
                            if obj.time?
                                return new Date(obj.time) >= misc.minutes_ago(5)
                            else
                                return true
                        select : {id:'UUID', time:'TIMESTAMP'}

                else if pg_changefeed == 'collaborators'
                    if not account_id?
                        cb("FATAL: account_id must be given")
                        return
                    tracker_add = (collab_id) => feed.insert({account_id:collab_id})
                    tracker_remove = (collab_id) => feed.delete({account_id:collab_id})
                    pg_changefeed = (db, account_id) ->
                        shared_tracker = undefined
                        where : (obj) ->  # test of "is a collab with me"
                            return shared_tracker.get_collabs(account_id)?[obj.account_id]
                        init_tracker : (tracker) =>
                            shared_tracker = tracker
                            tracker.on "add_collaborator-#{account_id}", tracker_add
                            tracker.on "remove_collaborator-#{account_id}", tracker_remove
                        free_tracker : (tracker) =>
                            dbg("freeing collab tracker events")
                            tracker.removeListener("add_collaborator-#{account_id}", tracker_add)
                            tracker.removeListener("remove_collaborator-#{account_id}", tracker_remove)


                x = pg_changefeed(@, account_id)
                if x.init_tracker?
                    init_tracker = x.init_tracker
                if x.free_tracker?
                    free_tracker = x.free_tracker
                if x.select?
                    for k, v of x.select
                        select[k] = v

                if x.where? or x.init_tracker?
                    where = x.where
                    if not account_id?
                        cb()
                        return
                    # initialize user tracker is needed for where tests...
                    @project_and_user_tracker cb : (err, _tracker) =>
                        if err
                            cb(err)
                        else
                            tracker = _tracker
                            try
                                await tracker.register(account_id)
                                cb()
                            catch err
                                cb(err)
                else
                    cb()
            (cb) =>
                @changefeed
                    table  : table
                    select : select
                    where  : where
                    watch  : watch
                    cb     : (err, _feed) =>
                        if err
                            cb(err)
                            return
                        feed = _feed
                        feed.on 'change', (x) ->
                            process(x)
                            changes.cb(undefined, x)
                        feed.on 'close', ->
                            changes.cb(undefined, {action:'close'})
                            dbg("feed close")
                            if tracker? and free_tracker?
                                dbg("free_tracker")
                                free_tracker(tracker)
                            dbg("do NOT free_tracker")
                        feed.on 'error', (err) ->
                            changes.cb("feed error - #{err}")
                        @_changefeeds ?= {}
                        @_changefeeds[changes.id] = feed
                        init_tracker?(tracker)
                        # Any tracker error means this changefeed is now broken and
                        # has to be recreated.
                        tracker?.once 'error', (err) ->
                            changes.cb("tracker error - #{err}")
                        cb()
        ], cb)

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            multi      : required
            options    : required   # used for initial query; **IGNORED** by changefeed,
                                    # which ensures that *something* is sent every n minutes, in case no
                                    # changes are coming out of the changefeed. This is an additional
                                    # measure in case the client somehow doesn't get a "this changefeed died" message.
                                    # Use [{delete:true}] to instead delete the selected records (must
                                    # have delete:true in schema).
            changes    : undefined  # {id:?, cb:?}
            cb         : required   # cb(err, result)
        ###
        The general idea is that user get queries are of the form

            SELECT [columns] FROM table WHERE [get_all] AND [further restrictions] LIMIT/slice

        Using the whitelist rules specified in SCHEMA, we
        determine each of the above, then run the query.

        If no error in query, and changes is a given uuid, set up a change
        feed that calls opts.cb on changes as well.
        ###
        id = misc.uuid().slice(0,6)
        #dbg = @_dbg("user_get_query(id=#{id})")
        dbg = -> # Logging below is just too verbose, and turns out to not be useful...
        dbg("account_id='#{opts.account_id}', project_id='#{opts.project_id}', query=#{misc.to_json(opts.query)}, multi=#{opts.multi}, options=#{misc.to_json(opts.options)}, changes=#{misc.to_json(opts.changes)}")
        {err, table, client_query, require_admin, primary_keys, json_fields} = @_parse_get_query_opts(opts)

        if err
            dbg("error parsing query opts -- #{err}")
            opts.cb(err)
            return

        _query_opts = {}  # this will be the input to the @_query command.
        locals =
            result     : undefined
            changes_cb : undefined

        async.series([
            (cb) =>
                if client_query.get.check_hook?
                    dbg("do check hook")
                    client_query.get.check_hook(@, opts.query, opts.account_id, opts.project_id, cb)
                else
                    cb()
            (cb) =>
                if require_admin
                    dbg('require admin')
                    @_require_is_admin(opts.account_id, cb)
                else
                    cb()
            (cb) =>
                # NOTE: _user_get_query_where may mutate opts.query (for 'null' params)
                # so it is important that this is called before @_user_get_query_query below.
                # See the TODO in @_user_get_query_filter.
                dbg("get_query_where")
                @_user_get_query_where client_query, opts.account_id, opts.project_id, opts.query, opts.table, (err, where) =>
                    _query_opts.where = where
                    cb(err)
            (cb) =>
                if client_query.get.instead_of_query?
                    cb();
                    return
                _query_opts.query = @_user_get_query_query(table, opts.query, client_query.get.remove_from_query)
                x = @_user_get_query_options(opts.options, opts.multi, client_query.options)
                if x.err
                    dbg("error in get_query_options, #{x.err}")
                    cb(x.err)
                    return
                misc.merge(_query_opts, x)

                nestloop = SCHEMA[opts.table]?.pg_nestloop  # true, false or undefined
                if typeof nestloop == 'boolean'
                    val = if nestloop then 'on' else 'off'
                    _query_opts.pg_params = {enable_nestloop : val}

                indexscan = SCHEMA[opts.table]?.pg_indexscan  # true, false or undefined
                if typeof indexscan == 'boolean'
                    val = if indexscan then 'on' else 'off'
                    _query_opts.pg_params = {enable_indexscan : val}

                if opts.changes?
                    locals.changes_cb = opts.changes.cb
                    locals.changes_queue = []
                    # see note about why we do the following at the bottom of this file
                    opts.changes.cb = (err, obj) ->
                        locals.changes_queue.push({err:err, obj:obj})
                    dbg("getting changefeed")
                    @_user_get_query_changefeed(opts.changes, table, primary_keys,
                                                opts.query, _query_opts.where, json_fields,
                                                opts.account_id, client_query, cb)
                else
                    cb()

            (cb) =>
                if client_query.get.instead_of_query?
                    if opts.changes?
                        cb("changefeeds are not supported for querying this table")
                        return
                    # Custom version: instead of doing a full query, we instead
                    # call a function and that's it.
                    dbg("do instead_of_query instead")
                    opts1 = misc.copy_without(opts, ['cb', 'changes', 'table'])
                    client_query.get.instead_of_query @, opts1, (err, result) =>
                        locals.result = result
                        cb(err)
                    return

                if _query_opts.only_changes
                    dbg("skipping query")
                    locals.result = undefined
                    cb()
                else
                    dbg("finally doing query")
                    @_user_get_query_do_query _query_opts, client_query, opts.query, opts.multi, json_fields, (err, result) =>
                        if err
                            cb(err)
                            return
                        locals.result = result
                        cb()
        ], (err) =>
            if err
                dbg("series failed -- err=#{err}")
                opts.cb(err)
                return
            dbg("series succeeded")
            opts.cb(undefined, locals.result)
            if opts.changes?
                dbg("sending change queue")
                opts.changes.cb = locals.changes_cb
                ##dbg("sending queued #{JSON.stringify(locals.changes_queue)}")
                for {err, obj} in locals.changes_queue
                    ##dbg("sending queued changes #{JSON.stringify([err, obj])}")
                    opts.changes.cb(err, obj)
        )

    ###
    Synchronized strings
    ###
    _user_set_query_syncstring_change_after: (old_val, new_val, account_id, cb) =>
        dbg = @_dbg("_user_set_query_syncstring_change_after")
        cb() # return immediately -- stuff below can happen as side effect in the background.
        # Now do the following reactions to this syncstring change in the background:
        # 1. Awaken the relevant project.
        project_id = old_val?.project_id ? new_val?.project_id
        if project_id? and (new_val?.save?.state == 'requested' or (new_val?.last_active? and new_val?.last_active != old_val?.last_active))
            dbg("awakening project #{project_id}")
            awaken_project(@, project_id)


    # Verify that writing a patch is allowed.
    _user_set_query_patches_check: (obj, account_id, project_id, cb) =>
        # Reject any patch that is too new
        if obj.time - new Date() > MAX_PATCH_FUTURE_MS
            cb("clock")    # this exact error is assumed in synctable!
            return
        # Write access
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_patches_check: (obj, account_id, project_id, cb) =>
        # Write access (no notion of read only yet -- will be easy to add later)
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_set_query_cursors_check: (obj, account_id, project_id, cb) =>
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_cursors_check: (obj, account_id, project_id, cb) =>
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    _syncstring_access_check: (string_id, account_id, project_id, cb) =>
        # Check that string_id is the id of a syncstring the given account_id or
        # project_id is allowed to write to.  NOTE: We do not concern ourselves (for now at least)
        # with proof of identity (i.e., one user with full read/write access to a project
        # claiming they are another users of that SAME project), since our security model
        # is that any user of a project can edit anything there.  In particular, the
        # synctable lets any user with write access to the project edit the users field.
        if string_id?.length != 40
            cb("FATAL: string_id (='#{string_id}') must be a string of length 40")
            return
        @_query
            query : "SELECT project_id FROM syncstrings"
            where : "string_id = $::CHAR(40)" : string_id
            cache : false  # *MUST* leave as false (not true), since unfortunately, if this returns no, due to FATAL below this would break opening the file until cache clears.
            cb    : one_result 'project_id', (err, x) =>
                if err
                    cb(err)
                else if not x
                    # There is no such syncstring with this id -- fail
                    cb("FATAL: no such syncstring")
                else if account_id?
                    # Attempt to read or write by a user browser client
                    @_require_project_ids_in_groups(account_id, [x], ['owner', 'collaborator'], cb)
                else if project_id?
                    # Attempt to read or write by a *project*
                    if project_id == x
                        cb()
                    else
                        cb("FATAL: project not allowed to write to syncstring in different project")


    # Check permissions for querying for syncstrings in a project
    _syncstrings_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_syncstrings_check")
        #dbg(misc.to_json([obj, account_id, project_id]))
        if not misc.is_valid_uuid_string(obj?.project_id)
            cb("FATAL: project_id (='#{obj?.project_id}') must be a valid uuid")
            return
        if project_id?
            if project_id == obj.project_id
                # The project can access its own syncstrings
                cb()
            else
                cb("FATAL: projects can only access their own syncstrings") # for now at least!
            return
        if account_id?
            # Access request by a client user
            @_require_project_ids_in_groups(account_id, [obj.project_id], ['owner', 'collaborator'], cb)
        else
            cb("FATAL: only users and projects can access syncstrings")

    # Other functions that are needed to implement various use queries,
    # e.g., for virtual queries like file_use_times.
    # ASYNC FUNCTION with no callback.
    file_use_times: (opts) =>  # for docs, see where this is imported from.
        return await file_use_times(@, opts)

_last_awaken_time = {}
awaken_project = (db, project_id, cb) ->
    # throttle so that this gets called *for a given project* at most once every 30s.
    now = new Date()
    if _last_awaken_time[project_id]? and now - _last_awaken_time[project_id] < 30000
        return
    _last_awaken_time[project_id] = now
    dbg = db._dbg("_awaken_project(project_id=#{project_id})")
    if not db.compute_server?
        dbg("skipping since no compute_server defined")
        return
    dbg("doing it...")
    locals =
        project : undefined
    async.series([
        (cb) ->
            db.compute_server.project
                project_id : project_id
                cb         : (err, project) =>
                    if err
                        cb("error getting project = #{err}")
                    else
                        locals.project = project
                        cb()
        (cb) ->
            locals.project.ensure_running
                cb : (err) =>
                    if err
                        cb("failed to ensure project running -- #{err}")
                    else
                        cb()
        (cb) ->
            if not db.ensure_connection_to_project?
                cb()
                return
            dbg("also make sure there is a connection from hub to project")
            # This is so the project can find out that the user wants to save a file (etc.)
            db.ensure_connection_to_project(project_id, cb)
    ], (err) ->
        if err
            dbg("awaken project error -- #{err}")
        else
            dbg("success awakening project")
        cb?(err)
    )
###
Note about opts.changes.cb:

Regarding sync, what was happening I think is:
 - (a) https://github.com/sagemathinc/cocalc/blob/master/src/smc-hub/postgres-user-queries.coffee#L1384 starts sending changes
 - (b) https://github.com/sagemathinc/cocalc/blob/master/src/smc-hub/postgres-user-queries.coffee#L1393 sends the full table.

(a) could result in changes actually getting to the client before the table itself has been initialized.  The client code assumes that it only gets changes *after* the table is initialized.  The browser client seems to be smart enough that it detects this situation and resets itself, so the browser never gets messed up as a result.
However, the project definitely does NOT do so well, and it can get messed up.  Then it has a broken version of the table, missing some last minute change.    It is broken until the project forgets about that table entirely, which is can be a pretty long time (or project restart).

My fix is to queue up those changes on the server, then only start sending them to the client **after** the (b) query is done.  I tested this by using setTimeout to manually delay (b) for a few seconds, and fully seeing the "file won't save problem".   The other approach would make it so clients are more robust against getting changes first.  However, it would take a long time for all clients to update (restart all projects), and it's an annoying assumption to make in general -- we may have entirely new clients later and they could make the same bad assumptions about order...
###