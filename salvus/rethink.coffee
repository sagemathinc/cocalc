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

{defaults} = misc = require('misc')
required = defaults.required

###
# Schema
#   keys are the table names
#   values describe the indexes, except:
#        options - specifies table creation options as given at
#           http://rethinkdb.com/api/javascript/table_create/
#
###

# TODO: make options and indexes keys
# rather than mixing them.

TABLES =
    accounts    :
        options :
            primaryKey : 'account_id'
        email_address : []
        passports     : [{multi: true}]
    blobs :
        expire : []
    central_log :
        time  : []
        event : []
    client_error_log :
        time : []
        event : []
    compute_servers :
        options :
            primaryKey : 'host'
    file_access_log :
        timestamp : []
    hub_servers : false
    key_value   : false
    passport_settings :
        options :
            primaryKey : 'strategy'
    projects    :
        options :
            primaryKey : 'project_id'
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
    stats :
        timestamp : []

# these fields are arrays of account id's, which
# we need indexed:
for group in misc.PROJECT_GROUPS
    TABLES.projects[group] = [{multi:true}]

PROJECT_GROUPS = misc.PROJECT_GROUPS

PROJECT_COLUMNS = exports.PROJECT_COLUMNS = ['project_id', 'account_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted', 'users']

exports.PUBLIC_PROJECT_COLUMNS = ['project_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted']

