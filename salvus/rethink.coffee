###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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


async = require('async')
_ = require('underscore')
moment  = require('moment')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc_node = require('misc_node')
{defaults} = misc = require('misc')
required = defaults.required

# todo -- these should be in an admin settings table in the database (and maybe be more sophisticated...)
DEFAULT_QUOTAS =
    disk_quota : 3000
    cores      : 1
    memory     : 1000
    cpu_shares : 256
    mintime    : 3600   # hour
    network    : false

###
# Schema
#   keys are the table names
#   values describe the indexes, except:
#        options - specifies table creation options as given at
#           http://rethinkdb.com/api/javascript/table_create/
#
###

# TODO: make options and indexes keys
# rather than mixing them?

exports.t = TABLES =
    accounts    :
        options :
            primaryKey : 'account_id'
        user_set :
            editor_settings : true
            other_settings : true
            first_name : true
            last_name : true
            terminal  : true
            autosave  : true
        passports     : ["that.r.row('passports').keys()", {multi:true}]
        created_by    : ["[that.r.row('created_by'), that.r.row('created')]"]
    account_creation_actions :
        email_address : ["[that.r.row('email_address'), that.r.row('expire')]"]
        expire : []  # only used by delete_expired
    blobs :
        expire : []
    central_log :
        time : []
        event : []
    client_error_log :
        time : []
        event : []
    compute_servers :
        options :
            primaryKey : 'host'
    file_use:
        user_set :
            id          : true
            project_id  : true
            path        : true
            last_edited : true
            use         : true
        project_id  : []
        last_edited : []
        'project_id-path' : ["[that.r.row('project_id'), that.r.row('path')]"]
        'project_id-path-last_edited' : ["[that.r.row('project_id'), that.r.row('path'), that.r.row('last_edited')]"]
        'project_id-last_edited' : ["[that.r.row('project_id'), that.r.row('last_edited')]"]
    file_activity:
        timestamp : []
        project_id: []
        'project_id-timestamp' : ["[that.r.row('project_id'), that.r.row('timestamp')]"]
        'project_id-path-timestamp' : ["[that.r.row('project_id'), that.r.row('path'), that.r.row('timestamp')]"]
    file_access_log :
        project_id : []
        timestamp : []
    hub_servers :
        options :
            primaryKey : 'host'
        expire : []
    passport_settings :
        options :
            primaryKey : 'strategy'
    password_reset :
        expire : []  # only used by delete_expired
    password_reset_attempts :
        email_address : ["[that.r.row('email_address'),that.r.row('timestamp')]"]
        ip_address    : ["[that.r.row('ip_address'),that.r.row('timestamp')]"]
        timestamp     : []
    projects    :
        options :
            primaryKey : 'project_id'
        user_set :
            title : true
            description : true
        compute_server : []
        last_edited : [] # so can get projects last edited recently
        users       : ["that.r.row('users').keys()", {multi:true}]
    remember_me :
        options :
            primaryKey : 'hash'
        expire     : []
        account_id : []
    server_settings:
        options :
            primaryKey : 'name'
        admin_set :
            name : true
            value : true
    stats :
        timestamp : []

# these fields are arrays of account id's, which
# we need indexed:
for group in misc.PROJECT_GROUPS
    TABLES.projects[group] = [{multi:true}]

PROJECT_GROUPS = misc.PROJECT_GROUPS

exports.PUBLIC_PROJECT_COLUMNS = ['project_id',  'last_edited', 'title', 'description', 'deleted',  'created']
exports.PROJECT_COLUMNS = PROJECT_COLUMNS = ['users'].concat(exports.PUBLIC_PROJECT_COLUMNS)


# convert a ttl in seconds to an expiration time; otherwise undefined
exports.expire_time = expire_time = (ttl) -> if ttl then new Date((new Date() - 0) + ttl*1000)

