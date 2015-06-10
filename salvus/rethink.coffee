# TODO: client api -- get rid of any reference to consistency and objectify


async = require('async')
_ = require('underscore')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

{defaults} = misc = require('misc')
required = defaults.required

###
# Schema
#   keys are the table names
#   values describe the indexes
###
TABLES =
    accounts    :
        email_address : []
        passports     : [{multi: true}]
    central_log :
        time  : []
        event : []
    file_access_log :
        timestamp : []
    key_value   : false
    projects    : {}
    remember_me :
        expire     : []
        account_id : []

# these fields are arrays of account id's, which
# we need indexed:
for group in misc.PROJECT_GROUPS
    TABLES.projects[group] = [{multi:true}]

PROJECT_GROUPS = misc.PROJECT_GROUPS

PROJECT_COLUMNS = exports.PROJECT_COLUMNS = ['project_id', 'account_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted', 'hide_from_accounts'].concat(PROJECT_GROUPS)

exports.PUBLIC_PROJECT_COLUMNS = ['project_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted']

# convert a ttl in seconds to an expiration time
expire_time = (ttl) -> new Date((new Date() - 0) + ttl*1000)

class UUIDStore
    set: (opts) ->
        opts = defaults opts,
            uuid        : undefined
            value       : undefined
            ttl         : 0
            cb          : undefined
        if not opts.uuid?
            opts.uuid = uuid.v4()
        else
            if not misc.is_valid_uuid_string(opts.uuid)
                throw "invalid uuid #{opts.uuid}"
        # TODO

    # returns 0 if there is no ttl set; undefined if no object in table
    get_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : required
        # TODO

    # change the ttl of an existing entry -- requires re-insertion, which wastes network bandwidth...
    _set_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            ttl  : 0         # no ttl
            cb   : undefined
        # TODO

    # Set ttls for all given uuids at once; expensive if needs to change ttl, but cheap otherwise.
    set_ttls: (opts) =>
        opts = defaults opts,
            uuids : required    # array of strings/uuids
            ttl   : 0
            cb    : undefined
        if opts.uuids.length == 0
            opts.cb?()
            return
        # TODO

    # Set ttl only for one ttl; expensive if needs to change ttl, but cheap otherwise.
    set_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            ttl  : 0         # no ttl
            cb   : undefined
        @set_ttls
            uuids : [opts.uuid]
            ttl   : opts.ttl
            cb    : opts.cb


    get: (opts) ->
        opts = defaults opts,
            uuid        : required
            cb          : required
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb("invalid uuid #{opts.uuid}")
        # TODO

    delete: (opts) ->
        opts = defaults opts,
            uuid : required
            cb   : undefined
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("invalid uuid #{opts.uuid}")
        # TODO

    delete_all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        # TODO

    length: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        # TODO

    all: (opts={}) ->
        opts = defaults(opts,  cb:required)
        # TODO

class UUIDValueStore extends UUIDStore
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts,  name:required)
        # TODO

class UUIDBlobStore extends UUIDStore
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts, name:required)
        #TODO

class KeyValueStore
    constructor: (@db, opts={}) ->
        @opts = defaults(opts, name:required)
        @table = @db.table("key_value")

    set: (opts={}) =>
        opts = defaults opts,
            key         : required
            value       : required
            cb          : undefined
        # TODO: make a composite index so this stays fast
        @table.filter(name:@opts.name, key:opts.key).run (err, r) =>
            if err
                cb(err); return
            if r.length == 0
                @table.insert({name: @opts.name, key:opts.key, value:opts.value}).run((err)=>opts.cb?(err))
            else
                @table.update({id:r[0].id, name: @opts.name, key:opts.key, value:opts.value}).run((err)=>opts.cb?(err))

    get: (opts={}) =>
        opts = defaults opts,
            key         : undefined
            cb          : required   # cb(error, value)
        # TODO: make a composite index so this stays fast
        @table.filter(name:@opts.name, key:opts.key).run (err, r) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, r[0]?.value)

    delete: (opts={}) ->
        opts = defaults(opts, key:undefined, cb:undefined)
        # TODO

    delete_all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        # TODO

    length: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        # TODO

    all: (opts={}) =>
        opts = defaults(opts,  cb:undefined)
        # TODO