# convert a ttl in seconds to an expiration time; otherwise undefined
expire_time = (ttl) -> if ttl? then new Date((new Date() - 0) + ttl*1000)

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
                    async.map(tables, ((table, cb) => @db.tableCreate(table, TABLES[table].options).run(cb)), cb)
            (cb) =>
                f = (name, cb) =>
                    indexes = misc.copy(TABLES[name])
                    if indexes.options?
                        delete indexes.options
                    if not indexes
                        cb(); return
                    table = @table(name)
                    create = (n, cb) =>
                        w = (x for x in indexes[n])
                        for i in [0...w.length]
                            if typeof(w[i]) == 'string'
                                that = @
                                w[i] = eval(w[i])
                        table.indexCreate(n, w...).run(cb)
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
    # Tables for loging things that happen
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
            log   : 'central_log'
            cb    : required
        query = @db.table(opts.log)
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
            account_id : required
            cb         : undefined
        @db.table('client_error_log').insert(
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
        @db.table("server_settings").insert(
            {name:opts.name, value:opts.value}, conflict:"replace").run(opts.cb)

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        @db.table('server_settings').get(opts.name).run (err, x) =>
            opts.cb(err, if x then x.value)

    ###
    # Passport settings
    ###
    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @db.table('passport_settings').get(opts.strategy).pluck('conf').run(opts.cb)

    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            cb       : required
        @db.table('passport_settings').insert({strategy:opts.strategy, conf:opts.conf}, conflict:'update').run(opts.cb)


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

    # TODO: change to get_usernames... both here and in CLIENT code.
    get_user_names: (opts) =>
        opts = defaults opts,
            account_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from account_id to object (user name))
        if not @_validate_opts(opts) then return
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
    all_users: (cb) =>
        if @_all_users_fresh?
            cb(false, @_all_users); return
        if @_all_users?
            cb(false, @_all_users)
        if @_all_users_computing? and @_all_users?
            return
        @_all_users_computing = true
        @table('accounts').pluck("first_name", "last_name", "account_id").run (err, results) =>
            if err and not @_all_users?
                cb?(err); return
            v = []
            for r in results
                if not r.first_name?
                    r.first_name = ''
                if not r.last_name?
                    r.last_name = ''
                search = (r.first_name + ' ' + r.last_name).toLowerCase()
                obj = {account_id : r.account_id, first_name:r.first_name, last_name:r.last_name, search:search}
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
                @table('accounts').getAll(email_queries..., {index:'email_address'}).pluck('account_id', 'first_name', 'last_name', 'email_address').run (err, r) =>
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
            return query.getAll(opts.account_id)
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
            columns       : ['account_id', 'password_hash',
                             'first_name', 'last_name', 'email_address',
                             'default_system', 'evaluate_key',
                             'email_new_features', 'email_maintenance', 'enable_tooltips',
                             'autosave', 'terminal', 'editor_settings', 'other_settings',
                             'groups', 'passports',
                             'password_is_set'  # set in the answer to true or false, depending on whether a password is set at all.
                            ]
        if not @_validate_opts(opts) then return
        @_account(opts).pluck(opts.columns...).run(opts.cb)

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
                @_account(opts).update(settings:opts.settings).run(cb)
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
        @table('remember_me').insert(hash:opts.hash, value:opts.value, expires:expire_time(opts.ttl), account_id:opts.account_id).run(opts.cb)

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
        @table('remember_me').get(opts.hash).run (err, x) =>
            if err or not x
                opts.cb(err); return
            if new Date() >= x.expires  # expired, so async delete
                x = undefined
                @delete_remember_me(hash:opts.hash)
            opts.cb(undefined, x)

    delete_remember_me: (opts) =>
        opts = defaults opts,
            hash : required
            cb   : undefined
        @table('remember_me').get(opts.hash).delete().run((err) => opts.cb?(err))


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
        if not @_validate_opts(opts) then return
        project =
            title       : opts.title
            description : opts.description
            created     : new Date()
            last_edited : new Date()
            users       : {}
        project.users[opts.account_id] = {group:'owner'}
        @db.table('projects').insert(project).run (err, x) =>
            opts.cb(err, x?.generated_keys[0])

    get_project_data: (opts) =>
        opts = defaults opts,
            project_id  : required
            columns     : PROJECT_COLUMNS
            cb          : required
        if not @_validate_opts(opts) then return
        @db.table('projects').get(opts.project_id).pluck(opts.columns...).run(opts.cb)

    # TODO: api change -- now it's a map path--> description rather than a
    # list of {path:?, description:?}
    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @db.table('projects').get(opts.project_id).pluck('public_paths').run (err, x) =>
            opts.cb(err, x?.public_paths)   # map {path:description}

    publish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            description : required
            cb          : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.path] = opts.description
        @db.table('projects').get(opts.project_id).update(public_paths:x).run(opts.cb)

    unpublish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            cb          : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.path] = true
        db.table('projects').get(opts.project_id).replace(@r.row.without(public_paths:x)).run(opts.cb)

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

    # TODO: api change -- no longer give the group
    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = true
        db.table('projects').get(opts.project_id).replace(@r.row.without(users:x)).run(opts.cb)

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
        @db.table('projects').get(opts.project_id).update(last_edited:now).run((err) => opts.cb?(err))

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required
        start = new Date(new Date() - opts.max_age_s*1000)
        @db.table('projects').between(start, new Date(), {index:'last_edited'}).pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (z.project_id for z in x))

    undelete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @db.table('projects').get(opts.project_id).update(deleted:false).run(opts.cb)

    delete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        @db.table('projects').get(opts.project_id).update(deleted:true).run(opts.cb)

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = {hide:true}
        @db.table('projects').get(opts.project_id).update(users : x).run(opts.cb)

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        x = {}; x[opts.account_id] = {hide:false}
        @db.table('projects').get(opts.project_id).update(users : x).run(opts.cb)

    # cb(err, true if user is in one of the groups for the project)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required
            groups      : required  # array of elts of PROJECT_GROUPS above
            cb          : required  # cb(err)
        if not @_validate_opts(opts) then return
        @db.table('projects').get(opts.project_id)('users')(opts.account_id)('group').run (err, group) =>
            opts.cb(err, group in opts.groups)

    # all id's of projects having anything to do with the given account (ignores
    # hidden projects unless opts.hidden is true).
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_opts(opts) then return
        @db.table('projects').getAll(opts.account_id, index:'users').pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (y.project_id for y in x))

    # Gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets columns data about them, not just id's
    # TODO: API changes -- collabs are given only by account_id's now, so client code will
    # need to change to reflect this. Which is better anyways.
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            columns          : PROJECT_COLUMNS
            hidden           : false      # if true, get *ONLY* hidden projects; if false, don't include hidden projects
            cb               : required
        if not @_validate_opts(opts) then return
        @db.table('projects').getAll(opts.account_id, index:'users').filter((project)=>
            project("users")(opts.account_id)('hide').default(false).eq(opts.hidden)).pluck(opts.columns).run(opts.cb)

    # Get all projects with the given id's.  Note that missing projects are
    # ignored (not an error).
    get_projects_with_ids: (opts) =>
        opts = defaults opts,
            ids     : required   # an array of id's
            columns : PROJECT_COLUMNS
            cb      : required
        if not @_validate_opts(opts) then return
        @db.table('projects').getAll(opts.ids...).pluck(opts.columns).run(opts.cb)

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
        @db.table('projects').between(new Date(new Date() - opts.age_m*60*1000), new Date(),
                                      {index:'last_edited'}).count().run(opts.cb)

    get_stats: (opts) =>
        opts = defaults opts,
            ttl : 60  # how long cached version lives (in seconds)
            cb  : required
        stats = undefined
        async.series([
            (cb) =>
                @db.table('stats').between(new Date(new Date() - 1000*opts.ttl), new Date(),
                                           {index:'timestamp'}).orderBy('timestamp').run (err, x) =>
                    if x?.length then stats=x[x.length - 1]
                    cb(err)
            (cb) =>
                if stats?
                    cb(); return
                stats = {timestamp:new Date()}
                async.parallel([
                    (cb) =>
                        @db.table('accounts').count().run((err, x) => stats.accounts = x; cb(err))
                    (cb) =>
                        @db.table('projects').count().run((err, x) => stats.projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 5, cb : (err, x) => stats.active_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24, cb : (err, x) => stats.last_day_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24*7, cb : (err, x) => stats.last_week_projects = x; cb(err))
                    (cb) =>
                        @db.table("hub_servers").pluck('huck', 'port', 'clients').run (err, hub_servers) =>
                            stats.hub_servers = hub_servers; cb(err)
                ], cb)
            (cb) =>
                @db.table('stats').insert(stats).run(cb)
        ], (err) => opts.cb(err, stats))

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
        @db.table('compute_servers').insert(x, conflict:'update').run(opts.cb)

    get_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            cb           : required
        @db.table('compute_servers').get(opts.host).run(opts.cb)

    get_all_compute_servers: (opts) =>
        opts = defaults opts,
            cb           : required
        @db.table('compute_servers').run(opts.cb)

    get_projects_on_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # hostname of the compute server
            columns        : ['project_id']
            cb             : required
        @db.table('projects').getAll(opts.compute_server, index:'compute_server').pluck(opts.columns).run(opts.cb)

    set_project_compute_server: (opts) =>
        opts = defaults opts,
            project_id     : required
            compute_server : required   # hostname of the compute server
            cb             : required
        @db.table('projects').get(opts.project_id).update(
            compute_server:opts.compute_server).run(opts.cb)

    ###
    # BLOB store.  Fields:
    #     id     = uuid from sha1(blob)
    #     blob   = the actual blob
    #     expire = time when object expires
    ###
    save_blob: (opts) =>
        opts = defaults opts,
            uuid  : required  # uuid=sha1-based uuid coming from blob
            blob : required  # we assume misc_node.uuidsha1(opts.blob) == opts.uuid; blob should be a string or Buffer
            ttl   : 0         # object in blobstore will have *at least* this ttl in seconds;
                              # if there is already something in blobstore with longer ttl, we leave it;
                              # infinite ttl = 0 or undefined.
            cb    : required  # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        @db.table('blobs').get(opts.uuid).pluck('expire').run (err, x) =>
            if err
                # blob not already saved
                @db.table('blobs').insert({id:opts.uuid, blob:opts.blob, expire:expire_time(opts.ttl)}).run (err) =>
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
                    query = @db.table('blobs').get(opts.uuid)
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
        @db.table('blobs').get(opts.uuid).run (err, x) =>
            if err
                opts.cb(err)
            else
                if not x
                    opts.cb(undefined, undefined)
                else if x.expire and x.expire <= new Date()
                    opts.cb(undefined, undefined)   # no such blob anymore
                    @db.table('blobs').get(opts.uuid).delete().run()   # delete it
                else
                    opts.cb(undefined, x.blob)
        # TODO: implement a scheduled task to delete expired blobs, since they should
        # never get expired via the get_blob codepath, since that *should* never get hit.

    remove_blob_ttls: (opts) ->
        opts = defaults opts,
            uuids : required   # uuid=sha1-based from blob
            cb    : required   # cb(err)
        @db.table('blobs').getAll(opts.uuids...).replace(
            @r.row.without(expire:true)).run(opts.cb)


exports.rethinkdb = (opts) -> new RethinkDB(opts)