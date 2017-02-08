###
PostgreSQL -- implementation of all the queries needed for the backend servers

These are all the non-reactive non-push queries, e.g., adding entries to logs,
checking on cookies, creating accounts and projects, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

# limit for async.map or async.paralleLimit, esp. to avoid high concurrency when querying in parallel
MAP_LIMIT = 5

async   = require('async')

misc_node = require('smc-util-node/misc_node')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{SCHEMA, DEFAULT_QUOTAS, PROJECT_UPGRADES, COMPUTE_STATES, RECENT_TIMES, RECENT_TIMES_KEY, site_settings_conf} = require('smc-util/schema')

PROJECT_GROUPS = misc.PROJECT_GROUPS


{PostgreSQL, PROJECT_COLUMNS, one_result, all_results, count_result, expire_time} = require('./postgres')

class exports.PostgreSQL extends PostgreSQL

    # write an event to the central_log table
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object
            cb    : undefined
        @_query
            query  : 'INSERT INTO central_log'
            values :
                'id::UUID'        : misc.uuid()
                'event::TEXT'     : opts.event
                'value::JSONB'    : opts.value
                'time::TIMESTAMP' : 'NOW()'
            cb     : (err) => opts.cb?(err)

    uncaught_exception: (err) =>
        # call when things go to hell in some unexpected way; at least
        # we attempt to record this in the database...
        try
            @log
                event : 'uncaught_exception'
                value : {error:"#{err}", stack:"#{err.stack}", host:require('os').hostname()}
        catch e
            # IT IS CRITICAL THAT uncaught_exception not raise an exception, since if it
            # did then we would hit a horrible infinite loop!

    # dump a range of data from the central_log table
    get_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            log   : 'central_log' # which table to query
            event : undefined
            where : undefined     # if given, restrict to records with the given json
                                  # containment, e.g., {account_id:'...'}, only returns
                                  # entries whose value has the given account_id.
            cb    : required
        @_query
            query  : "SELECT * FROM #{opts.log}"
            where  :
                'time  >= $::TIMESTAMP' : opts.start
                'time  <= $::TIMESTAMP' : opts.end
                'event  = $::TEXT'      : opts.event
                'value @> $::JSONB'     : opts.where
            cb     : all_results(opts.cb)

    # Return every entry x in central_log in the given period of time for
    # which x.event==event and x.value.account_id == account_id.
    get_user_log: (opts) =>
        opts = defaults opts,
            start      : undefined
            end        : undefined     # if not given include everything until now
            event      : 'successful_sign_in'
            account_id : required
            cb         : required
        @get_log
            start : opts.start
            end   : opts.end
            event : opts.event
            where : {account_id: opts.account_id}
            cb    : opts.cb

    log_client_error: (opts) =>
        opts = defaults opts,
            event      : 'event'
            error      : 'error'
            account_id : undefined
            cb         : undefined
        @_query
            query  : 'INSERT INTO client_error_log'
            values :
                'id         :: UUID'      : misc.uuid()
                'event      :: TEXT'      : opts.event
                'error      :: TEXT'      : opts.error
                'account_id :: UUID'      : opts.account_id
                'time       :: TIMESTAMP' : 'NOW()'
            cb     : opts.cb

    webapp_error: (opts) =>
        opts = defaults opts,
            account_id   : undefined
            name         : undefined
            message      : undefined
            comment      : undefined
            stacktrace   : undefined
            file         : undefined
            path         : undefined
            lineNumber   : undefined
            columnNumber : undefined
            severity     : undefined
            browser      : undefined
            mobile       : undefined
            responsive   : undefined
            user_agent   : undefined
            smc_version  : undefined
            build_date   : undefined
            smc_git_rev  : undefined
            uptime       : undefined
            start_time   : undefined
            cb           : undefined
        @_query
            query       : 'INSERT INTO webapp_errors'
            values      :
                'id            :: UUID'      : misc.uuid()
                'account_id    :: UUID'      : opts.account_id
                'name          :: TEXT'      : opts.name
                'message       :: TEXT'      : opts.message
                'comment       :: TEXT'      : opts.comment
                'stacktrace    :: TEXT'      : opts.stacktrace
                'file          :: TEXT'      : opts.file
                'path          :: TEXT'      : opts.path
                'lineNumber    :: INTEGER'   : opts.lineNumber
                'columnNumber  :: INTEGER'   : opts.columnNumber
                'severity      :: TEXT'      : opts.severity
                'browser       :: TEXT'      : opts.browser
                'mobile        :: BOOLEAN'   : opts.mobile
                'responsive    :: BOOLEAN'   : opts.responsive
                'user_agent    :: TEXT'      : opts.user_agent
                'smc_version   :: TEXT'      : opts.smc_version
                'build_date    :: TEXT'      : opts.build_date
                'smc_git_rev   :: TEXT'      : opts.smc_git_rev
                'uptime        :: TEXT'      : opts.uptime
                'start_time    :: TIMESTAMP' : opts.start_time
                'time          :: TIMESTAMP' : 'NOW()'
            cb          : opts.cb

    get_client_error_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        opts.log = 'client_error_log'
        @get_log(opts)

    set_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            value : required
            cb    : required
        @_query
            query  : 'INSERT INTO server_settings'
            values :
                'name::TEXT'  : opts.name
                'value::TEXT' : opts.value
            conflict : 'name'
            cb     : opts.cb

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        @_query
            query : 'SELECT value FROM server_settings'
            where :
                "name = $::TEXT" : opts.name
            cb    : one_result('value', opts.cb)

    # TODO: optimization -- site_settings could be done as a changefeed (and is done as one in rethink.coffee)
    get_site_settings: (opts) =>
        opts = defaults opts,
            cb : required   # (err, settings)
        @_query
            query : 'SELECT name, value FROM server_settings'
            cache : true
            where :
                "name = ANY($)" : misc.keys(site_settings_conf)
            cb : (err, result) =>
                if err
                    opts.cb(err)
                else
                    x = {}
                    for k in result.rows
                        if k.name == 'commercial' and k.value in ['true', 'false']  # backward compatibility
                            k.value = eval(k.value)
                        x[k.name] = k.value
                    opts.cb(undefined, x)

    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            cb       : required
        @_query
            query    : 'INSERT into passport_settings'
            values   :
                'strategy::TEXT ' : opts.strategy
                'conf    ::JSONB' : opts.conf
            conflict : 'strategy'
            cb       : opts.cb

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @_query
            query : 'SELECT conf FROM passport_settings'
            where :
                "strategy = $::TEXT" : opts.strategy
            cb    : one_result('conf', opts.cb)

    ###
    Account creation, deletion, existence
    ###
    create_account: (opts={}) ->
        opts = defaults opts,
            first_name        : required
            last_name         : required

            created_by        : undefined  #  ip address of computer creating this account

            email_address     : undefined
            password_hash     : undefined

            passport_strategy : undefined
            passport_id       : undefined
            passport_profile  : undefined
            cb                : required       # cb(err, account_id)

        dbg = @_dbg("create_account(#{opts.first_name}, #{opts.last_name} #{opts.email_address}, #{opts.passport_strategy}, #{opts.passport_id})")
        dbg()

        if opts.email_address? # canonicalize the email address, if given
            opts.email_address = misc.lower_email_address(opts.email_address)

        if not opts.email_address? and not opts.passport_strategy?
            opts.cb("email_address or passport must be given")
            return

        account_id = misc.uuid()

        passport_key = undefined
        if opts.passport_strategy?
            # This is to make it impossible to accidentally create two accounts with the same passport
            # due to calling create_account twice at once.   See TODO below about changing schema.
            # This should be enough for now since a given user only makes their account through a single
            # server via the persistent websocket...
            @_create_account_passport_keys ?= {}
            passport_key = @_passport_key(strategy:opts.passport_strategy, id:opts.passport_id)
            last = @_create_account_passport_keys[passport_key]
            if last? and new Date() - last <= 60*1000
                opts.cb("recent attempt to make account with this passport strategy")
                return
            @_create_account_passport_keys[passport_key] = new Date()

        async.series([
            (cb) =>
                if not opts.passport_strategy?
                    cb(); return
                dbg("verify that no account with passport (strategy='#{opts.passport_strategy}', id='#{opts.passport_id}') already exists")
                # **TODO:** need to make it so insertion into the table still would yield an error due to
                # unique constraint; this will require probably moving the passports
                # object to a separate table.  This is important, since this is exactly the place where
                # a race condition might cause touble!
                @passport_exists
                    strategy : opts.passport_strategy
                    id       : opts.passport_id
                    cb       : (err, account_id) ->
                        if err
                            cb(err)
                        else if account_id
                            cb("account with email passport strategy '#{opts.passport_strategy}' and id '#{opts.passport_id}' already exists")
                        else
                            cb()
            (cb) =>
                dbg("create the actual account")
                @_query
                    query  : "INSERT INTO accounts"
                    values :
                        'account_id    :: UUID'      : account_id
                        'first_name    :: TEXT'      : opts.first_name
                        'last_name     :: TEXT'      : opts.last_name
                        'created       :: TIMESTAMP' : new Date()
                        'created_by    :: INET'      : opts.created_by
                        'password_hash :: CHAR(173)' : opts.password_hash
                        'email_address :: TEXT'      : opts.email_address
                    cb : cb
            (cb) =>
                if opts.passport_strategy?
                    dbg("add passport authentication strategy")
                    @create_passport
                        account_id : account_id
                        strategy   : opts.passport_strategy
                        id         : opts.passport_id
                        profile    : opts.passport_profile
                        cb         : cb
                else
                    cb()
        ], (err) =>
            if err
                dbg("error creating account -- #{err}")
                opts.cb(err)
            else
                dbg("successfully created account")
                opts.cb(undefined, account_id)
        )

    is_admin: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : "SELECT groups FROM accounts"
            where : 'account_id = $::UUID':opts.account_id
            cache : true
            cb    : one_result 'groups', (err, groups) =>
                opts.cb(err, groups? and 'admin' in groups)

    make_user_admin: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not opts.account_id? and not opts.email_address?
            opts.cb?("account_id or email_address must be given")
            return
        async.series([
            (cb) =>
                if opts.account_id?
                    cb()
                else
                    @get_account
                        email_address : opts.email_address
                        columns       : ['account_id']
                        cb            : (err, x) =>
                            opts.account_id = x.account_id
                            cb(err)
            (cb) =>
                @clear_cache()  # caching is mostly for permissions so this is exactly when it would be nice to clear it.
                @_query
                    query : "UPDATE accounts"
                    where : 'account_id = $::UUID':opts.account_id
                    set   :
                        groups : ['admin']
                    cb    : cb
        ], opts.cb)

    count_accounts_created_by: (opts) =>
        opts = defaults opts,
            ip_address : required
            age_s      : required
            cb         : required
        @_count
            table : 'accounts'
            where :
                "created_by  = $::INET"      : opts.ip_address
                "created    >= $::TIMESTAMP" : misc.seconds_ago(opts.age_s)
            cb    : opts.cb

    # Completely delete the given account from the database.  This doesn't
    # do any sort of cleanup of things associated with the account!  There
    # is no reason to ever use this, except for testing purposes.
    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : "DELETE FROM accounts"
            where : "account_id = $::UUID" : opts.account_id
            cb    : opts.cb

    # Mark the account as deleted, thus freeing up the email
    # address for use by another account, etc.  The actual
    # account entry remains in the database, since it may be
    # referred to by many other things (projects, logs, etc.).
    # However, the deleted field is set to true, so the account
    # is excluded from user search.
    mark_account_deleted: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not opts.account_id? and not opts.email_address?
            opts.cb("one of email address or account_id must be specified")
            return

        query = undefined
        email_address = undefined
        async.series([
            (cb) =>
                if opts.account_id?
                    cb()
                else
                    @account_exists
                        email_address : opts.email_address
                        cb            : (err, account_id) =>
                            if err
                                cb(err)
                            else if not account_id
                                cb("no such email address known")
                            else
                                opts.account_id = account_id
                                cb()
            (cb) =>
                @_query
                    query : "SELECT email_address FROM accounts"
                    where : "account_id = $::UUID" : opts.account_id
                    cb    : one_result 'email_address', (err, x) =>
                        email_address = x; cb(err)
            (cb) =>
                @_query
                    query  : "UPDATE accounts"
                    set    :
                        "deleted::BOOLEAN"                  : true
                        "email_address_before_delete::TEXT" : email_address
                        "email_address"                     : null
                        "passports"                         : null
                    where  : "account_id = $::UUID"             : opts.account_id
                    cb     : cb
        ], opts.cb)

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or undefined) -- actual account_id if it exists; err = problem with db connection...
        @_query
            query : 'SELECT account_id FROM accounts'
            where : "email_address = $::TEXT" : opts.email_address
            cb    : one_result('account_id', opts.cb)

    # set an account creation action, or return all of them for the given email address
    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined   # if given, adds this action; if not, returns all non-expired actions
            ttl           : 60*60*24*14 # add action with this ttl in seconds (default: 2 weeks)
            cb            : required    # if ttl not given cb(err, [array of actions])
        if opts.action?
            # add action
            @_query
                query  : 'INSERT INTO account_creation_actions'
                values :
                    'id            :: UUID'      : misc.uuid()
                    'email_address :: TEXT'      : opts.email_address
                    'action        :: JSONB'     : opts.action
                    'expire        :: TIMESTAMP' : expire_time(opts.ttl)
                cb : opts.cb
        else
            # query for actions
            @_query
                query : 'SELECT action FROM account_creation_actions'
                where :
                    'email_address  = $::TEXT'       : opts.email_address
                    'expire        >= $::TIMESTAMP'  : new Date()
                cb    : all_results('action', opts.cb)

    account_creation_actions_success: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : 'UPDATE accounts'
            set   :
                'creation_actions_done::BOOLEAN' : true
            where :
                'account_id = $::UUID' : opts.account_id
            cb     : opts.cb

    do_account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : required
        dbg = @_dbg("do_account_creation_actions(email_address='#{opts.email_address}')")
        @account_creation_actions
            email_address : opts.email_address
            cb            : (err, actions) =>
                if err
                    opts.cb(err); return
                f = (action, cb) =>
                    dbg("account_creation_actions: action = #{misc.to_json(action)}")
                    if action.action == 'add_to_project'
                        @add_user_to_project
                            project_id : action.project_id
                            account_id : opts.account_id
                            group      : action.group
                            cb         : (err) =>
                                if err
                                    dbg("Error adding user to project: #{err}")
                                cb(err)
                    else
                        dbg("ERROR: skipping unknown action -- #{action.action}")
                        # also store in database so we can look into this later.
                        @log
                            event : 'unknown_action'
                            value :
                                error      : "unknown_action"
                                action     : action
                                account_id : opts.account_id
                                host       : require('os').hostname()
                        cb()
                async.map actions, f, (err) =>
                    if not err
                        @account_creation_actions_success
                            account_id : opts.account_id
                            cb         : opts.cb
                    else
                        opts.cb(err)

    ###
    Stripe support for accounts
    ###
    # Set the stripe id in our database of this user.  If there is no user with this
    # account_id, then this is a NO-OP.
    set_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            customer_id : required
            cb          : required
        @_query
            query : 'UPDATE accounts'
            set   : 'stripe_customer_id::TEXT' : opts.customer_id
            where : 'account_id = $::UUID'     : opts.account_id
            cb    : opts.cb

    # Get the stripe id in our database of this user (or undefined if not stripe_id or no such user).
    get_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            cb          : required
        @_query
            query : 'SELECT stripe_customer_id FROM accounts'
            where : 'account_id = $::UUID' : opts.account_id
            cb    : one_result('stripe_customer_id', opts.cb)

    ###
    Stripe integration/sync:
    Get all info about the given account from stripe and put it in our own local database.
    Call it with force right after the user does some action that will change their
    account info status.  This will never touch stripe if the user doesn't have
    a stripe_customer_id.   TODO: This should be replaced by webhooks...
    ###
    stripe_update_customer: (opts) =>
        opts = defaults opts,
            account_id  : required   # user's account_id
            stripe      : undefined  # api connection to stripe
            customer_id : undefined  # will be looked up if not known
            cb          : undefined
        customer = undefined
        dbg = @_dbg("stripe_update_customer(account_id='#{opts.account_id}')")
        async.series([
            (cb) =>
                if opts.customer_id?
                    cb(); return
                dbg("get_stripe_customer_id")
                @get_stripe_customer_id
                    account_id : opts.account_id
                    cb         : (err, x) =>
                        dbg("their stripe id is #{x}")
                        opts.customer_id = x; cb(err)
            (cb) =>
                if opts.customer_id? and not opts.stripe?
                    @get_server_setting
                        name : 'stripe_secret_key'
                        cb   : (err, secret) =>
                            if err
                                cb(err)
                            else if not secret
                                cb("stripe must be configured")
                            else
                                opts.stripe = require("stripe")(secret)
                                cb()
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    opts.stripe.customers.retrieve opts.customer_id, (err, x) =>
                        dbg("got stripe info -- #{err}")
                        customer = x; cb(err)
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    @_query
                        query : 'UPDATE accounts'
                        set   : 'stripe_customer::JSONB' : customer
                        where : 'account_id = $::UUID'   : opts.account_id
                        cb    : opts.cb
                else
                    cb()
        ], opts.cb)

    ###
    Querying for searchable information about accounts.
    ###
    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_opts(opts) then return
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(undefined, [])
            return
        @_query
            query : 'SELECT account_id, first_name, last_name FROM accounts'
            where : 'account_id = ANY($::UUID[])' : opts.account_ids
            cb    : (err, result) =>
                if err
                    opts.cb(err)
                else
                    v = misc.dict(([r.account_id, {first_name:r.first_name, last_name:r.last_name}] for r in result.rows))
                    # fill in unknown users (should never be hit...)
                    for id in opts.account_ids
                        if not v[id]?
                            v[id] = {first_name:undefined, last_name:undefined}
                    opts.cb(err, v)

    get_usernames: (opts) =>
        opts = defaults opts,
            account_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from account_id to object (user name))
        if not @_validate_opts(opts) then return
        usernames = {}
        for account_id in opts.account_ids
            usernames[account_id] = false
        if opts.use_cache
            if not @_account_username_cache?
                @_account_username_cache = {}
            for account_id, done of usernames
                if not done and @_account_username_cache[account_id]?
                    usernames[account_id] = @_account_username_cache[account_id]
        @account_ids_to_usernames
            account_ids : (account_id for account_id,done of usernames when not done)
            cb          : (err, results) =>
                if err
                    opts.cb(err)
                else
                    # use a closure so that the cache clear timeout below works
                    # with the correct account_id!
                    f = (account_id, username) =>
                        usernames[account_id] = username
                        @_account_username_cache[account_id] = username
                        setTimeout((()=>delete @_account_username_cache[account_id]),
                                   1000*opts.cache_time_s)
                    for account_id, username of results
                        f(account_id, username)
                    opts.cb(undefined, usernames)

    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : 50           # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.
        {string_queries, email_queries} = misc.parse_user_search(opts.query)
        results = []
        dbg = @_dbg("user_search")
        dbg("query = #{misc.to_json(opts.query)}")
        async.parallel([
            (cb) =>
                if email_queries.length == 0
                    cb(); return
                dbg("do email queries -- with exactly two targeted db queries (even if there are hundreds of addresses)")
                @_query
                    query : 'SELECT account_id, first_name, last_name, email_address FROM accounts'
                    where : 'email_address = ANY($::TEXT[])' : email_queries
                    cb    : all_results (err, rows) =>
                        cb(err, if rows? then results.push(rows...))
            (cb) =>
                dbg("do all string queries")
                if string_queries.length == 0 or (opts.limit? and results.length >= opts.limit)
                    # nothing to do
                    cb(); return
                # substring search on first and last name.
                # With the two indexes, the query below is instant even on several
                # hundred thousand accounts:
                #     CREATE INDEX accounts_first_name_idx ON accounts(first_name text_pattern_ops);
                #     CREATE INDEX accounts_last_name_idx  ON accounts(last_name text_pattern_ops);
                where  = []
                params = []
                i      = 1
                for terms in string_queries
                    v = []
                    for s in terms
                        s = s.toLowerCase()
                        v.push("(lower(first_name) LIKE $#{i}::TEXT OR lower(last_name) LIKE $#{i}::TEXT)")
                        params.push("#{s}%")  # require string to name to start with string -- makes searching way faster and is more useful too
                        i += 1
                    where.push("(#{v.join(' AND ')})")
                query = 'SELECT account_id, first_name, last_name FROM accounts'
                query += " WHERE deleted IS NOT TRUE AND (#{where.join(' OR ')})"
                query += " LIMIT $#{i}::INTEGER"; i += 1
                params.push(opts.limit)
                @_query
                    query  : query
                    params : params
                    cb     : all_results (err, rows) =>
                        cb(err, if rows? then results.push(rows...))
            ], (err) => opts.cb(err, results))

    _account_where: (opts) =>
        if opts.account_id?
            return {"account_id = $::UUID" : opts.account_id}
        else
            return {"email_address = $::TEXT" : opts.email_address}

    get_account: (opts) =>
        opts = defaults opts,
            email_address : undefined     # provide either email or account_id (not both)
            account_id    : undefined
            columns       : ['account_id',
                             'password_hash',
                             'password_is_set',  # true or false, depending on whether a password is set (since don't send password_hash to user!)
                             'first_name', 'last_name',
                             'email_address',
                             'evaluate_key', 'autosave', 'terminal', 'editor_settings', 'other_settings',
                             'groups',
                             'passports'
                            ]
            cb            : required
        if not @_validate_opts(opts) then return
        columns = misc.copy(opts.columns)
        if 'password_is_set' in columns
            if 'password_hash' not in columns
                remove_password_hash = true
                columns.push('password_hash')
            misc.remove(columns, 'password_is_set')
            password_is_set = true
        @_query
            query : "SELECT #{columns.join(',')} FROM accounts"
            where : @_account_where(opts)
            cb    : one_result (err, z) =>
                if err
                    opts.cb(err)
                else if not z?
                    opts.cb("no such account")
                else
                    if password_is_set
                        z.password_is_set = !!z.password_hash
                        if remove_password_hash
                            delete z.password_hash
                    for c in columns
                        if not z[c]?     # for same semantics as rethinkdb... (for now)
                            delete z[c]
                    opts.cb(undefined, z)

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)
        if not @_validate_opts(opts) then return
        @_query
            query : 'SELECT banned FROM accounts'
            where : @_account_where(opts)
            cb    : one_result('banned', (err, banned) => opts.cb(err, !!banned))

    _set_ban_user: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            banned        : required
            cb            : required
        if not @_validate_opts(opts) then return
        @_query
            query : 'UPDATE accounts'
            set   : {banned: opts.banned}
            where : @_account_where(opts)
            cb    : one_result('banned', opts.cb)

    ban_user: (opts) =>
        @_set_ban_user(misc.merge(opts, banned:true))

    unban_user: (opts) =>
        @_set_ban_user(misc.merge(opts, banned:false))

    ###
    Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
    The Schema is slightly redundant, but indexed properly:
       {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}
    ###
    _passport_key: (opts) => "#{opts.strategy}-#{opts.id}"

    create_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            profile    : required
            cb         : required   # cb(err)
        @_dbg('create_passport')(misc.to_json(opts.profile))
        @_query
            query     : "UPDATE accounts"
            jsonb_set :
                passports : "#{@_passport_key(opts)}" : opts.profile
            where     :
                "account_id = $::UUID" : opts.account_id
            cb        : opts.cb

    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            cb         : required
        @_dbg('delete_passport')(misc.to_json(opts.profile))
        @_query
            query     : "UPDATE accounts"
            jsonb_set :
                passports : "#{@_passport_key(opts)}" : null  # delete it
            where     :
                "account_id = $::UUID" : opts.account_id
            cb        : opts.cb

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        @_query
            query : "SELECT account_id FROM accounts"
            where : "(passports->>$::TEXT) IS NOT NULL" : @_passport_key(opts)
            cb    : (err, result) =>
                opts.cb(err, result?.rows[0]?.account_id)

    _touch_account: (account_id, cb) =>
        if @_throttle('_touch_account', 120, account_id)
            cb()
            return
        @_query
            query : 'UPDATE accounts'
            set   : {last_active: 'NOW()'}
            where : "account_id = $::UUID" : account_id
            cb    : cb

    _touch_project: (project_id, account_id, cb) =>
        if @_throttle('_user_touch_project', 60, project_id, account_id)
            cb()
            return
        NOW = new Date()
        @_query
            query       : "UPDATE projects"
            set         : {last_edited : NOW}
            jsonb_merge : {last_active:{"#{account_id}":NOW}}
            where       : "project_id = $::UUID" : project_id
            cb          : cb

    # Indicate activity by a user, possibly on a specific project, and
    # then possibly on a specific path in that project.
    touch: (opts) =>
        opts = defaults opts,
            account_id : required
            project_id : undefined
            path       : undefined
            action     : 'edit'
            ttl_s      : 50        # min activity interval; calling this function with same input again within this interval is ignored
            cb         : undefined
        if opts.ttl_s
            if @_throttle('touch', opts.ttl_s, opts.account_id, opts.project_id, opts.path, opts.action)
                opts.cb?()
                return

        now = new Date()
        async.parallel([
            (cb) =>
                @_touch_account(opts.account_id, cb)
            (cb) =>
                if not opts.project_id?
                    cb(); return
                @_touch_project(opts.project_id, opts.account_id, cb)
            (cb) =>
                if not opts.path? or not opts.project_id?
                    cb(); return
                @record_file_use(project_id:opts.project_id, path:opts.path, action:opts.action, account_id:opts.account_id, cb:cb)
        ], (err)->opts.cb?(err))

    ###
    Rememberme cookie functionality
    ###
    # Save remember me info in the database
    save_remember_me: (opts) =>
        opts = defaults opts,
            account_id : required
            hash       : required
            value      : required
            ttl        : required
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : 'INSERT INTO remember_me'
            values :
                'hash       :: TEXT      ' : opts.hash.slice(0,127)
                'value      :: JSONB     ' : opts.value
                'expire     :: TIMESTAMP ' : expire_time(opts.ttl)
                'account_id :: UUID      ' : opts.account_id
            conflict : 'hash'
            cb       : opts.cb

    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        @_query
            query : 'DELETE FROM remember_me'
            where :
                'account_id = $::UUID' : opts.account_id
            cb       : opts.cb

    # Get remember me cookie with given hash.  If it has expired,
    # get back undefined instead.  (Actually deleting expired)
    get_remember_me: (opts) =>
        opts = defaults opts,
            hash       : required
            cb         : required   # cb(err, signed_in_message)
        @_query
            query : 'SELECT value, expire FROM remember_me'
            where :
                'hash = $::TEXT' : opts.hash.slice(0,127)
            cb       : one_result('value', opts.cb)

    delete_remember_me: (opts) =>
        opts = defaults opts,
            hash : required
            cb   : undefined
        @_query
            query : 'DELETE FROM remember_me'
            where :
                'hash = $::TEXT' : opts.hash.slice(0,127)
            cb    : opts.cb

    ###
    # Changing password/email, etc. sensitive info about a user
    ###

    # Change the password for the given account.
    change_password: (opts={}) =>
        opts = defaults opts,
            account_id             : required
            password_hash          : required
            invalidate_remember_me : true
            cb                     : required
        if not @_validate_opts(opts) then return
        if opts.password_hash.length > 173
            opts.cb("password_hash must be at most 173 characters")
            return
        async.series([  # don't do in parallel -- don't kill remember_me if password failed!
            (cb) =>
                @_query
                    query : 'UPDATE accounts'
                    set   : {password_hash : opts.password_hash}
                    where : @_account_where(opts)
                    cb    : cb
            (cb) =>
                if opts.invalidate_remember_me
                    @invalidate_all_remember_me
                        account_id : opts.account_id
                        cb         : cb
                else
                    cb()
        ], opts.cb)

    # Change the email address, unless the email_address we're changing to is already taken.
    change_email_address: (opts={}) =>
        opts = defaults opts,
            account_id    : required
            email_address : required
            cb            : required
        if not @_validate_opts(opts) then return
        @account_exists
            email_address : opts.email_address
            cb            : (err, exists) =>
                if err
                    opts.cb(err)
                else if exists
                    opts.cb("email_already_taken")
                else
                @_query
                    query : 'UPDATE accounts'
                    set   : {email_address: opts.email_address}
                    where : @_account_where(opts)
                    cb    : opts.cb

    ###
    Password reset
    ###
    set_password_reset: (opts) =>
        opts = defaults opts,
            email_address : required
            ttl           : required
            cb            : required   # cb(err, uuid)
        id = misc.uuid()
        @_query
            query : "INSERT INTO password_reset"
            values :
                "id            :: UUID"      : id
                "email_address :: TEXT"      : opts.email_address
                "expire        :: TIMESTAMP" : expire_time(opts.ttl)
            cb : (err) =>
                opts.cb(err, id)

    get_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @_query
            query : 'SELECT expire, email_address FROM password_reset'
            where : 'id = $::UUID': opts.id
            cb    : one_result('email_address', opts.cb)

    delete_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @_query
            query : 'DELETE FROM password_reset'
            where : 'id = $::UUID': opts.id
            cb    : opts.cb

    record_password_reset_attempt: (opts) =>
        opts = defaults opts,
            email_address : required
            ip_address    : required
            cb            : required   # cb(err)
        @_query
            query  : 'INSERT INTO password_reset_attempts'
            values :
                "id            :: UUID"      : misc.uuid()
                "email_address :: TEXT "     : opts.email_address
                "ip_address    :: INET"      : opts.ip_address
                "time          :: TIMESTAMP" : "NOW()"
            cb     : opts.cb

    count_password_reset_attempts: (opts) =>
        opts = defaults opts,
            email_address : undefined  # must give one of email_address or ip_address
            ip_address    : undefined
            age_s         : required   # at most this old
            cb            : required   # cb(err)
        @_query
            query : 'SELECT COUNT(*) FROM password_reset_attempts'
            where :
                'time          >= $::TIMESTAMP' : misc.seconds_ago(opts.age_s)
                'email_address  = $::TEXT     ' : opts.email_address
                'ip_address     = $::INET     ' : opts.ip_address
            cb    : count_result(opts.cb)

    ###
    Tracking file access

    log_file_access is throttled in each server, in the sense that
    if it is called with the same input within a minute, those
    subsequent calls are ignored.  Of course, if multiple servers
    are recording file_access then there can be more than one
    entry per minute.
    ###
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        if @_throttle('log_file_access', 60, opts.project_id, opts.account_id, opts.filename)
            opts.cb?()
            return
        @_query
            query  : 'INSERT INTO file_access_log'
            values :
                'id         :: UUID     ' : misc.uuid()
                'project_id :: UUID     ' : opts.project_id
                'account_id :: UUID     ' : opts.account_id
                'filename   :: TEXT     ' : opts.filename
                'time       :: TIMESTAMP' : 'NOW()'
            cb     : opts.cb

    ###
    Efficiently get all files access times subject to various constraints...

    NOTE: this was not available in RethinkDB version (too painful to implement!), but here it is,
    easily sliceable in any way.  This could be VERY useful for users!
    ###
    get_file_access: (opts) =>
        opts = defaults opts,
            start      : undefined   # start time
            end        : undefined  # end time
            project_id : undefined
            account_id : undefined
            filename   : undefined
            cb    : required
        @_query
            query : 'SELECT project_id, account_id, filename, time FROM file_access_log'
            where :
                'time >= $::TIMESTAMP' : opts.start
                'time <= $::TIMESTAMP' : opts.end
                'project_id = $::UUID' : opts.project_id
                'account_id = $::UUID' : opts.account_id
                'filename   = $::TEXT' : opts.filename
            cb   : all_results(opts.cb)

    # Create a new project with given owner.  Returns the generated project_id.
    create_project: (opts) =>
        opts = defaults opts,
            account_id  : required    # initial owner
            title       : undefined
            description : undefined
            cb          : required    # cb(err, project_id)
        if not @_validate_opts(opts) then return
        project_id = misc.uuid()
        now = new Date()
        @_query
            query  : "INSERT INTO projects"
            values :
                project_id  : project_id
                title       : opts.title
                description : opts.description
                created     : now
                last_edited : now
                users       : {"#{opts.account_id}":{group:'owner'}}
            cb : (err, result) =>
                opts.cb(err, if not err then project_id)

    ###
    File editing activity -- users modifying files in any way
      - one single table called file_activity
      - table also records info about whether or not activity has been seen by users
    ###
    record_file_use: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            account_id : required
            action     : required  # 'edit', 'read', 'seen', 'chat', etc.?
            cb         : required
        # Doing what's done below (with two queries) is really, really ugly.
        # See comment in db-schema.coffee about file_use table -- will redo
        # for postgres later...
        now = new Date()
        entry =
            id         : @sha1(opts.project_id, opts.path)
            project_id : opts.project_id
            path       : opts.path
        if opts.action == 'edit' or opts.action == 'chat'
            entry.last_edited = now
        async.series([
            (cb) =>
                @_query
                    query       : 'INSERT INTO file_use'
                    conflict    : 'id'
                    values      : entry
                    cb          : cb
            (cb) =>
                @_query
                    query       : 'UPDATE file_use'
                    jsonb_merge :
                        users : {"#{opts.account_id}": {"#{opts.action}": now}}
                    where : {id : entry.id}
                    cb          : cb
        ], opts.cb)

    get_file_use: (opts) =>
        opts = defaults opts,
            max_age_s   : undefined
            project_id  : undefined    # don't specify both project_id and project_ids
            project_ids : undefined
            path        : undefined    # if given, project_id must be given
            cb          : required     # one entry if path given; otherwise, an array of entries.
        if opts.project_id?
            if opts.project_ids?
                opts.cb("don't specify both project_id and project_ids")
                return
            else
                opts.project_ids = [opts.project_id]
        else if not opts.project_ids?
            opts.cb("project_id or project_ids must be defined")
            return
        @_query
            query    : 'SELECT * FROM file_use'
            where    :
                'last_edited >= $::TIMESTAMP' : if opts.max_age_s then misc.seconds_ago(opts.max_age_s)
                'project_id   = ANY($)'       : opts.project_ids
                'path         = $::TEXT'      : opts.path
            order_by : 'last_edited'
            cb       : if opts.path? then one_result(opts.cb) else all_results(opts.cb)

    _validate_opts: (opts) =>
        for k, v of opts
            if k.slice(k.length-2) == 'id'
                if v? and not misc.is_valid_uuid_string(v)
                    opts.cb?("invalid #{k} -- #{v}")
                    return false
            if k.slice(k.length-3) == 'ids'
                for w in v
                    if not misc.is_valid_uuid_string(w)
                        opts.cb?("invalid uuid #{w} in #{k} -- #{misc.to_json(v)}")
                        return false
            if k == 'group' and v not in misc.PROJECT_GROUPS
                opts.cb?("unknown project group '#{v}'"); return false
            if k == 'groups'
                for w in v
                    if w not in misc.PROJECT_GROUPS
                        opts.cb?("unknown project group '#{w}' in groups"); return false

        return true

    get_project: (opts) =>
        opts = defaults opts,
            project_id : required   # an array of id's
            columns    : PROJECT_COLUMNS
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : "SELECT #{opts.columns.join(',')} FROM projects"
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result(opts.cb)

    _get_project_column: (column, project_id, cb) =>
        if not misc.is_valid_uuid_string(project_id)
            cb("invalid project_id -- #{project_id}: getting column #{column}")
            return
        @_query
            query : "SELECT #{column} FROM projects"
            where : 'project_id :: UUID = $' : project_id
            cb    : one_result(column, cb)

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : 'collaborator'  # see misc.PROJECT_GROUPS above
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query       : 'UPDATE projects'
            jsonb_merge :
                users   :
                    "#{opts.account_id}":
                        group: opts.group
            where       :
                "project_id = $::UUID": opts.project_id
            cb          : opts.cb

    set_project_status: (opts) =>
        opts = defaults opts,
            project_id : required
            status     : required
            cb         : undefined
        @_query
            query : "UPDATE projects"
            set   : {"status::JSONB"   : opts.status}
            where : {"project_id = $::UUID": opts.project_id}
            cb    : opts.cb

    set_compute_server_status: (opts) =>
        opts = defaults opts,
            host   : required
            status : required
            cb     : undefined
        @_query
            query : "UPDATE compute_servers"
            set   : {"status::JSONB": opts.status}
            where : {"host = $::TEXT" : opts.host}
            cb    : opts.cb


    # Remove the given collaborator from the project.
    # Attempts to remove an *owner* via this function will silently fail (change their group first),
    # as will attempts to remove a user not on the project, or to remove from a non-existent project.
    remove_collaborator_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query     : 'UPDATE projects'
            jsonb_set : {users : {"#{opts.account_id}": null}}
            where     :
                'project_id :: UUID = $'                          : opts.project_id
                "users#>>'{#{opts.account_id},group}' != $::TEXT" : 'owner'
            cb        : opts.cb

    # remove any user, even an owner.
    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query     : 'UPDATE projects'
            jsonb_set : {users : {"#{opts.account_id}": null}}
            where     : {'project_id :: UUID = $' : opts.project_id}
            cb        : opts.cb

    # Return a list of the account_id's of all collaborators of the given users.
    get_collaborator_ids: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        dbg = @_dbg("get_collaborator_ids")
        @_query
            query : "SELECT DISTINCT jsonb_object_keys(users) FROM projects"
            where : "users ? $::TEXT" : opts.account_id
            cb    : all_results('jsonb_object_keys', opts.cb)

    # return list of paths that are public and not disabled in the given project
    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @_query
            query : "SELECT path FROM public_paths"
            where : [
                "project_id = $::UUID" : opts.project_id,
                "disabled IS NOT TRUE"
            ]
            cb    : all_results('path', opts.cb)

    has_public_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required    # cb(err, has_public_path)
        @_query
            query : "SELECT COUNT(path) FROM public_paths"
            where : [
                "project_id = $::UUID" : opts.project_id,
                "disabled IS NOT TRUE"
            ]
            cb    : count_result (err, n) ->
                opts.cb(err, n>0)

    path_is_public: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
        # Get all public paths for the given project_id, then check if path is "in" one according
        # to the definition in misc.
        # TODO: maybe (?) implement caching + changefeeds so that we only do the get once.
        @get_public_paths
            project_id : opts.project_id
            cb         : (err, public_paths) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, misc.path_is_in_public_paths(opts.path, public_paths))

    filter_public_paths: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            listing    : required   # files in path [{name:..., isdir:boolean, ....}, ...]
            cb         : required
        # Get all public paths for the given project_id, then check if path is "in" one according
        # to the definition in misc.
        @get_public_paths
            project_id : opts.project_id
            cb         : (err, public_paths) =>
                if err
                    opts.cb(err)
                    return
                if misc.path_is_in_public_paths(opts.path, public_paths)
                    # nothing to do -- containing path is public
                    listing = opts.listing
                else
                    listing = misc.deep_copy(opts.listing) # don't mututate input on general principle
                    # some files in the listing might not be public, since the containing path isn't public, so we filter
                    # WARNING: this is kind of stupid since misc.path_is_in_public_paths is badly implemented, especially
                    # for this sort of iteration.  TODO: make this faster.  This could matter since is done on server.
                    listing.files = (x for x in listing.files when \
                        misc.path_is_in_public_paths(misc.path_to_file(opts.path, x.name), public_paths))
                opts.cb(undefined, listing)

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30s (per project, per client).  In particular,
    # once called, it ignores subsequent calls for the same project for 30s.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        if @_throttle('touch_project', 30, opts.project_id)
            opts.cb?()
            return
        @_query
            query : "UPDATE projects"
            set   : {last_edited : 'NOW()'}
            where : "project_id = $::UUID" : opts.project_id
            cb    : opts.cb

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required
        @_query
            query : "SELECT project_id FROM projects"
            where : "last_edited >= $::TIMESTAMP" : misc.seconds_ago(opts.max_age_s)
            cb    : all_results('project_id', opts.cb)

    get_open_unused_projects: (opts) =>
        opts = defaults opts,
            min_age_days : 30         # project must not have been edited in this much time
            max_age_days : 120        # project must have been edited at most this long ago
            host         : required   # hostname of where project is opened
            cb           : required
        @_query
            query : "SELECT project_id FROM projects"
            where : [
                "last_edited >= $::TIMESTAMP" : misc.days_ago(opts.max_age_days)
                "last_edited <= $::TIMESTAMP" : misc.days_ago(opts.min_age_days)
                "host#>>'{host}' = $::TEXT  " : opts.host,
                "state#>>'{state}' = 'opened'"
            ]
            cb    : all_results('project_id', opts.cb)

    # cb(err, true if user is in one of the groups for the project)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : undefined
            groups      : misc.PROJECT_GROUPS
            cb          : required  # cb(err, true if in group)
        if not opts.account_id?
            # clearly user -- who isn't even signed in -- is not in the group
            opts.cb(undefined, false)
            return
        if not @_validate_opts(opts) then return
        @_query
            query : 'SELECT COUNT(*) FROM projects'
            where :
                'project_id :: UUID = $' : opts.project_id
                "users#>>'{#{opts.account_id},group}' = ANY($)" : opts.groups
            cb    : count_result (err, n) =>
                if err
                    opts.cb(err)
                else if n == 0
                    # one more chance -- admin?
                    @is_admin
                        account_id : opts.account_id
                        cb         : opts.cb
                else
                    opts.cb(err, n > 0)

    # all id's of projects having anything to do with the given account
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_opts(opts) then return
        @_query
            query : 'SELECT project_id FROM projects'
            where : 'users ? $::TEXT' : opts.account_id
            cb    : all_results('project_id', opts.cb)

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    # TODO: add something about invited users too and show them in UI!
    get_account_ids_using_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : 'SELECT users FROM projects'
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result 'users', (err, users) =>
                if err
                    opts.cb(err)
                    return
                opts.cb(undefined, if users? then (id for id,v of users when v.group?.indexOf('invite') == -1) else [])

    # Have we successfully (no error) sent an invite to the given email address?
    # If so, returns timestamp of when.
    # If not, returns 0.
    when_sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required  # an email address
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : "SELECT invite#>'{#{opts.to}}' AS to FROM projects"
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result 'to', (err, y) =>
                opts.cb(err, if not y? or y.error or not y.time then 0 else new Date(y.time))

    # call this to record that we have sent an email invite to the given email address
    sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required   # an email address
            error      : undefined  # if there was an error set it to this; leave undefined to mean that sending succeeded
            cb         : undefined
        x = {time: new Date()}
        if opts.error?
            x.error = opts.error
        @_query
            query : "UPDATE projects"
            jsonb_merge :
                {invite : "#{opts.to}" : {time: new Date(), error:opts.error}}
            where : 'project_id :: UUID = $' : opts.project_id
            cb : opts.cb

    ###
    Project host, storage location, and state.
    ###
    set_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        assigned = new Date()
        @_query
            query : "UPDATE projects"
            jsonb_set :
                host : {host:opts.host, assigned:assigned}
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : (err) => opts.cb(err, assigned)

    unset_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "UPDATE projects"
            set   :
                host : null
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : opts.cb

    get_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "SELECT host#>>'{host}' AS host FROM projects"
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result('host', opts.cb)

    set_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        @get_project_storage
            project_id : opts.project_id
            cb         : (err, current) =>
                if err
                    opts.cb(err)
                    return
                if current?.host? and current.host != opts.host
                    opts.cb("change storage not implemented yet -- need to implement saving previous host")
                else
                    # easy case -- assigning for the first time
                    assigned = new Date()
                    @_query
                        query : "UPDATE projects"
                        jsonb_set :
                            storage : {host:opts.host, assigned:assigned}
                        where : 'project_id :: UUID = $' : opts.project_id
                        cb    : (err) => opts.cb(err, assigned)

    get_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_get_project_column('storage', opts.project_id, opts.cb)

    update_project_storage_save: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "UPDATE projects"
            jsonb_merge :
                storage : {saved:new Date()}
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : opts.cb

    set_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            action     : required    # 'save', 'close', 'open', 'move'
            target     : undefined   # needed for 'open' and 'move'
            cb         : required
        x =
            action    : opts.action
            requested : new Date()
        if opts.target?
            x.target = opts.target
        @_query
            query     : "UPDATE projects"
            set       :
                "storage_request::JSONB" : x
            where     : 'project_id :: UUID = $' : opts.project_id
            cb        : opts.cb

    get_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_get_project_column('storage_request', opts.project_id, opts.cb)

    set_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            state      : required
            time       : new Date()
            error      : undefined
            cb         : required
        if typeof(opts.state) != 'string'
            opts.cb("invalid state type")
            return
        if not COMPUTE_STATES[opts.state]?
            opts.cb("state = '#{opts.state}' it not a valid state")
            return
        state =
            state : opts.state
            time  : opts.time
        if opts.error
            state.error = opts.error
        @_query
            query     : "UPDATE projects"
            set       : "state::JSONB" : state
            where     : 'project_id :: UUID = $' : opts.project_id
            cb        : opts.cb

    get_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_get_project_column('state', opts.project_id, opts.cb)

    ###
    Project quotas and upgrades
    ###

    # Returns the total quotas for the project, including any
    # upgrades to the base settings.
    get_project_quotas: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        settings = project_upgrades = undefined
        async.parallel([
            (cb) =>
                @get_project_settings
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        settings = x; cb(err)
            (cb) =>
                @get_project_upgrades
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        project_upgrades = x; cb(err)
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, misc.map_sum(settings, project_upgrades))
        )

    # Return mapping from project_id to map listing the upgrades this particular user
    # applied to the given project.  This only includes project_id's of projects that
    # this user may have upgraded in some way.
    get_user_project_upgrades: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : "SELECT project_id, users#>'{#{opts.account_id},upgrades}' AS upgrades FROM projects"
            where : [
                'users ? $::TEXT' : opts.account_id,    # this is a user of the project
                "users#>'{#{opts.account_id},upgrades}' IS NOT NULL"     # upgrades are defined
            ]
            cb : (err, result) =>
                if err
                    opts.cb(err)
                else
                    x = {}
                    for p in result.rows
                        x[p.project_id] = p.upgrades
                    opts.cb(undefined, x)

    # Ensure that all upgrades applied by the given user to projects are consistent,
    # truncating any that exceed their allotment.  NOTE: Unless there is a bug,
    # the only way the quotas should ever exceed their allotment would be if the
    # user is trying to cheat.
    ensure_user_project_upgrades_are_valid: (opts) =>
        opts = defaults opts,
            account_id : required
            fix        : true       # if true, will fix projects in database whose quotas exceed the alloted amount; it is the caller's responsibility to say actually change them.
            cb         : required   # cb(err, excess)
        excess = stripe_data = project_upgrades = undefined
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        @_query
                            query : 'SELECT stripe_customer FROM accounts'
                            where : 'account_id = $::UUID' : opts.account_id
                            cb    : one_result 'stripe_customer', (err, stripe_customer) =>
                                stripe_data = stripe_customer?.subscriptions?.data
                                cb(err)
                    (cb) =>
                        @get_user_project_upgrades
                            account_id : opts.account_id
                            cb         : (err, x) =>
                                project_upgrades = x
                                cb(err)
                ], cb)
            (cb) =>
                excess = require('smc-util/upgrades').available_upgrades(stripe_data, project_upgrades).excess
                if opts.fix
                    fix = (project_id, cb) =>
                        upgrades = undefined
                        async.series([
                            (cb) =>
                                @_query
                                    query : "SELECT users#>'{#{opts.account_id},upgrades}' AS upgrades FROM projects"
                                    where : 'project_id = $::UUID' : project_id
                                    cb    : one_result 'upgrades', (err, x) =>
                                        upgrades = x; cb(err)
                            (cb) =>
                                if not upgrades?
                                    cb(); return
                                # WORRY: this is dangerous since if something else changed about a user
                                # between the read/write here, then we would have trouble.  (This is milliseconds of time though...)
                                for k, v of excess[project_id]
                                    upgrades[k] -= v
                                @_query
                                    query       : "UPDATE projects"
                                    where       : 'project_id = $::UUID' : project_id
                                    jsonb_merge :
                                        users : {"#{opts.account_id}": {upgrades: upgrades}}
                                    cb          : cb
                        ], cb)
                    async.map(misc.keys(excess), fix, cb)
                else
                    cb()
        ], (err) =>
            opts.cb(err, excess)
        )

    # Return the sum total of all user upgrades to a particular project
    get_project_upgrades: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : 'SELECT users FROM projects'
            where : 'project_id = $::UUID' : opts.project_id
            cb    : one_result 'users', (err, users) =>
                if err
                    opts.cb(err); return
                upgrades = undefined
                if users?
                    for account_id, info of users
                        upgrades = misc.map_sum(upgrades, info.upgrades)
                opts.cb(undefined, upgrades)

    ###
    Project settings
    ###
    get_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "SELECT settings FROM projects"
            where : 'project_id = $::UUID' : opts.project_id
            cb    : one_result 'settings', (err, settings) =>
                if err
                    opts.cb(err)
                else if not settings?
                    opts.cb(undefined, misc.copy(DEFAULT_QUOTAS))
                else
                    settings = misc.coerce_codomain_to_numbers(settings)
                    quotas = {}
                    for k, v of DEFAULT_QUOTAS
                        quotas[k] = if not settings[k]? then v else settings[k]
                    opts.cb(undefined, quotas)

    set_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            settings   : required   # can be any subset of the map
            cb         : required
        @_query
            query       : "UPDATE projects"
            where       : 'project_id = $::UUID' : opts.project_id
            jsonb_merge : {settings: opts.settings}
            cb          : opts.cb


    ###
    Stats
    ###
    _count_timespan: (opts) =>
        opts = defaults opts,
            table    : required
            field    : undefined
            age_m    : undefined
            upper_m  : undefined  # defaults to zero minutes (i.e. "now")
            cb       : required
        where = {}
        if opts.field?
            if opts.age_m?
                where["#{opts.field} >= $::TIMESTAMP"] = misc.minutes_ago(opts.age_m)
            if opts.upper_m?
                where["#{opts.field} <= $::TIMESTAMP"] = misc.minutes_ago(opts.upper_m)
        @_query
            query : "SELECT COUNT(*) FROM #{opts.table}"
            where : where
            cb    : count_result(opts.cb)

    recent_projects: (opts) =>
        opts = defaults opts,
            age_m     : required   # return results at most this old
            min_age_m : 0          # only returns results at least this old
            pluck     : undefined  # if not given, returns list of project_id's; if given (as an array), returns objects with these fields
            cb        : required   # cb(err, list of strings or objects)

        if opts.pluck?
            columns = opts.pluck.join(',')
            cb = all_results(opts.cb)
        else
            columns = 'project_id'
            cb = all_results('project_id', opts.cb)
        @_query
            query : "SELECT #{columns} FROM projects"
            where :
                "last_edited >= $::TIMESTAMP" : misc.minutes_ago(opts.age_m)
                "last_edited <= $::TIMESTAMP" : misc.minutes_ago(opts.min_age_m)
            cb    : cb

    get_stats_interval: (opts) =>
        opts = defaults opts,
            start : required
            end   : required
            cb    : required
        @_query
            query    : 'SELECT * FROM stats'
            where    :
                "time >= $::TIMESTAMP" : opts.start
                "time <= $::TIMESTAMP" : opts.end
            order_by : 'time'
            cb       : all_results(opts.cb)

    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute new one and store
    # in cache for ttl seconds.
    get_stats: (opts) =>
        opts = defaults opts,
            ttl : 60         # how long cached version lives (in seconds)
            cb  : undefined
        stats = undefined
        dbg = @_dbg('get_stats')
        async.series([
            (cb) =>
                dbg("using cached stats?")
                if @_stats_cached? and @_stats_cached.time > misc.seconds_ago(opts.ttl)
                    stats = @_stats_cached
                    dbg("using locally cached stats from #{(new Date() - stats.time) / 1000} secs ago.")
                    cb(); return
                @_query
                    query : "SELECT * FROM stats ORDER BY time DESC LIMIT 1"
                    cb    : one_result (err, x) =>
                        if err or not x? or (x? and x.time < misc.seconds_ago(opts.ttl))
                            dbg("not using cache")
                            cb(err)
                        else
                            dbg("using db cached stats from #{(new Date() - x.time) / 1000} secs ago.")
                            stats = x
                            # storing still valid result in local cache
                            @_stats_cached = misc.deep_copy(stats)
                            cb()
            (cb) =>
                if stats?
                    cb(); return
                dbg("querying all stats from the DB")
                stats = {time : new Date(), projects_created : {}, projects_edited: {}, accounts_created : {}}
                R = RECENT_TIMES
                K = RECENT_TIMES_KEY
                async.parallelLimit([
                    (cb) => @_count_timespan(table:'accounts', cb:(err, x) => stats.accounts = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', cb:(err, x) => stats.projects = x; cb(err))

                    (cb) => @_count_timespan(table:'projects', field: 'last_edited', age_m: R.active, cb: (err, x) => stats.projects_edited[K.active] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'last_edited', age_m: R.last_hour, cb: (err, x) => stats.projects_edited[K.last_hour] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'last_edited', age_m: R.last_day, cb: (err, x) => stats.projects_edited[K.last_day]  = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'last_edited', age_m: R.last_week, cb: (err, x) => stats.projects_edited[K.last_week] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'last_edited', age_m: R.last_month, cb: (err, x) => stats.projects_edited[K.last_month]= x; cb(err))

                    (cb) => @_count_timespan(table:'projects', field: 'created', age_m: R.last_hour, cb: (err, x) => stats.projects_created[K.last_hour] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'created', age_m: R.last_day, cb: (err, x) => stats.projects_created[K.last_day] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'created', age_m: R.last_week, cb: (err, x) => stats.projects_created[K.last_week] = x; cb(err))
                    (cb) => @_count_timespan(table:'projects', field: 'created', age_m: R.last_month, cb: (err, x) => stats.projects_created[K.last_month] = x; cb(err))

                    (cb) => @_count_timespan(table: 'accounts', field: 'created', age_m: R.last_hour,  cb: (err, x) => stats.accounts_created[K.last_hour] = x; cb(err))
                    (cb) => @_count_timespan(table: 'accounts', field: 'created', age_m: R.last_day,   cb: (err, x) => stats.accounts_created[K.last_day] = x; cb(err))
                    (cb) => @_count_timespan(table: 'accounts', field: 'created', age_m: R.last_week,  cb: (err, x) => stats.accounts_created[K.last_week] = x; cb(err))
                    (cb) => @_count_timespan(table: 'accounts', field: 'created', age_m: R.last_month, cb: (err, x) => stats.accounts_created[K.last_month] = x; cb(err))
                    (cb) =>
                        @_query
                            query : 'SELECT expire, host, clients FROM hub_servers'
                            cb    : all_results (err, hub_servers) =>
                                if err
                                    cb(err)
                                else
                                    now = new Date()
                                    stats.hub_servers = []
                                    for x in hub_servers
                                        if x.expire > now
                                            delete x.expire
                                            stats.hub_servers.push(x)
                                    cb()
                ], MAP_LIMIT, (err) =>
                    if err
                        cb(err)
                    else
                        dbg("everything succeeded in parallel above -- now insert stats")
                        # storing in local and db cache
                        stats.id = misc.uuid()
                        @_stats_cached = misc.deep_copy(stats)
                        @_query
                            query  : 'INSERT INTO stats'
                            values : stats
                            cb     : cb
                )
        ], (err) =>
            opts.cb?(err, stats)
        )

    get_active_student_stats: (opts) =>
        opts = defaults opts,
            cb  : required
        dbg = @_dbg('get_active_student_stats')
        dbg()
        @_query
            query  : "SELECT project_id, course, last_edited, settings, users FROM projects WHERE course IS NOT NULL AND last_edited >= $1"
            params : [misc.days_ago(30)]
            cb     : all_results (err, t) =>
                if err
                    opts.cb(err)
                    return
                days14 = misc.days_ago(14)
                days7  = misc.days_ago(7)
                days1  = misc.days_ago(1)
                # student pay means that the student is required to pay
                num_student_pay = (x for x in t when x.course.pay).length
                # prof pay means that student isn't required to pay but
                # nonetheless project is on members only host
                num_prof_pay    = 0
                for x in t
                    if not x.course.pay  # student isn't paying
                        if x.settings?.member_host
                            num_prof_pay += 1
                            continue
                        for _, d of x.users
                            if d.upgrades?.member_host
                                num_prof_pay += 1
                                continue
                # free - neither student pays, and also project not on members only server
                num_free        = t.length - num_prof_pay - num_student_pay
                conversion_rate = if t.length then 100*(num_student_pay + num_prof_pay) / t.length else 0
                data =
                    conversion_rate : conversion_rate
                    num_student_pay : num_student_pay
                    num_prof_pay    : num_prof_pay
                    num_free        : num_free
                    num_1days       : (x for x in t when x.last_edited >= days1).length
                    num_7days       : (x for x in t when x.last_edited >= days7).length
                    num_14days      : (x for x in t when x.last_edited >= days14).length
                    num_30days      : t.length
                opts.cb(undefined, data)


    ###
    Hub servers
    ###
    register_hub: (opts) =>
        opts = defaults opts,
            host    : required
            port    : required
            clients : required
            ttl     : required
            cb      : required
        # Since multiple hubs can run on the same host (but with different ports) and the host is the primary
        # key, we combine the host and port number in the host name for the db.  The hub_servers table is only
        # used for tracking connection stats, so this is safe.
        @_query
            query  : "INSERT INTO hub_servers"
            values :
                "host    :: TEXT     " : "#{opts.host}-#{opts.port}"
                "port    :: INTEGER  " : opts.port
                "clients :: INTEGER  " : opts.clients
                "expire  :: TIMESTAMP" : expire_time(opts.ttl)
            conflict : 'host'
            cb : opts.cb

    get_hub_servers: (opts) =>
        opts = defaults opts,
            cb   : required
        @_query
            query : "SELECT * FROM hub_servers"
            cb    : all_results (err, v) =>
                if err
                    opts.cb(err)
                    return
                w = []
                to_delete = []
                now = new Date()
                for x in v
                    if x.expire and x.expire <= now
                        to_delete.push(x.host)
                    else
                        w.push(x)
                if to_delete.length > 0
                    @_query
                        query : "DELETE FROM hub_servers"
                        where : "host = ANY($)" : to_delete
                        cb    : (err) => opts.cb(err, w)
                else
                    opts.cb(undefined, w)

    ###
    Compute servers
    ###
    save_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : required
            port         : required
            secret       : required
            experimental : false
            member_host  : false
            cb           : required
        @_query
            query    : "INSERT INTO compute_servers"
            values   :
                'host         :: TEXT    ' : opts.host
                'dc           :: TEXT    ' : opts.dc
                'port         :: INTEGER ' : opts.port
                'secret       :: TEXT    ' : opts.secret
                'experimental :: BOOLEAN ' : opts.experimental
                'member_host  :: BOOLEAN ' : opts.member_host
            conflict : 'host'
            cb : opts.cb

    get_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            cb           : required
        @_query
            query : "SELECT * FROM compute_servers"
            where :
                "host = $::TEXT" : opts.host
            cb    : one_result(opts.cb)

    get_all_compute_servers: (opts) =>
        opts = defaults opts,
            experimental : undefined
            cb           : required
        @_query
            query : "SELECT * FROM compute_servers"
            where : "host = $::TEXT" : opts.host
            cb    : all_results (err, servers) =>
                if err
                    opts.cb(err)
                else
                    if opts.experimental?
                        is_experimental = !!opts.experimental
                        # just filter experimental client side, since so few servers...
                        servers = (server for server in servers when !!server.experimental == is_experimental)
                    opts.cb(undefined, servers)

    get_projects_on_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # hostname of the compute server
            columns        : ['project_id']
            cb             : required
        @_query
            query : "SELECT #{opts.columns.join(',')} FROM projects"
            where :
                "host @> $::JSONB" : {host:opts.compute_server}
            cb    : all_results(opts.cb)

    is_member_host_compute_server: (opts) =>
        opts = defaults opts,
            host : required   # hostname of the compute server
            cb   : required
        @_query
            query : "SELECT member_host FROM compute_servers"
            where : "host = $::TEXT" : opts.host
            cache : true   # cache result (for a few seconds), since this is very unlikely to change.
            cb    : one_result 'member_host', (err, member_host) =>
                opts.cb(err, !!member_host)

