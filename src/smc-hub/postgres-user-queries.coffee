###
User (and project) client queries

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

EventEmitter = require('events')
async        = require('async')

{PostgreSQL, one_result} = require('./postgres')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{SCHEMA} = require('smc-util/schema')

class exports.PostgreSQL extends PostgreSQL

    user_query: (opts) =>
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
            cb         : required   # cb(err, result)  # WARNING -- this *will* get called multiple times when changes is true!
        dbg = @_dbg("user_query(...)")
        if misc.is_array(opts.query)
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
            opts.cb?('must specify exactly one key in the query')
            return
        table = v[0]
        query = opts.query[table]
        if misc.is_array(query)
            if query.length > 1
                opts.cb("array of length > 1 not yet implemented")
                return
            multi = true
            query = query[0]
        else
            multi = false
        is_set_query = undefined
        if opts.options?
            if not misc.is_array(opts.options)
                opts.cb("options (=#{misc.to_json(opts.options)}) must be an array")
                return
            for x in opts.options
                if x.set?
                    is_set_query = !!x.set
            options = (x for x in opts.options when not x.set?)
        else
            options = []

        if misc.is_object(query)
            query = misc.deep_copy(query)
            obj_key_subs(query, subs)
            if not is_set_query?
                is_set_query = not misc.has_null_leaf(query)
            if is_set_query
                # do a set query
                if changes
                    opts.cb("changefeeds only for read queries")
                    return
                if not opts.account_id? and not opts.project_id?
                    opts.cb("no anonymous set queries")
                    return
                @user_set_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        opts.cb(err, {"#{table}":x})
            else
                # do a get query
                if changes and not multi
                    opts.cb("changefeeds only implemented for multi-document queries")
                    return

                if changes
                    try
                        @_inc_changefeed_count(opts.account_id, opts.project_id, changes.id)
                    catch err
                        opts.cb(err)
                        return

                @user_get_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : options
                    multi      : multi
                    changes    : changes
                    cb         : (err, x) =>
                        if err and changes
                            # didn't actually make the changefeed, so don't count it.
                            @_dec_changefeed_count(changes.id)
                        opts.cb(err, {"#{table}":x})
        else
            opts.cb("invalid user_query of '#{table}' -- query must be an object")

    # Incrementa count of the number of changefeeds by a given client so we can cap it.
    _inc_changefeed_count: (account_id, project_id, changefeed_id) =>
        client_name = "#{opts.account_id}-#{opts.project_id}"
        cnt = @_user_get_changefeed_counts ?= {}
        ids = @_user_get_changefeed_id_to_user ?= {}
        if not cnt[client_name]?
            cnt[client_name] = 1
        else if cnt[client_name] >= MAX_CHANGEFEEDS_PER_CLIENT
            throw Error("user may create at most #{MAX_CHANGEFEEDS_PER_CLIENT} changefeeds; please close files, refresh browser, restart project")
        else
            # increment before successfully making get_query to prevent huge bursts causing trouble!
            cnt[client_name] += 1
        dbg("@_user_get_changefeed_counts={#{client_name}:#{cnt[client_name]} ...}")
        ids[changefeed_id] = client_name

    # Corresonding decrement of count of the number of changefeeds by a given client.
    _dec_changefeed_count: (id) =>
        client_name = @_user_get_changefeed_id_to_user[id]
        if client_name?
            @_user_get_changefeed_counts?[client_name] -= 1
            delete @_user_get_changefeed_id_to_user[id]
            cnt = @_user_get_changefeed_counts
            @_dbg("_dec_changefeed_count")("counts={#{client_name}:#{cnt[client_name]} ...}")

    # Handle user_query when opts.query is an array.  opts below are as for user_query.
    _user_query_array: (opts) =>
        if opts.changes and opts.query.length > 1
            opts.cb("changefeeds only implemented for single table")
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
            cb : undefined
        @_dec_changefeed_count(opts.id)
        opts.cb?("NotImplemented")

    _query_is_cmp: (obj) =>
        for k, _ of obj
            if k in ['==', '!=', '>=', '<=', '>', '<']
                return true
        return false

    _query_cmp: (filter, x, q) =>
        throw Error("NotImplemented")

    _query_descend: (filter, x, q) =>
        throw Error("NotImplemented")

    _query_to_filter: (query, primary_key) =>
        throw Error("NotImplemented")

    _query_to_field_selector: (query, primary_key) =>
        throw Error("NotImplemented")

    _is_admin: (account_id, cb) =>
        cb?("NotImplemented")

    _require_is_admin: (account_id, cb) =>
        if not account_id?
            cb("user must be an admin")
            return
        @_is_admin account_id, (err, is_admin) =>
            if err
                cb(err)
            else if not is_admin
                cb("user must be an admin")
            else
                cb()

    # Ensure that each project_id in project_ids is such that the account is in one of the given
    # groups for the project, or that the account is an admin.  If not, cb(err).
    _require_project_ids_in_groups: (account_id, project_ids, groups, cb) =>
        cb?("NotImplemented")

    _query_parse_options: (db_query, options) =>
        throw Error("NotImplemented")

    _primary_key_query: (primary_key, query) =>
        throw Error("NotImplemented")

    user_set_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            options    : undefined     # {delete:true} is the only supported option
            cb         : required   # cb(err)
        if opts.project_id?
            dbg = @_dbg("user_set_query(project_id='#{opts.project_id}', table='#{opts.table}')")
        else if opts.account_id?
            dbg = @_dbg("user_set_query(account_id='#{opts.account_id}', table='#{opts.table}')")
        else
            opts.cb("account_id or project_id must be specified")
            return
        dbg(misc.to_json(opts.query))
        if opts.options
            dbg("options=#{misc.to_json(opts.options)}")

        query      = misc.copy(opts.query)
        table      = opts.table
        db_table   = SCHEMA[opts.table].virtual ? table
        account_id = opts.account_id
        project_id = opts.project_id

        s = SCHEMA[table]

        if account_id?
            client_query = s?.user_query
        else
            client_query = s?.project_query
        if not client_query?.set?.fields?
            opts.cb("user set queries not allowed for table '#{opts.table}'")
            return

        if not @_mod_fields(opts.query, client_query)
            opts.cb()   # no fields will be modified, so nothing to do
            return

        for field in misc.keys(client_query.set.fields)
            if client_query.set.fields[field] == undefined
                opts.cb("user set query not allowed for #{opts.table}.#{field}")
                return
            switch client_query.set.fields[field]
                when 'account_id'
                    if not account_id?
                        opts.cb("account_id must be specified")
                        return
                    query[field] = account_id
                when 'project_id'
                    if not project_id?
                        opts.cb("project_id must be specified")
                        return
                    query[field] = project_id
                when 'time_id'
                    query[field] = uuid.v1()
                when 'project_write'
                    if not query[field]?
                        opts.cb("must specify #{opts.table}.#{field}")
                        return
                    require_project_ids_write_access = [query[field]]
                when 'project_owner'
                    if not query[field]?
                        opts.cb("must specify #{opts.table}.#{field}")
                        return
                    require_project_ids_owner = [query[field]]

        for field in misc.keys(query)
            f = client_query.set.fields?[field]
            if typeof(f) == 'function'
                try
                    query[field] = f(query, @, opts.account_id)
                catch err
                    opts.cb("error setting '#{field}' -- #{err}")
                    return

        if client_query.set.admin
            require_admin = true

        primary_key = s.primary_key ? 'id'

        for k, v of query
            if primary_key == k
                continue
            if client_query?.set?.fields?[k] != undefined
                continue
            if s.admin_query?.set?.fields?[k] != undefined
                require_admin = true
                continue
            opts.cb("changing #{table}.#{k} not allowed")
            return

        # HOOKS which allow for running arbitrary code in response to
        # user set queries.  In each case, new_val below is only the part
        # of the object that the user requested to change.

        # 0. CHECK: Runs before doing any further processing; has callback, so this
        # provides a generic way to quickly check whether or not this query is allowed
        # for things that can't be done declaratively.
        check_hook = client_query.set.check_hook

        # 1. BEFORE: If before_change is set, it is called with input
        #   (database, old_val, new_val, account_id, cb)
        # before the actual change to the database is made.
        before_change_hook = client_query.set.before_change

        # 2. INSTEAD OF: If instead_of_change is set, then instead_of_change_hook
        # is called with input
        #      (database, old_val, new_val, account_id, cb)
        # *instead* of actually doing the update/insert to
        # the database.  This makes it possible to run arbitrary
        # code whenever the user does a certain type of set query.
        # Obviously, if that code doesn't set the new_val in the
        # database, then new_val won't be the new val.
        instead_of_change_hook = client_query.set.instead_of_change

        # 3. AFTER:  If set, the on_change_hook is called with
        #   (database, old_val, new_val, account_id, cb)
        # after everything the database has been modified.
        on_change_hook = client_query.set.on_change

        old_val = undefined
        #dbg("on_change_hook=#{on_change_hook?}, #{misc.to_json(misc.keys(client_query.set))}")

        # Set the query options -- order doesn't matter for set queries (unlike for get), so we
        # just merge the options into a single dictionary.
        # NOTE: As I write this, there is just one supported option: {delete:true}.
        options = {}
        if client_query.set.options?
            for x in client_query.set.options
                for y, z of x
                    options[y] = z
        if opts.options?
            for x in opts.options
                for y, z of x
                    options[y] = z
        dbg("options = #{misc.to_json(options)}")

        if options.delete and not client_query.set.delete
            # delete option is set, but deletes aren't explicitly allowed on this table.  ERROR.
            opts.cb("delete from #{table} not allowed")
            return

        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        if require_admin
                            @_require_is_admin(account_id, cb)
                        else
                            cb()
                    (cb) =>
                        if require_project_ids_write_access?
                            if project_id?
                                err = undefined
                                for x in require_project_ids_write_access
                                    if x != project_id
                                        err = "can only query same project"
                                        break
                                cb(err)
                            else
                                @_require_project_ids_in_groups(account_id, require_project_ids_write_access,\
                                                 ['owner', 'collaborator'], cb)
                        else
                            cb()
                    (cb) =>
                        if require_project_ids_owner?
                            @_require_project_ids_in_groups(account_id, require_project_ids_owner,\
                                             ['owner'], cb)
                        else
                            cb()
                ], cb)
            (cb) =>
                if check_hook?
                    check_hook(@, query, account_id, project_id, cb)
                else
                    cb()
            (cb) =>
                if on_change_hook? or before_change_hook? or instead_of_change_hook?
                    if not query[primary_key]?
                        cb("query must specify primary key '#{primary_key}'")
                        return
                    # get the old value before changing it
                    @_query
                        query : "SELECT * FROM #{db_table}"
                        where : "#{primary_key} = $" : query[primary_key]
                        cb    : one_result (err, x) =>
                            old_val = x; cb(err)
                else
                    cb()
            (cb) =>
                if before_change_hook?
                    before_change_hook(@, old_val, query, account_id, cb)
                else
                    cb()
            (cb) =>
                if instead_of_change_hook?
                    instead_of_change_hook(@, old_val, query, account_id, cb)
                else if options.delete
                    if query[primary_key]
                        dbg("delete based on primary key")
                        @_query
                            query : "DELETE FROM #{db_table}"
                            where : "#{primary_key} = $" : query[primary_key]
                            cb    : cb
                    else
                        cb("delete query must set primary key")
                else
                    @_query
                        query    : "INSERT INTO #{db_table}"
                        values   : query
                        conflict : primary_key
                        cb       : cb
            (cb) =>
                if on_change_hook?
                    on_change_hook(@, old_val, query, account_id, cb)
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

    # fill in the default values for obj using the client_query spec.
    _query_set_defaults: (client_query, obj, fields) =>
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
        throw Error("NotImplemented")

    project_action: (opts) =>
        opts = defaults opts,
            project_id     : required
            action_request : required   # action is a pair
            cb             : required
        dbg = @_dbg("project_action(project_id=#{opts.project_id},action_request=#{misc.to_json(opts.action_request)})")
        dbg()
        opts.cb('NotImplemented')

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
                    err = "user '#{account_id}' tried to change user '#{id}' allocation toward a project"
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

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            multi      : required
            options    : required   # used for initial query; **IGNORED** by changefeed, except for {heartbeat:n},
                                    # which ensures that *something* is sent every n minutes, in case no
                                    # changes are coming out of the changefeed. This is an additional
                                    # measure in case the client somehow doesn't get a "this changefeed died" message.
                                    # Use [{delete:true}] to instead delete the selected records (must
                                    # have delete:true in schema).
            changes    : undefined  # {id:?, cb:?}
            cb         : required   # cb(err, result)
        ###
        User queries are of the form

            old ReQL: .table(table).getAll(get_all).filter(filter).pluck(pluck)[limit|slice options]

            SELECT [columns] FROM table WHERE [get_all] AND [further restrictions] LIMIT/slice

        Using the whitelist rules specified in SCHEMA, we
        determine each of get_all, filter, pluck, and options,
        then run the query.

        If no error in query, and changes is a given uuid, then sets up a change
        feed that calls opts.cb on changes as well.
        ###
        if opts.account_id?
            dbg = @_dbg("user_get_query(account_id=#{opts.account_id}, table=#{opts.table})")
        else if opts.project_id?
            dbg = @_dbg("user_get_query(project_id=#{opts.project_id}, table=#{opts.table})")
        else
            dbg = @_dbg("user_get_query(anonymous, table=#{opts.table})")

        dbg("options=#{misc.to_json(opts.options)}")
        opts.cb('not implemented')

    ###
    Synchronized strings
    ###
    _user_set_query_syncstring_change_after: (old_val, new_val, account_id, cb) =>
        dbg = @dbg("_user_set_query_syncstring_change_after")
        cb() # immediately -- stuff below can happen as side effect in the background.
        #dbg("new_val='#{misc.to_json(new_val)}")

        # Now do the following reactions to this syncstring change in the background:

        # 1. Awaken the relevant project.
        project_id = old_val?.project_id ? new_val?.project_id
        if project_id? and (new_val?.save?.state == 'requested' or (new_val?.last_active? and new_val?.last_active != old_val?.last_active))
            dbg("awakening project #{project_id}")
            awaken_project(@, project_id)

        # 2. Log that this particular file is being used/accessed; this is used only
        # longterm for analytics.  Note that log_file_access is throttled.
        # Also, record in a local cache that the user has permission to write
        # to this syncstring.
        if project_id? and new_val?.last_active?
            filename = old_val?.path
            if filename? and account_id?
                @log_file_access
                    project_id : project_id
                    account_id : account_id
                    filename   : filename

    # Verify that writing a patch is allowed.
    _user_set_query_patches_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_set_query_patches_check")
        #dbg(misc.to_json([obj, account_id]))
        # 1. Check that
        #  obj.id = [string_id, time],
        # where string_id is a valid sha1 hash and time is a timestamp
        id = obj.id
        if not misc.is_array(id)
            cb("id must be an array")
            return
        if id.length != 2
            cb("id must be of length 2")
            return
        string_id = id[0]; time = id[1]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        if not misc.is_date(time)
            cb("id[1] must be a Date")
            return
        if obj.user?
            if typeof(obj.user) != 'number'
                cb("user must be a number")
                return
            if obj.user < 0
                cb("user must be positive")
                return

        # 2. Write access
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_patches_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_get_query_patches_check")
        #dbg(misc.to_json([obj, account_id]))
        string_id = obj.id?[0]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        # Write access (no notion of read only yet -- will be easy to add later)
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_set_query_cursors_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_set_query_cursors_check")
        #dbg(misc.to_json([obj, account_id]))
        # 1. Check that
        #  obj.id = [string_id, user_id],
        # where string_id is a valid uuid, time is a timestamp, and user_id is a nonnegative integer.
        id = obj.id
        if not misc.is_array(id)
            cb("id must be an array")
            return
        if id.length != 2
            cb("id must be of length 2")
            return
        string_id = id[0]; user_id = id[1]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        if typeof(user_id) != 'number'
            cb("id[1] must be a number")
            return
        if user_id < 0
            cb("id[1] must be positive")
            return
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_cursors_check: (obj, account_id, project_id, cb) =>
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    _syncstring_access_check: (string_id, account_id, project_id, cb) =>
        # Check that string_id is the id of a syncstring the the given account_id or
        # project_id is allowed to write to.  NOTE: We do not concern ourselves (for now at least)
        # with proof of identity (i.e., one user with full read/write access to a project
        # claiming they are another users of that project), since our security model
        # is that any user of a project can edit anything there.  In particular, the
        # synctable lets any user with write access to the project edit the users field.
        cb('not implemented')

    # Check permissions for querying for syncstrings in a project
    _syncstrings_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_syncstrings_check")
        #dbg(misc.to_json([obj, account_id, project_id]))
        if not misc.is_valid_uuid_string(obj?.project_id)
            cb("project_id must be a valid uuid")
        else if project_id?
            if project_id == obj.project_id
                # The project can access its own syncstrings
                cb()
            else
                cb("projects can only access their own syncstrings") # for now at least!
        else if account_id?
            # Access request by a client user
            @_require_project_ids_in_groups(account_id, [obj.project_id], ['owner', 'collaborator'], cb)
        else
            cb("only users and projects can access syncstrings")


# modify obj in place substituting keys as given.
obj_key_subs = (obj, subs) ->
    for k, v of obj
        s = subs[k]
        if s?
            delete obj[k]
            obj[s] = v
        if typeof(v) == 'object'
            obj_key_subs(v, subs)
        else if typeof(v) == 'string'
            s = subs[v]
            if s?
                obj[k] = s