class RethinkDB
    constructor : (opts={}) ->
        opts = defaults opts,
            hosts    : ['localhost'] # TODO -- use this
            password : undefined   # TODO
            database : 'smc'
        @r = require('rethinkdbdash')()
        @_database = opts.database
        @db = @r.db(@_database)

    table: (name) => @db.table(name)

    dbg: (f) =>
        return (m) => winston.debug("RethinkDB.#{f}: #{m}")

    update_schema: (opts={}) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("create_schema")
        async.series([
            (cb) =>
                dbg("get list of known db's")
                @r.dbList().run (err, x) =>
                    if err or @_database in x
                        cb(err)
                    dbg("create db")
                    @r.dbCreate('smc').run(cb)
            (cb) =>
                @db.tableList().run (err, x) =>
                    if err
                        cb(err)
                    tables = (t for t in misc.keys(TABLES) when t not in x)
                    dbg("create #{tables.length} tables")
                    async.map(tables, ((table, cb) => @db.tableCreate(table).run(cb)), cb)
            (cb) =>
                f = (name, cb) =>
                    indexes = misc.copy(TABLES[name])
                    if not indexes
                        cb(); return
                    table = @table(name)
                    create = (n, cb) =>
                        table.indexCreate(n, indexes[n]...).run(cb)
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
        ], (err) => cb?(err))

    ###
    # Various types of key:value stores
    ###
    key_value_store: (opts={}) => # key_value_store(name:"the name")
        new KeyValueStore(@db, opts)

    uuid_value_store: (opts={}) => # uuid_value_store(name:"the name")
        new UUIDValueStore(@, opts)

    # CLIENT TODO: blobs are just values -- no point in making this different?
    uuid_blob_store: (opts={}) => # uuid_blob_store(name:"the name")
        new UUIDBlobStore(@, opts)

    ###
    # Table for loging things that happen
    ###
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object (will be JSON'd)
            cb    : undefined
        @db.table('central_log').insert({event:opts.event, value:opts.value, time:new Date()}).run((err)=>opts.cb?(err))

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
            cb    : required
        query = @db.table('central_log')
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'time'})
        if opts.event?  # restrict to only the given event
            query = query.filter(@r.row("event").eq(opts.event))
        query.run(opts.cb)

    ###
    # Account creation, deletion, existence
    ###
    create_account: (opts={}) ->
        opts = defaults opts,
            first_name        : required
            last_name         : required

            email_address     : undefined
            password_hash     : undefined

            passport_strategy : undefined
            passport_id       : undefined
            passport_profile  : undefined
            cb                : required

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
                @table('accounts').insert(account).run (err, x) =>
                    if err
                        cb(err)
                    else
                        account_id = x.generated_keys[0]
                        cb()
            (cb) =>
                dbg("add 1 to the 'number of accounts' counter")
                @update_table_counter
                    table : 'accounts'
                    delta : 1
                    cb    : cb
        ], (err) =>
            if err
                dbg("error creating account -- #{err}")
                opts.cb(err)
            else
                dbg("successfully created account")
                opts.cb(false, account_id)
        )

    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_uuids(opts) then return
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
            action        : undefined   # if given, adds this action; if not given cb(err, [array of actions])
            ttl           : undefined
            cb            : required
        # TODO: stub
        opts.cb()

    ###
    # Querying for search-ish information about accounts
    ###

    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_uuids(opts) then return
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(false, [])
            return
        @table('accounts').getAll(opts.account_ids...).pluck("first_name", "last_name", "id").run (err, x) =>
            if err
                opts.cb?(err)
            else
                v = misc.dict(([r.id, {first_name:r.first_name, last_name:r.last_name}] for r in x))
                # fill in unknown users (should never be hit...)
                for id in opts.account_ids
                    if not v[id]
                        v[id] = {first_name:undefined, last_name:undefined}
                opts.cb(err, v)

    # TODO: change to get_usernames... both here and in CLIENT code.
    get_user_names: (opts) =>
        opts = defaults opts,
            account_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from account_id to object (user name))
        if not @_validate_uuids(opts) then return
        user_names = {}
        for account_id in opts.account_ids
            user_names[account_id] = false
        if opts.use_cache
            if not @_account_user_name_cache?
                @_account_user_name_cache = {}
            for account_id, done of user_names
                if not done and @_account_user_name_cache[account_id]?
                    user_names[account_id] = @_account_user_name_cache[account_id]
        @account_ids_to_usernames
            account_ids : (account_id for account_id,done of user_names when not done)
            cb          : (err, results) =>
                if err
                    opts.cb(err)
                else
                    # use a closure so that the cache clear timeout below works
                    # with the correct account_id!
                    f = (account_id, user_name) =>
                        user_names[account_id] = user_name
                        @_account_user_name_cache[account_id] = user_name
                        setTimeout((()=>delete @_account_user_name_cache[account_id]),
                                   1000*opts.cache_time_s)
                    for account_id, user_name of results
                        f(account_id, user_name)
                    opts.cb(undefined, user_names)


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
    # CLIENT-TODO: account_id column changed to id!
    all_users: (cb) =>
        if @_all_users_fresh?
            cb(false, @_all_users); return
        if @_all_users?
            cb(false, @_all_users)
        if @_all_users_computing? and @_all_users?
            return
        @_all_users_computing = true
        @table('accounts').pluck("first_name", "last_name", "id").run (err, results) =>
            if err and not @_all_users?
                cb?(err); return
            v = []
            for r in results
                if not r.first_name?
                    r.first_name = ''
                if not r.last_name?
                    r.last_name = ''
                search = (r.first_name + ' ' + r.last_name).toLowerCase()
                obj = {id : r.id, first_name:r.first_name, last_name:r.last_name, search:search}
                v.push(obj)
            delete @_all_users_computing
            if not @_all_users?
                cb(false, v)
            @_all_users = v
            @_all_users_fresh = true
            f = () =>
                delete @_all_users_fresh
            setTimeout(f, 5*60000)   # cache for 5 minutes

    # CLIENT-TODO: account_id column changed to id!
    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : undefined    # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.

        {string_queries, email_queries} = misc.parse_user_search(opts.query)
        results = []
        async.parallel([
            (cb) =>
                if email_queries.length == 0
                    cb(); return
                # do email queries -- with exactly two targeted db queries (even if there are hundreds of addresses)
                @table('accounts').getAll(email_queries..., {index:'email_address'}).pluck('id', 'first_name', 'last_name', 'email_address').run (err, r) =>
                    if err
                        cb(err)
                    else
                        results.push(r...)
                        cb()
            (cb) =>
                # do all string queries
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
            return query.get(opts.account_id)
        else if opts.email_address?
            return query.getAll(opts.email_address, {index:'email_address'})
        else
            throw "_account: opts must have account_id or email_address field"

    # CLIENT-TODO: account_id column changed to id!
    get_account: (opts={}) =>
        opts = defaults opts,
            cb            : required
            email_address : undefined     # provide either email or account_id (not both)
            account_id    : undefined
            columns       : ['id', 'password_hash',
                             'first_name', 'last_name', 'email_address',
                             'default_system', 'evaluate_key',
                             'email_new_features', 'email_maintenance', 'enable_tooltips',
                             'autosave', 'terminal', 'editor_settings', 'other_settings',
                             'groups', 'passports',
                             'password_is_set'  # set in the answer to true or false, depending on whether a password is set at all.
                            ]
        if not @_validate_uuids(opts) then return
        @_account(opts).pluck(opts.columns...).run(opts.cb)

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)
        if not @_validate_uuids(opts) then return
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
        if not @_validate_uuids(opts) then return
        @_account(opts).update(banned:true).run(opts.cb)


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
        k = @_passport_key(opts)
        obj = {}; obj[k] = opts.profile
        @_account(opts).update(passport_profiles:obj, passports:@r.row("passports").default([]).append(k)).run(opts.cb)

    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : undefined   # if given, must match what is on file for the strategy
            strategy   : required
            id         : required
            cb         : required
        @_account(opts).update(passports:@r.row("passports").default([]).without(@_passport_key(opts))).run(opts.cb)

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        @table('accounts').getAll(@_passport_key(opts), {index:'passports'}).count().run (err, n) =>
            opts.cb(err, n>0)

    ###
    # Account settings
    ###
    update_account_settings: (opts={}) ->
        opts = defaults opts,
            account_id : required
            settings   : required
            cb         : required
        if opts.settings.email_address?
            email_address = opts.settings.email_address
            delete opts.settings.email_address
        if not @_validate_uuids(opts) then return
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
                @_account(opts).update(settings:opts.settings).run(cb)
        ], opts.cb)

    ###
    # Login-related functions
    ###

    # Save remember me info in the database
    save_remember_me: (opts) =>
        opts = defaults opts,
            account_id : required
            hash       : required
            value      : required
            ttl        : required
            cb         : required
        if not @_validate_uuids(opts) then return
        @table('remember_me').insert(id:opts.hash, value:opts.value, expires:expire_time(opts.ttl), account_id:opts.account_id).run(opts.cb)

    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id    : required
            cb            : required
        @table('remember_me').getAll(opts.account_id, {index:'account_id'}).delete().run(opts.cb)

    # Change the password for the given account.
    change_password: (opts={}) =>
        opts = defaults opts,
            account_id             : required
            password_hash          : required
            invalidate_remember_me : true
            cb                     : required
        if not @_validate_uuids(opts) then return
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
        if not @_validate_uuids(opts) then return
        @account_exists
            email_address : opts.email_address
            cb            : (err, exists) =>
                if err
                    opts.cb(err)
                else if exists
                    opts.cb("email_already_taken")
                else
                    @_account(account_id:opts.account_id).update(email_address:opts.email_address).run(opts.cb)

    #############
    # Tracking file access
    ############
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_uuids(opts) then return
        entry =
            project_id : opts.project_id
            account_id : opts.account_id
            filename   : opts.filename
            timestamp  : new Date()
        @table('file_access_log').insert(entry).run((err)=>opts.cb?(err))

    # Get all files accessed in all projects in given time range
    # TODO-CLIENT: api change! (shouldn't be too bad, since was never implemented before)
    get_file_access: (opts) =>
        opts = defaults opts,
            start  : undefined   # start timestamp
            end    : undefined   # end timestamp
            cb     : required
        query = @db.table('file_access_log')
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'timestamp'})
        query.run(opts.cb)

    #############
    # Projects
    ############
    # TODO-CLIENT: api change -- we now generate and return the project_id, rather than passing it in; this is the same as create_account. also, removed public option, since there is no such thing as a public project.
    create_project: (opts) =>
        opts = defaults opts,
            account_id  : required  # owner
            title       : undefined
            description : undefined
            cb          : required    # cb(err, project_id)
        if not @_validate_uuids(opts) then return
        project =
            title       : opts.title
            description : opts.description
            created     : new Date()
            last_edited : new Date()
            owner       : [opts.account_id]
        @db.table('projects').insert(project).run (err, x) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, x.id)


    get_project_data: (opts) =>
        opts = defaults opts,
            project_id  : required
            columns     : PROJECT_COLUMNS
            cb          : required
        if not @_validate_uuids(opts) then return
        @db.table('projects').get(opts.project_id).pluck(opts.columns...).run(opts.cb)

    # TODO: api change -- now it's a map path--> description rather than a
    # list of {path:?, description:?}
    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_uuids(opts) then return
        @db.table('projects').get(opts.project_id).pluck('public_paths').run (err, x) =>
            opts.cb(err, x?.public_paths)   # map {path:description}

    publish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            description : required
            cb          : required
        if not @_validate_uuids(opts) then return
        x = {}; x[opts.path] = opts.description
        @db.table('projects').get(opts.project_id).update(public_paths:x).run(opts.cb)

    unpublish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            cb          : required
        if not @_validate_uuids(opts) then return
        x = {}; x[opts.path] = true
        db.table('projects').get(opts.project_id).replace(@r.row.without(public_paths:x)).run(opts.cb)

    _validate_uuids: (opts) =>
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
        return true

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)
        if opts.group not in misc.PROJECT_GROUPS
            opts.cb("unknown project group '#{opts.group}'"); return
        if not @_validate_uuids(opts) then return
        x = {}
        x[opts.group] = @r.row(opts.group).default([]).setInsert(opts.account_id)
        @table('projects').get(opts.project_id).update(x).run(opts.cb)

    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)
        if opts.group not in misc.PROJECT_GROUPS
            opts.cb("unknown project group '#{opts.group}'"); return
        if not @_validate_uuids(opts) then return
        x = {}
        x[opts.group] = @r.row(opts.group).default([]).setDifference([opts.account_id])
        @table('projects').get(opts.project_id).update(x).run(opts.cb)

    get_project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            groups     : PROJECT_GROUPS
            cb         : required    # cb(err, {group:[{account_id:?,first_name:?,last_name:?}], ...})
        if not @_validate_uuids(opts) then return
        groups = undefined
        names  = undefined
        async.series([
            # get account_id's of all users
            (cb) =>
                @get_project_data
                    project_id : opts.project_id
                    columns    : opts.groups
                    cb         : (err, _groups) =>
                        if err
                            cb(err)
                        else
                            groups = _groups
                            for i in [0...groups.length]
                                if not groups[i]?
                                    groups[i] = []
                            cb()
            # get names of users
            (cb) =>
                @account_ids_to_usernames
                    account_ids : _.flatten((v for k,v of groups))
                    cb          : (err, _names) =>
                        names = _names
                        cb(err)
        ], (err) =>
            if err
                opts.cb(err)
            else
                for group, v of groups
                    for i in [0...v.length]
                        account_id = v[i]
                        x = names[account_id]
                        v[i] = {account_id:account_id, first_name:x.first_name, last_name:x.last_name}
                opts.cb(false, groups)
        )

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30 seconds (per project).  In particular,
    # once called, it ignores subsequent calls for the same project for 30 seconds.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            size       : undefined
            cb         : undefined
        if not @_validate_uuids(opts) then return

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required

    undelete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : undefined
        if not @_validate_uuids(opts) then return

    delete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : undefined
        if not @_validate_uuids(opts) then return

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : undefined
        if not @_validate_uuids(opts) then return

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : undefined
        if not @_validate_uuids(opts) then return


    # Make it so the user with given account id is listed as a(n invited) collaborator or viewer
    # on the given project.  This modifies a set collection on the project *and* modifies a
    # collection on that account.
    # There is no attempt to make sure a user is in only one group at a time -- client code must do that.
    _verify_project_user: (opts) =>
        # We have to check that is a uuid and use strings, rather than params, due to limitations of the
        # Helenus driver.  CQL injection...
        if not misc.is_valid_uuid_string(opts.project_id) or not misc.is_valid_uuid_string(opts.account_id)
            return "invalid uuid"
        else if opts.group not in PROJECT_GROUPS
            return "invalid group"
        else
            return null



    # cb(err, true if project is public)
    project_is_public: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required  # cb(err, is_public)
        if not @_validate_uuids(opts) then return

    # cb(err, true if user is in one of the groups)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required
            groups      : required  # array of elts of PROJECT_GROUPS above
            cb          : required  # cb(err)
        if not @_validate_uuids(opts) then return

    # all id's of projects having anything to do with the given account (ignores
    # hidden projects unless opts.hidden is true).
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            hidden     : false
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_uuids(opts) then return

    get_hidden_project_ids: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required    # cb(err, mapping with keys the project_ids and values true)
        if not @_validate_uuids(opts) then return

    # gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets all data about them, not just id's
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            collabs_as_names : true       # replace all account_id's of project collabs with their user names.
            hidden           : false      # if true, get *ONLY* hidden projects; if false, don't include hidden projects
            cb               : required
        if not @_validate_uuids(opts) then return

    get_projects_with_ids: (opts) =>
        opts = defaults opts,
            ids     : required   # an array of id's
            columns : PROJECT_COLUMNS
            cb      : required
        if not @_validate_uuids(opts) then return

    get_project_titles: (opts) =>
        opts = defaults opts,
            project_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from project_id to string (project title))
        if not @_validate_uuids(opts) then return

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_uuids(opts) then return

    ###
    # STATS
    ###


    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute anew and store
    # in cache for ttl seconds.
    # CONCERN: This could take around 15 seconds, and numerous hubs could all initiate it
    # at once, which is a waste.
    # TODO: This *can* be optimized to be super-fast by getting rid of all counts; to do that,
    # we need a list of all possible servers, say in a file or somewhere.  That's for later.
    get_stats: (opts) ->
        opts = defaults opts,
            ttl : 60  # how long cached version lives (in seconds)
            cb  : required




exports.rethinkdb = (opts) -> new RethinkDB(opts)