# Setting password:
#
#  db=require('rethink').rethinkdb()
#  db.r.db('rethinkdb').table('cluster_config').get('auth').update(auth_key:'secret').run(console.log)
#
class RethinkDB
    constructor : (opts={}) ->
        opts = defaults opts,
            hosts    : ['localhost']
            password : undefined
            database : 'smc'
            debug    : true
        @_debug = opts.debug
        # NOTE: we use rethinkdbdash, which is a *much* better connectionpool and api for rethinkdb.
        @r = require('rethinkdbdash')(servers:({host:h, authKey:opts.password} for h in opts.hosts))
        @_database = opts.database
        @db = @r.db(@_database)

    table: (name) => @db.table(name)

    dbg: (f) =>
        if @_debug
            return (m) => winston.debug("RethinkDB.#{f}: #{m}")
        else
            return () ->

    update_schema: (opts={}) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("create_schema")
        async.series([
            (cb) =>
                #dbg("get list of known db's")
                @r.dbList().run (err, x) =>
                    if err or @_database in x
                        cb(err)
                    else
                        dbg("create db")
                        @r.dbCreate(@_database).run(cb)
            (cb) =>
                @db.tableList().run (err, x) =>
                    if err
                        cb(err)
                    tables = (t for t in misc.keys(TABLES) when t not in x)
                    if tables.length > 0
                        dbg("creating #{tables.length} tables")
                    async.map(tables, ((table, cb) => @db.tableCreate(table, TABLES[table].options).run(cb)), cb)
            (cb) =>
                f = (name, cb) =>
                    indexes = misc.copy(TABLES[name])
                    if indexes.options?
                        delete indexes.options
                    if indexes.user_set?
                        delete indexes.user_set
                    if not indexes
                        cb(); return
                    table = @table(name)
                    create = (n, cb) =>
                        w = (x for x in indexes[n])
                        for i in [0...w.length]
                            if typeof(w[i]) == 'string'
                                that = @
                                w[i] = eval(w[i])
                        table.indexCreate(n, w...).run (err) =>
                            if err
                                cb(err)
                            else
                                table.indexWait(n).run(cb)
                    table.indexList().run (err, known) =>
                        if err
                            cb(err)
                        else
                            for n in known
                                delete indexes[n]
                            x = misc.keys(indexes)
                            if x.length > 0
                                dbg("indexing #{name}: #{misc.to_json(x)}")
                            async.map(x, create, cb)
                async.map(misc.keys(TABLES), f, cb)
        ], (err) => opts.cb?(err))

    delete_all: (opts) =>
        opts = defaults opts,
            confirm : 'no'
            cb      : required
        if opts.confirm != 'yes'
            opts.cb("you must explicitly pass in confirm='yes' (but confirm='#{opts.confirm}')")
            return
        @r.dbList().run (err, x) =>
            if err or @_database not in x
                opts.cb(err); return
            @db.tableList().run (err, tables) =>
                if err
                    opts.cb(err); return
                async.map(tables, ((name, cb) => @table(name).delete().run(cb)), opts.cb)

    # Go through every table in the schema with an index called "expire", and
    # delete every entry where expire is <= right now.  This saves disk space, etc.
    delete_expired: (opts) =>
        opts = defaults opts,
            cb  : required
        f = (table, cb) =>
            @table(table).between(new Date(0), new Date(), index:'expire').delete().run(cb)
        async.map((k for k, v of TABLES when v.expire?), f, opts.cb)



    ###
    # Tables for loging things that happen
    ###
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object (will be JSON'd)
            cb    : undefined
        @table('central_log').insert({event:opts.event, value:opts.value, time:new Date()}).run((err)=>opts.cb?(err))

    _process_time_range: (opts) =>
        if opts.start? or opts.end?
            # impose an interval of time constraint
            if not opts.start?
                opts.start = new Date(0)
            if not opts.end?
                opts.end = new Date()

    get_log: (opts={}) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            log   : 'central_log'
            cb    : required
        query = @table(opts.log)
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'time'})
        if opts.event?  # restrict to only the given event
            query = query.filter(@r.row("event").eq(opts.event))
        query.run(opts.cb)

    log_client_error: (opts) =>
        opts = defaults opts,
            event      : required
            error      : required
            account_id : undefined
            cb         : undefined
        @table('client_error_log').insert(
            {event:opts.event, error:opts.error, account_id:opts.account_id, time:new Date()}
        ).run((err)=>opts.cb?(err))

    get_client_error_log: (opts={}) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        opts.log = 'client_error_log'
        @get_log(opts)

    ###
    # Server settings
    ###
    set_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            value : required
            cb    : required
        @table("server_settings").insert(
            {name:opts.name, value:opts.value}, conflict:"replace").run(opts.cb)

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        @table('server_settings').get(opts.name).run (err, x) =>
            opts.cb(err, if x then x.value)

    ###
    # Passport settings
    ###
    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            cb       : required
        @table('passport_settings').insert({strategy:opts.strategy, conf:opts.conf}, conflict:'update').run(opts.cb)

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @table('passport_settings').get(opts.strategy).run (err, x) =>
            opts.cb(err, if x then x.conf)

    ###
    # Account creation, deletion, existence
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

        dbg = @dbg("create_account(#{opts.first_name}, #{opts.last_name} #{opts.email_address}, #{opts.passport_strategy}, #{opts.passport_id})")
        dbg()

        if opts.email_address? # canonicalize the email address, if given
            opts.email_address = misc.lower_email_address(opts.email_address)

        if not opts.email_address? and not opts.passport_strategy?
            opts.cb("email_address or passport must be given")
            return

        account_id = undefined # will be generated by db

        async.series([
            (cb) =>
                # Verify in parallel that there's no account already with the
                # requested email or passport.  This should never fail, except
                # in case of some sort of rare bug or race condition where a
                # person tries to sign up several times at once.
                async.parallel([
                    (cb) =>
                        if not opts.email_address?
                            cb(); return
                        dbg("verify that no account with the given email (='#{opts.email_address}') already exists")
                        @account_exists
                            email_address : opts.email_address
                            cb : (err, account_id) =>
                                if err
                                    cb(err)
                                else if account_id
                                    cb("account with email address '#{opts.email_address}' already exists")
                                else
                                    cb()
                    (cb) =>
                        if not opts.passport_strategy?
                            cb(); return
                        dbg("verify that no account with passport strategy (='#{opts.passport_strategy}') already exists")
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
                ], cb)

            (cb) =>
                dbg("create the actual account")
                if opts.passport_strategy?
                    passport =
                        strategy:opts.passport_strategy
                        id:opts.passport_id
                        profile:opts.passport_profile
                account =
                    first_name    : opts.first_name
                    last_name     : opts.last_name
                    email_address : opts.email_address
                    password_hash : opts.password_hash
                    passports     : if passport? then [passport]
                    created       : new Date()
                    created_by    : opts.created_by
                @table('accounts').insert(account).run (err, x) =>
                    if err
                        cb(err)
                    else
                        account_id = x.generated_keys[0]
                        cb()
        ], (err) =>
            if err
                dbg("error creating account -- #{err}")
                opts.cb(err)
            else
                dbg("successfully created account")
                opts.cb(undefined, account_id)
        )

    count_accounts_created_by: (opts) =>
        opts = defaults opts,
            ip_address : required
            age_s      : required
            cb         : required
        @table('accounts').between(
            [opts.ip_address, new Date(new Date() - opts.age_s*1000)],
            [opts.ip_address, new Date()],
            {index:'created_by'}).count().run(opts.cb)

    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('accounts').get(opts.account_id).delete().run(opts.cb)

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or false) -- true if account exists; err = problem with db connection...
        @table('accounts').getAll(opts.email_address, {index:'email_address'}).count().run (err, n) =>
            opts.cb(err, n>0)

    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined # if given, adds this action
            ttl           : 60*60*24*14 # add action with this ttl in seconds (default: 2 weeks)
            cb            : required  # if ttl not given cb(err, [array of actions])
        t = @table('account_creation_actions')
        if opts.action?
            # add action
            t.insert({email_address:opts.email_address, action:opts.action, expire:expire_time(opts.ttl)}).run(opts.cb)
        else
            # query for actions
            t.between([opts.email_address, new Date()],
                      [opts.email_address, new Date(1e13)], index:'email_address'
                     ).pluck('action').run (err, x) =>
                opts.cb(err, if x then (y.action for y in x))

    account_creation_actions_success: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @table('accounts').get(opts.account_id).update(creation_actions_done:true).run(opts.cb)

    ###
    # Stripe support for accounts
    ###
    set_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            customer_id : required
            cb          : required
        @table('accounts').get(opts.account_id).update(stripe_customer_id : opts.customer_id).run(opts.cb)

    get_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            cb          : required
        @table('accounts').get(opts.account_id).pluck('stripe_customer_id').run (err, x) =>
            opts.cb(err, if x then x.stripe_customer_id)


    ###
    # Querying for searchable information about accounts.
    ###

    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_opts(opts) then return
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(false, [])
            return
        @table('accounts').getAll(opts.account_ids...).pluck("first_name", "last_name", "account_id").run (err, x) =>
            if err
                opts.cb?(err)
            else
                v = misc.dict(([r.account_id, {first_name:r.first_name, last_name:r.last_name}] for r in x))
                # fill in unknown users (should never be hit...)
                for id in opts.account_ids
                    if not v[id]
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


    # all_users: cb(err, array of {first_name:?, last_name:?, account_id:?, search:'names and email thing to search'})
    #
    # No matter how often all_users is called, it is only updated at most once every 5 minutes, since it is expensive
    # to scan the entire database, and the client will typically make numerous requests within seconds for
    # different searches.  When some time elapses and we get a search, if we have an old cached list in memory, we
    # use it and THEN start computing a new one -- so user queries are always answered nearly instantly, but only
    # repeated queries will give an up to date result.
    #
    # Of course, caching means that newly created accounts, or modified account names,
    # will not show up in searches for 5 minutes.  TODO: fix this by subscribing to a change
    # food on the accounts table.
    #
    all_users: (cb) =>
        if @_all_users_fresh?
            cb(false, @_all_users); return
        if @_all_users?
            cb(false, @_all_users); return
        if @_all_users_computing?
            @_all_users_computing.push(cb)
            return
        @_all_users_computing = [cb]
        f = (cb) =>
            @table('accounts').pluck("first_name", "last_name", "account_id").run (err, results) =>
                if err
                    cb(err); return
                v = []
                for r in results
                    if not r.first_name?
                        r.first_name = ''
                    if not r.last_name?
                        r.last_name = ''
                    search = (r.first_name + ' ' + r.last_name).toLowerCase()
                    obj = {account_id : r.account_id, first_name:r.first_name, last_name:r.last_name, search:search}
                    v.push(obj)
                v.sort (a,b) ->
                    c = misc.cmp(a.last_name, b.last_name)
                    if c
                        return c
                    return misc.cmp(a.first_name, b.first_name)
                cb(undefined, v)
        f (err, v) =>
            w = @_all_users_computing
            delete @_all_users_computing
            if not err
                @_all_users = v
                @_all_users_fresh = true
                setTimeout((()=>delete @_all_users_fresh), 5*60000)   # cache for 5 minutes
            for cb in w
                cb(err, v)

    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : undefined    # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.
        {string_queries, email_queries} = misc.parse_user_search(opts.query)
        results = []
        dbg = @dbg("user_search")
        async.parallel([
            (cb) =>
                if email_queries.length == 0
                    cb(); return
                dbg("do email queries -- with exactly two targeted db queries (even if there are hundreds of addresses)")
                @table('accounts').getAll(email_queries..., {index:'email_address'}).pluck('account_id', 'first_name', 'last_name', 'email_address').run (err, r) =>
                    if err
                        cb(err)
                    else
                        results.push(r...)
                        cb()
            (cb) =>
                dbg("do all string queries")
                if string_queries.length == 0 or (opts.limit? and results.length >= opts.limit)
                    # nothing to do
                    cb(); return
                @all_users (err, users) =>
                    if err
                        cb(err); return
                    match = (search) ->
                        for query in string_queries
                            matches = true
                            for q in query
                                if search.indexOf(q) == -1
                                    matches = false
                                    break
                            if matches
                                return true
                        return false
                    # SCALABILITY WARNING: In the worst case, this is a non-indexed linear search through all
                    # names which completely locks the server.  That said, it would take about
                    # 500,000 users before this blocks the server for *1 second*...
                    # TODO: we should limit the number of search requests per user per minute, since this
                    # is a DOS vector.
                    # TODO: another approach might be to write everything to a file and use grep and a subprocess.
                    # Grep is crazy fast and that wouldn't block.
                    for x in users
                        if match(x.search)
                            results.push(x)
                            if opts.limit? and results.length >= opts.limit
                                break
                    cb()
            ], (err) => opts.cb(err, results))

    ###
    # Information about a specific account
    ###
    _account: (opts) =>
        query = @table('accounts')
        if opts.account_id?
            return query.getAll(opts.account_id)
        else if opts.email_address?
            return query.getAll(opts.email_address, {index:'email_address'})
        else
            throw "_account: opts must have account_id or email_address field"

    get_account: (opts={}) =>
        opts = defaults opts,
            cb            : required
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
        if not @_validate_opts(opts) then return
        @_account(opts).pluck(opts.columns...).run (err, x) =>
            if err
                opts.cb(err)
            else if x.length == 0
                opts.cb("no such account")
            else
                if 'password_is_set' in opts.columns
                    x[0]['password_is_set'] = !!x[0].password_hash
                opts.cb(undefined, x[0])

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)
        if not @_validate_opts(opts) then return
        @_account(opts).pluck('banned').run (err, x) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, x.length > 0 and !!x[0].banned)

    ban_user: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        @_account(opts).update(banned:true).run(opts.cb)

    unban_user: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        @_account(opts).update(banned:false).run(opts.cb)

    ###
    # Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
    # The Schema is slightly redundant, but indexed properly:
    #    {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}
    ###
    _passport_key: (opts) => "#{opts.strategy}-#{opts.id}"

    create_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            profile    : required
            cb         : required   # cb(err)
        obj = {}; obj[@_passport_key(opts)] = opts.profile
        @_account(opts).update(passports:obj).run(opts.cb)

    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            cb         : required
        x = {}; x[@_passport_key(opts)] = true
        @_account(opts).replace(@r.row.without(passports:x)).run(opts.cb)

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        @table('accounts').getAll(@_passport_key(opts), {index:'passports'}).pluck('account_id').run (err, x) =>
            opts.cb(err, if x.length > 0 then x[0].account_id)

    ###
    # Account settings
    ###
    update_account_settings: (opts={}) ->
        opts = defaults opts,
            account_id : required
            set        : required
            cb         : required
        if opts.set.email_address?
            email_address = opts.set.email_address
            delete opts.set.email_address
        if not @_validate_opts(opts) then return
        async.parallel([
            (cb) =>
                # treat email separately, since email must be globally unique.
                if email_address?
                    @change_email_address
                        account_id    : opts.account_id
                        email_address : email_address
                        cb            : cb
                else
                    cb()
            (cb) =>
                # make all the non-email changes
                @_account(opts).update(opts.set).run(cb)
        ], opts.cb)

    ###
    # Remember-me functions
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
        @table('remember_me').insert(hash:opts.hash.slice(0,127), value:opts.value, expire:expire_time(opts.ttl), account_id:opts.account_id).run(opts.cb)

    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id    : required
            cb            : required
        @table('remember_me').getAll(opts.account_id, {index:'account_id'}).delete().run(opts.cb)

    # Get remember me cookie with given hash.  If it has expired,
    # get back undefined instead.  (Actually deleting expired)
    get_remember_me: (opts) =>
        opts = defaults opts,
            hash       : required
            cb         : required   # cb(err, signed_in_message)
        @table('remember_me').get(opts.hash.slice(0,127)).run (err, x) =>
            if err or not x
                opts.cb(err); return
            if new Date() >= x.expire  # expired, so async delete
                x = undefined
                @delete_remember_me(hash:opts.hash)
            opts.cb(undefined, x.value)

    delete_remember_me: (opts) =>
        opts = defaults opts,
            hash : required
            cb   : undefined
        @table('remember_me').get(opts.hash.slice(0,127)).delete().run((err) => opts.cb?(err))


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
        async.series([  # don't do in parallel -- don't kill remember_me if password failed!
            (cb) =>
                @_account(opts).update(password_hash:opts.password_hash).run(cb)
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
                    @_account(account_id:opts.account_id).update(email_address:opts.email_address).run(opts.cb)

    ###
    # Password reset
    ###
    set_password_reset: (opts) =>
        opts = defaults opts,
            email_address : required
            ttl           : required
            cb            : required   # cb(err, uuid)
        @table('password_reset').insert({
            email_address:opts.email_address, expire:expire_time(opts.ttl)}).run (err, x) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, x.generated_keys[0])

    get_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @table('password_reset').get(opts.id).run (err, x) =>
            opts.cb(err, if x and x.expire > new Date() then x.email_address)

    delete_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @table('password_reset').get(opts.id).delete().run(opts.cb)

    record_password_reset_attempt: (opts) =>
        opts = defaults opts,
            email_address : required
            ip_address    : required
            cb            : required   # cb(err)
        @table("password_reset_attempts").insert({
            email_address:opts.email_address, ip_address:opts.ip_address, timestamp:new Date()
            }).run(opts.cb)

    count_password_reset_attempts: (opts) =>
        opts = defaults opts,
            email_address : undefined  # must give one of email_address or ip_address
            ip_address    : undefined
            age_s         : required
            cb            : required   # cb(err)
        query = @table('password_reset_attempts')
        start = new Date(new Date() - opts.age_s*1000); end = new Date()
        if opts.email_address?
            query = query.between([opts.email_address, start], [opts.email_address, end], {index:'email_address'})
        else if opts.ip_address?
            query = query.between([opts.ip_address, start], [opts.ip_address, end], {index:'ip_address'})
        else
            query = query.between(start, end, {index:'timestamp'})
        query.count().run(opts.cb)

    #############
    # Tracking file access
    ############
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        entry =
            project_id : opts.project_id
            account_id : opts.account_id
            filename   : opts.filename
            timestamp  : new Date()
        @table('file_access_log').insert(entry).run((err)=>opts.cb?(err))

    # Get all files accessed in all projects in given time range
    get_file_access: (opts) =>
        opts = defaults opts,
            start  : undefined   # start timestamp
            end    : undefined   # end timestamp
            cb     : required
        query = @table('file_access_log')
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'timestamp'})
        query.run(opts.cb)

    #############
    # Projects
    ############
    create_project: (opts) =>
        opts = defaults opts,
            account_id  : required    # initial owner
            title       : undefined
            description : undefined
            cb          : required    # cb(err, project_id)
        if not @_validate_opts(opts) then return
        project =
            title       : opts.title
            description : opts.description
            created     : new Date()
            last_edited : new Date()
            users       : {}
        project.users[opts.account_id] = {group:'owner'}
        @table('projects').insert(project).run (err, x) =>
            opts.cb(err, x?.generated_keys[0])

    get_project: (opts) =>
        opts = defaults opts,
            project_id : required   # an array of id's
            columns    : PROJECT_COLUMNS
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck(opts.columns).run(opts.cb)

    update_project_data: (opts) =>
        opts = defaults opts,
            project_id : required
            data       : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).update(opts.data).run(opts.cb)

    get_project_data: (opts) =>
        opts = defaults opts,
            project_id  : required
            columns     : PROJECT_COLUMNS
            cb          : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck(opts.columns...).run(opts.cb)

    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck('public_paths').run (err, x) =>
            opts.cb(err, if x?.public_paths? then x.public_paths else {})   # map {path:description}

    publish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            description : required
            cb          : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.path] = opts.description
        @table('projects').get(opts.project_id).update(public_paths:x).run(opts.cb)

    unpublish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            cb          : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.path] = true
        @table('projects').get(opts.project_id).replace(
            @r.row.without(public_paths:x)).run(opts.cb)

    _validate_opts: (opts) =>
        for k, v of opts
            if k.slice(k.length-2) == 'id'
                if v? and not misc.is_valid_uuid_string(v)
                    opts.cb("invalid #{k} -- #{v}")
                    return false
            if k.slice(k.length-3) == 'ids'
                for w in v
                    if not misc.is_valid_uuid_string(w)
                        opts.cb("invalid uuid #{w} in #{k} -- #{misc.to_json(v)}")
                        return false
            if k == 'group' and v not in misc.PROJECT_GROUPS
                opts.cb("unknown project group '#{v}'"); return false
            if k == 'groups'
                for w in v
                    if w not in misc.PROJECT_GROUPS
                        opts.cb("unknown project group '#{w}' in groups"); return false

        return true

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = {group:opts.group}
        @table('projects').get(opts.project_id).update(users:x).run(opts.cb)

    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = true
        @table('projects').get(opts.project_id).replace(@r.row.without(users:x)).run(opts.cb)

    get_project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            groups     : PROJECT_GROUPS
            cb         : required    # cb(err, {group:[{account_id:?,first_name:?,last_name:?}], ...})
        if not @_validate_opts(opts) then return
        groups = undefined
        async.series([
            (cb) =>
                # get account_id's of all users of the project
                @get_project_data
                    project_id : opts.project_id
                    columns    : ['users']
                    cb         : (err, x) =>
                        if err
                            cb(err)
                        else
                            users = x.users
                            groups = {}
                            for account_id, x of users
                                g = groups[x.group]
                                if not g?
                                    groups[x.group] = [account_id]
                                else
                                    g.push(account_id)
                            cb()
            (cb) =>
                # get names of users
                @account_ids_to_usernames
                    account_ids : _.flatten((v for k,v of groups))
                    cb          : (err, names) =>
                        for group, v of groups
                            for i in [0...v.length]
                                account_id = v[i]
                                x = names[account_id]
                                v[i] = {account_id:account_id, first_name:x.first_name, last_name:x.last_name}
                        cb(err)
        ], (err) => opts.cb(err, groups))

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30s (per project).  In particular,
    # once called, it ignores subsequent calls for the same project for 30s.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        if not @_touch_project_cache?
            @_touch_project_cache = {}
        tm = @_touch_project_cache[opts.project_id]
        if tm? and misc.walltime(tm) < 30
            opts.cb?()
            return
        @_touch_project_cache[opts.project_id] = misc.walltime()
        now = new Date()
        @table('projects').get(opts.project_id).update(last_edited:now).run((err) => opts.cb?(err))

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required
        start = new Date(new Date() - opts.max_age_s*1000)
        @table('projects').between(start, new Date(), {index:'last_edited'}).pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (z.project_id for z in x))

    undelete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).update(deleted:false).run(opts.cb)

    delete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).update(deleted:true).run(opts.cb)

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = {hide:true}
        @table('projects').get(opts.project_id).update(users : x).run(opts.cb)

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = {hide:false}
        @table('projects').get(opts.project_id).update(users : x).run(opts.cb)

    # cb(err, true if user is in one of the groups for the project)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required
            groups      : required  # array of elts of PROJECT_GROUPS above
            cb          : required  # cb(err)
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id)('users')(opts.account_id)('group').run (err, group) =>
            opts.cb(err, group in opts.groups)

    # all id's of projects having anything to do with the given account (ignores
    # hidden projects unless opts.hidden is true).
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_opts(opts) then return
        @table('projects').getAll(opts.account_id, index:'users').pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (y.project_id for y in x))

    # Gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets columns data about them, not just id's
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            columns          : PROJECT_COLUMNS
            hidden           : false      # if true, get *ONLY* hidden projects; if false, don't include hidden projects
            cb               : required
        if not @_validate_opts(opts) then return
        @table('projects').getAll(opts.account_id, index:'users').filter((project)=>
            project("users")(opts.account_id)('hide').default(false).eq(opts.hidden)).pluck(opts.columns).run(opts.cb)

    # Get all projects with the given id's.  Note that missing projects are
    # ignored (not an error).
    get_projects_with_ids: (opts) =>
        opts = defaults opts,
            ids     : required   # an array of id's
            columns : PROJECT_COLUMNS
            cb      : required
        if not @_validate_opts(opts) then return
        if opts.ids.length == 0
            opts.cb(undefined, [])
        else
            @table('projects').getAll(opts.ids...).pluck(opts.columns).run(opts.cb)

    # Get titles of all projects with the given id's.  Note that missing projects are
    # ignored (not an error).
    get_project_titles: (opts) =>
        opts = defaults opts,
            ids          : required
            use_cache    : true         # TODO: when we use changefeeds, this will no longer be needed!
            cache_time_s : 15*60        # 15 minutes
            cb           : required     # cb(err, map from project_id to string (project title))
        if not @_validate_opts(opts) then return
        titles = {}
        for project_id in opts.ids
            titles[project_id] = false
        if opts.use_cache
            if not @_project_title_cache?
                @_project_title_cache = {}
            for project_id, done of titles
                if not done and @_project_title_cache[project_id]?
                    titles[project_id] = @_project_title_cache[project_id]

        @get_projects_with_ids
            ids     : (project_id for project_id,done of titles when not done)
            columns : ['project_id', 'title']
            cb      : (err, results) =>
                if err
                    opts.cb(err)
                else
                    # use a closure so that the cache clear timeout below works
                    # with the correct project_id!
                    f = (project_id, title) =>
                        titles[project_id] = title
                        @_project_title_cache[project_id] = title
                        setTimeout((()=>delete @_project_title_cache[project_id]),
                                   1000*opts.cache_time_s)
                    for x in results
                        f(x.project_id, x.title)
                    opts.cb(undefined, titles)

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    # TODO: add something about invited users too and show them in UI!
    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck('users').run (err, x) =>
            opts.cb(err, if x?.users? then (id for id,v of x.users when v.group?.indexOf('invite') == -1) else [])

    ###
    # Compute servers / projects
    ###
    # NOTE: here's how to watch for a project to move:
    #    db.table('projects').get('952ea92f-b12d-48f7-b65d-d12bb0c2fbf8').changes().filter(db.r.row('new_val')('host').ne(db.r.row('old_val')('host'))).run((e,c)->c.each(console.log))
    #
    set_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        assigned = new Date()
        @table('projects').get(opts.project_id).update(
            host:{host:opts.host, assigned:assigned}).run((err)=>opts.cb(err, assigned))

    get_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('host').run (err, x) =>
            opts.cb(err, if x then x.host)

    get_project_quotas: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('settings').run (err, x) =>
            if err
                opts.cb(err); return
            settings = x.settings
            if not settings?
                opts.cb(undefined, misc.copy(DEFAULT_QUOTAS))
            else
                quotas = {}
                for k, v of DEFAULT_QUOTAS
                    quotas[k] = if not settings[k]? then v else settings[k]
                opts.cb(undefined, quotas)

    set_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            settings   : required   # can be any subset of the map
            cb         : required
        @table('projects').get(opts.project_id).update(settings:opts.settings).run(opts.cb)

    #############
    # File editing activity -- users modifying files in any way
    #   - one single table called file_activity with numerous indexes
    #   - table also records info about whether or not activity has been seen by users
    ############
    _file_use_path_id: (project_id, path) -> misc_node.sha1("#{project_id}#{path}")

    record_file_use: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            account_id : required
            action     : required  # 'edit', 'read', 'seen', etc.?
            cb         : required
        now = new Date()
        y = {}; y[opts.action] = now
        x = {}; x[opts.account_id] = y
        entry =
            id         : @_file_use_path_id(opts.project_id, opts.path)
            project_id : opts.project_id
            path       : opts.path
            use        : x
        if opts.action == 'edit'
            entry.last_edited = now
        @table('file_use').insert(entry, conflict:'update').run(opts.cb)

    get_file_use: (opts) =>
        opts = defaults opts,
            max_age_s   : required
            project_id  : undefined    # don't specify both project_id and project_ids
            project_ids : undefined
            path        : undefined    # if given, project_id must be given
            cb          : required     # entry if path given; otherwise, an array
        cutoff = new Date(new Date() - opts.max_age_s*1000)
        if opts.path?
            if not opts.project_id?
                opts.cb("if path is given project_id must also be given")
                return
            @table('file_use').between([opts.project_id, opts.path, cutoff],
                               [opts.project_id, opts.path, new Date()], index:'project_id-path-last_edited').orderBy('last_edited').run((err,x)=>opts.cb(err, if x then x[0]))
        else if opts.project_id?
            @table('file_use').between([opts.project_id, cutoff],
                               [opts.project_id, new Date()], index:'project_id-last_edited').orderBy('last_edited').run(opts.cb)
        else if opts.project_ids?
            ans = []
            f = (project_id, cb) =>
                @get_file_use
                    max_age_s  : opts.max_age_s
                    project_id : project_id
                    cb         : (err, x) =>
                        cb(err, if not err then ans = ans.concat(x))
            async.map(opts.project_ids, f, (err)=>opts.cb(err,ans))
        else
            @table('file_use').between(cutoff, new Date(), index:'last_edited').orderBy('last_edited').run(opts.cb)

    #############
    # File editing activity -- users modifying files in any way
    #   - one single table called file_activity with numerous indexes
    #   - table also records info about whether or not activity has been seen by users
    ############
    record_file_activity: (opts) =>
        opts = defaults opts,
            account_id : required
            project_id : required
            path       : required
            action     : required
            cb         : undefined
        @table('file_activity').insert({
            account_id: opts.account_id, project_id: opts.project_id,
            path: opts.path, action:opts.action, timestamp:new Date(),
            seen_by:[], read_by:[]}).run((err)=>opts.cb?(err))

    mark_file_activity: (opts) =>
        opts = defaults opts,
            id         : required
            account_id : required
            mark       : required    # 'seen' or 'read'
            cb         : required
        if opts.mark not in ['seen', 'read']
            opts.cb("mark must be 'seen' or 'read'")
            return
        x = {}; k = "#{opts.mark}_by"
        x[k] = @r.row(k).default([]).setInsert(opts.account_id)
        @table('file_activity').get(opts.id).update(x).run(opts.cb)

    ###
    get_recent_file_activity0: (opts) =>
        opts = defaults opts,
            max_age_s   : required
            project_ids : undefined
            cb          : required
        cutoff = new Date(new Date() - opts.max_age_s*1000)
        if not opts.project_ids?
            @table('file_activity').between(cutoff, new Date(), index:'timestamp').run(opts.cb)
        else
            @table('file_activity').getAll(opts.project_ids..., index:'project_id').filter(
                @r.row('timestamp').gt(cutoff)).run(opts.cb)
    ###

    get_recent_file_activity: (opts) =>
        opts = defaults opts,
            max_age_s   : required
            project_id  : undefined    # don't specify both project_id and project_ids
            project_ids : undefined
            path        : undefined    # if given, project_id must be given
            cb          : required
        cutoff = new Date(new Date() - opts.max_age_s*1000)
        if opts.path?
            if not opts.project_id?
                opts.cb("if path is given project_id must also be given")
                return
            @table('file_activity').between([opts.project_id, opts.path, cutoff],
                               [opts.project_id, opts.path, new Date()], index:'project_id-path-timestamp').orderBy('timestamp').run(opts.cb)
        else if opts.project_id?
            @table('file_activity').between([opts.project_id, cutoff],
                               [opts.project_id, new Date()], index:'project_id-timestamp').orderBy('timestamp').run(opts.cb)
        else if opts.project_ids?
            ans = []
            f = (project_id, cb) =>
                @get_recent_file_activity
                    max_age_s  : opts.max_age_s
                    project_id : project_id
                    cb         : (err, x) =>
                        cb(err, if not err then ans = ans.concat(x))
            async.map(opts.project_ids, f, (err)=>opts.cb(err,ans))
        else
            @table('file_activity').between(cutoff, new Date(), index:'timestamp').orderBy('timestamp').run(opts.cb)

    ###
    # STATS
    ###

    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute new one and store
    # in cache for ttl seconds.
    # CONCERN: This could take around 15 seconds, and numerous hubs could all initiate it
    # at once, which is a waste.
    num_recent_projects: (opts) =>
        opts = defaults opts,
            age_m : required
            cb    : required
        @table('projects').between(new Date(new Date() - opts.age_m*60*1000), new Date(),
                                      {index:'last_edited'}).count().run(opts.cb)

    get_stats: (opts) =>
        opts = defaults opts,
            ttl : 60  # how long cached version lives (in seconds)
            cb  : required
        stats = undefined
        async.series([
            (cb) =>
                @table('stats').between(new Date(new Date() - 1000*opts.ttl), new Date(),
                                           {index:'timestamp'}).orderBy('timestamp').run (err, x) =>
                    if x?.length then stats=x[x.length - 1]
                    cb(err)
            (cb) =>
                if stats?
                    cb(); return
                stats = {timestamp:new Date()}
                async.parallel([
                    (cb) =>
                        @table('accounts').count().run((err, x) => stats.accounts = x; cb(err))
                    (cb) =>
                        @table('projects').count().run((err, x) => stats.projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 5, cb : (err, x) => stats.active_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24, cb : (err, x) => stats.last_day_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24*7, cb : (err, x) => stats.last_week_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24*30, cb : (err, x) => stats.last_month_projects = x; cb(err))
                    (cb) =>
                        @table("hub_servers").run (err, hub_servers) =>
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
                ], cb)
            (cb) =>
                @table('stats').insert(stats).run(cb)
        ], (err) => opts.cb(err, stats))

    ###
    # Hub servers
    ###
    register_hub: (opts) =>
        opts = defaults opts,
            host    : required
            port    : required
            clients : required
            ttl     : required
            cb      : required
        @table('hub_servers').insert({
            host:opts.host, port:opts.port, clients:opts.clients, expire:expire_time(opts.ttl)
            }, conflict:"replace").run(opts.cb)

    get_hub_servers: (opts) =>
        opts = defaults opts,
            cb   : required
        @table('hub_servers').run (err, v) =>
            if err
                opts.cb(err)
            else
                w = []
                to_delete = []
                for x in v
                    if x.expire and x.expire <= new Date()
                        to_delete.push(x.host)
                    else
                        w.push(x)
                if to_delete.length > 0
                    @table('hub_servers').getAll(to_delete...).delete().run (err) =>
                        if err
                            opts.cb(err)
                        else
                            opts.cb(undefined, w)
                else
                    opts.cb(undefined, w)
    ###
    # Compute servers
    ###
    save_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : required
            port         : required
            secret       : required
            experimental : false
            cb           : required
        x = misc.copy(opts); delete x['cb']
        @table('compute_servers').insert(x, conflict:'update').run(opts.cb)

    get_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            cb           : required
        @table('compute_servers').get(opts.host).run(opts.cb)

    get_all_compute_servers: (opts) =>
        opts = defaults opts,
            cb           : required
        @table('compute_servers').run(opts.cb)

    get_projects_on_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # hostname of the compute server
            columns        : ['project_id']
            cb             : required
        @table('projects').getAll(opts.compute_server, index:'compute_server').pluck(opts.columns).run(opts.cb)

    set_project_compute_server: (opts) =>
        opts = defaults opts,
            project_id     : required
            compute_server : required   # hostname of the compute server
            cb             : required
        @table('projects').get(opts.project_id).update(
            compute_server:opts.compute_server).run(opts.cb)

    ###
    # BLOB store.  Fields:
    #     id     = uuid from sha1(blob)
    #     blob   = the actual blob
    #     expire = time when object expires
    ###
    save_blob: (opts) =>
        opts = defaults opts,
            uuid : required  # uuid=sha1-based uuid coming from blob
            blob : required  # we assume misc_node.uuidsha1(opts.blob) == opts.uuid; blob should be a string or Buffer
            ttl  : 0         # object in blobstore will have *at least* this ttl in seconds;
                             # if there is already something in blobstore with longer ttl, we leave it;
                             # infinite ttl = 0 or undefined.
            cb    : required  # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        @table('blobs').get(opts.uuid).pluck('expire').run (err, x) =>
            if err
                # blob not already saved
                @table('blobs').insert({id:opts.uuid, blob:opts.blob, expire:expire_time(opts.ttl)}).run (err) =>
                    opts.cb(err, opts.ttl)
            else
                # the blob was already saved
                new_expire = undefined
                if not x.expire
                    # ttl already infinite -- nothing to do
                    ttl = 0
                else
                    if opts.ttl
                        # saved ttl is finite as is requested one; change in db if requested is longer
                        z = expire_time(opts.ttl)
                        if z > x.expire
                            new_expire = z
                            ttl = opts.ttl
                        else
                            ttl = (x.expire - new Date())/1000.0
                    else
                        # saved ttl is finite but requested one is infinite
                        ttl = 0
                        new_expire = 0
                if new_expire?
                    query = @table('blobs').get(opts.uuid)
                    if new_expire == 0
                        query = query.replace(@r.row.without(expire:true))
                    else
                        query = query.update(expire:new_expire)
                    query.run((err) => opts.cb(err, ttl))
                else
                    opts.cb(undefined, ttl)

    get_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : required
        @table('blobs').get(opts.uuid).run (err, x) =>
            if err
                opts.cb(err)
            else
                if not x
                    opts.cb(undefined, undefined)
                else if x.expire and x.expire <= new Date()
                    opts.cb(undefined, undefined)   # no such blob anymore
                    @table('blobs').get(opts.uuid).delete().run()   # delete it
                else
                    opts.cb(undefined, x.blob)

    remove_blob_ttls: (opts) =>
        opts = defaults opts,
            uuids : required   # uuid=sha1-based from blob
            cb    : required   # cb(err)
        @table('blobs').getAll(opts.uuids...).replace(
            @r.row.without(expire:true)).run(opts.cb)

    user_query: (opts) =>
        opts = defaults opts,
            account_id : required
            query      : required
            options    : {}
            cb         : required   # cb(err, result)

        if misc.is_array(opts.query)
            # array of queries
            result = []
            f = (query, cb) =>
                @user_query
                    account_id : opts.account_id
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        result.push(x); cb(err)
            async.mapSeries(opts.query, f, (err) => opts.cb(err, result))
            return

        # individual query
        result = {}
        f = (table, cb) =>
            query = opts.query[table]
            if misc.is_array(query)
                if query.length > 1
                    cb("array of length > 1 not yet implemented")
                    return
                multi = true
                query = query[0]
            else
                multi = false
            if typeof(query) == "object"
                for k, v of query
                    if v == null
                        @user_get_query
                            account_id : opts.account_id
                            table      : table
                            query      : query
                            options    : opts.options
                            multi      : multi
                            cb         : (err, x) =>
                                result[table] = x; cb(err)
                        return
                @user_set_query
                    account_id : opts.account_id
                    table      : table
                    query      : query
                    cb         : (err, x) =>
                        result[table] = x; cb(err)
            else
                cb("invalid query -- value must be object")
        async.map(misc.keys(opts.query), f, (err) => opts.cb(err, result))

    _query_is_cmp: (obj) =>
        for k, _ of obj
            if k in ['==', '!=', '>=', '<=', '>', '<']
                return true
        return false

    _query_cmp: (filter, x, q) =>
        for op, val of q
            switch op
                when '=='
                    x = x.eq(val)
                when '!='
                    x = x.ne(val)
                when '>='
                    x = x.ge(val)
                when '>'
                    x = x.gt(val)
                when '<'
                    x = x.lt(val)
                when '<='
                    x = x.le(val)
            if filter?
                filter = filter.and(x)
            else
                filter = x
        return filter

    _query_descend: (filter, x, q) =>
        for k, v of q
            if v != null
                if typeof(v) != 'object'
                    v = {'==':v}
                if misc.len(v) == 0
                    continue
                row = x(k)
                if @_query_is_cmp(v)
                    filter = @_query_cmp(filter, row, v)
                else
                    filter = @_query_descend(filter, row, v)
        return filter

    _query_to_filter: (query) =>
        filter = undefined
        for k, v of query
            if v != null
                if typeof(v) != 'object'
                    v = {'==':v}
                if misc.len(v) == 0
                    continue
                row = @r.row(k)
                if @_query_is_cmp(v)
                    filter = @_query_cmp(filter, row, v)
                else
                    filter = @_query_descend(filter, row, v)

        return filter

    _query_to_field_selector: (query) =>
        selector = {}
        for k, v of query
            if v == null or typeof(v) != 'object'
                selector[k] = true
            else
                sub = true
                for a, _ of v
                    if a in ['==', '!=', '>=', '>', '<', '<=']
                        selector[k] = true
                        sub = false
                        break
                if sub
                    selector[k] = @_query_to_field_selector(v)
        return selector

    _query_get: (table, query, account_id) =>
        x = {}
        switch table
            when 'server_settings', 'central_log', 'client_error_log'
                x.require_admin = true
            when 'accounts'
                x.get_all = [account_id]
            when 'stats'
                if query.timestamp != null
                    # TODO
                    x.error = "TODO -- timestamp range query"
            when 'blobs'
                if query.uuid
                    x.get_all = [query.uuid]
                else
                    x.error = "must specify uuid"
            when 'file_use', 'projects', 'file_access_log'
                if query.project_id? and query.project_id != null
                    single = false
                    if typeof(query.project_id) == 'object'
                        for k, v of query.project_id
                            if k == '=='
                                query.project_id = v
                                single = true
                                break
                    if single
                        x.get_all = x.require_project_ids_read_access = [query.project_id]
                    else
                        x.get_all = 'all_projects'
                else
                    x.get_all = 'all_projects'
            else
                x.error = "unknown table '#{table}'"
        return x

    _require_is_admin: (account_id, cb) =>
        @table('accounts').get(account_id).pluck('groups').run (err, x) =>
            if err
                cb(err)
            else
                if not x?.groups? or 'admin' not in x.groups
                    cb("user must be an admin")
                else
                    cb()

    _require_project_ids_in_groups: (account_id, project_ids, groups, cb) =>
        s = {}; s[account_id] = true
        require_admin = false
        console.log("s=", s)
        @table('projects').getAll(project_ids...).pluck(users:s).run (err, x) =>
            console.log("x=", x)
            if err
                cb(err)
            else
                for p in x
                    if p.users[account_id].group not in groups
                        require_admin = true
                if require_admin
                    @_require_is_admin(account_id, cb)
                else
                    cb()

    _query_parse_options: (db_query, options) =>
        limit = err = undefined
        for x in options
            for name, value of x
                switch name
                    when 'limit'
                        db_query = db_query.limit(value)
                        limit = value
                    when 'slice'
                        db_query = db_query.slice(value...)
                    when 'order_by'
                        # TODO: could optimize with an index
                        db_query = db_query.orderBy(value)
                    else
                        err:"unknown option '#{name}'"
        return {db_query:db_query, err:err, limit:limit}

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : required
            table      : required
            query      : required
            multi      : required
            options    : required
            cb         : required   # cb(err, result)
        results = undefined
        {require_admin, get_all, require_project_read_access, err} = @_query_get(opts.table, opts.query, opts.account_id)
        if err
            cb(err); return
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        if require_admin
                            @_require_is_admin(opts.account_id, cb)
                        else
                            cb()
                    (cb) =>
                        if require_project_ids_read_access?
                            @_require_project_ids_in_groups(opts.account_id, require_project_ids_read_access,\
                                             ['owner', 'collaborator', 'viewer'], cb)
                        else
                            cb()
                    (cb) =>
                        if get_all == 'all_projects'
                            @get_project_ids_with_user
                                account_id : opts.account_id
                                cb         : (err, x) =>
                                    if err
                                        cb(err)
                                    else
                                        get_all = x.concat(index:'project_id')
                                        cb()
                        else
                            cb()
                ], cb)
            (cb) =>
                db_query = @table(opts.table)
                if get_all?
                    db_query = db_query.getAll(get_all...)
                filter = @_query_to_filter(opts.query)
                if filter?
                    db_query = db_query.filter(filter)
                db_query = db_query.pluck(@_query_to_field_selector(opts.query))
                if not opts.multi
                    db_query = db_query.limit(1)
                {db_query, limit, err} = @_query_parse_options(db_query, opts.options)
                if err
                    cb(err); return
                db_query.run (err, x) =>
                    if err
                        cb(err)
                    else
                        if not opts.multi
                            results = x[0]
                        else
                            results = x
                            if limit and results.length == limit
                                results.push('...')
                        cb()
        ], (err) =>
            if err?.message?
                err = err.message
            opts.cb(err, results)
        )

    user_set_query: (opts) =>
        opts = defaults opts,
            account_id : required
            table      : required
            query      : required
            cb         : required   # cb(err)
        query = misc.copy(opts.query)
        table = opts.table
        account_id = opts.account_id
        switch table
            when 'accounts'
                query.account_id = account_id   # ensure can only change own account
            when 'projects'
                if not query.project_id?
                    opts.cb("must specify the project id")
                    return
                require_project_ids_write_access = [query.project_id]
            when 'server_settings'
                require_admin = true
            else
                opts.cb("not allowed to write to table '#{table}'")
                return

        t = TABLES[table]
        primary_key = t.options?.primaryKey
        if not primary_key?
            primary_key = 'id'
        for k, v of query
            if primary_key == k
                continue
            if t.user_set?[k]
                continue
            if t.admin_set?[k]
                require_admin = true
                continue
            opts.cb("changing #{table}.#{k} not allowed")
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
                            @_require_project_ids_in_groups(account_id, require_project_ids_write_access,\
                                             ['owner', 'collaborator'], cb)
                        else
                            cb()
                ], cb)
            (cb) =>
                @table(table).insert(query, conflict:'update').run(cb)
        ], opts.cb)

exports.rethinkdb = (opts) -> new RethinkDB(opts)