winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

async = require('async')
{defaults} = misc = require('misc')
required = defaults.required

###
# Schema
#   keys are the table names
#   values describe the indexes
###
TABLES =
    accounts    : false
    central_log :
        time  : []
        event : []
    counts      : false
    key_value   : false

PROJECT_GROUPS = misc.PROJECT_GROUPS

PROJECT_COLUMNS = exports.PROJECT_COLUMNS = ['project_id', 'account_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted', 'hide_from_accounts'].concat(PROJECT_GROUPS)

exports.PUBLIC_PROJECT_COLUMNS = ['project_id', 'title', 'last_edited', 'description', 'public', 'bup_location', 'size', 'deleted']

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
            consistency : undefined
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

    create_schema: (opts={}) =>
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
                                dbg("creating indexes #{misc.to_json(x)} on #{name}")
                            async.map(x, create, cb)
                async.map(misc.keys(TABLES), f, cb)
        ], (err) => cb?(err))

    key_value_store: (opts={}) => # key_value_store(name:"the name")
        new KeyValueStore(@db, opts)

    uuid_value_store: (opts={}) => # uuid_value_store(name:"the name")
        new UUIDValueStore(@, opts)

    uuid_blob_store: (opts={}) => # uuid_blob_store(name:"the name")
        new UUIDBlobStore(@, opts)

    # The log: important conceptually meaningful events
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object (will be JSON'd)
            cb    : undefined
        @db.table('central_log').insert({event:opts.event, value:opts.value, time:new Date()}).run((err)=>opts.cb?(err))

    get_log: (opts={}) ->
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        query = @db.table('central_log')
        if opts.start? or opts.end?   # impose an interval of time constraint
            if not opts.start?
                opts.start = new Date(0)
            if not opts.end?
                opts.end = new Date()
            query = query.between(opts.start, opts.end, {index:'time'})
        if opts.event?  # restrict to only the given event
            query = query.filter(@r.row("event").eq(opts.event))
        query.run(opts.cb)

    #####################################
    # User Account Management
    #####################################
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
                @update
                    table :'accounts'
                    set   :
                        first_name    : opts.first_name
                        last_name     : opts.last_name
                        email_address : opts.email_address
                        password_hash : opts.password_hash
                        created       : now()
                    where : {account_id:account_id}
                    cb    : cb

            # add 1 to the "number of accounts" counter
            (cb) =>
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


    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})

    get_user_names: (opts) =>
        opts = defaults opts,
            account_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from account_id to object (user name))

    is_email_address_available: (email_address, cb) =>
        @select
            table   : "email_address_to_account_id"
            where   :{email_address : misc.lower_email_address(email_address)}
            columns : ['account_id']
            cb      : (err, records) =>
                if err
                    cb(err)
                else
                    cb(undefined, records.length==0)

    all_users: (cb) =>
        # TODO

    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : undefined    # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {account_id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.
        # TODO

    # Delete the account with given id, and
    # remove the entry in the email_address_to_account_id table
    # corresponding to this account, if indeed the entry in that
    # table does map to this account_id.  This should only ever be
    # used for testing purposes, since there's no reason to ever
    # delete an account record -- doing so would mean throwing
    # away valuable information, e.g., there could be projects, etc.,
    # that only refer to the account_id, and we must know what the
    # account_id means.
    # Returns an error if the account doesn't exist.
    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required

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

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)

    ban_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            cb            : undefined

    # create a new passport, which modifies the passports and accounts tables.
    create_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            profile    : required
            cb         : required   # cb(err)

    # completely delete a passport from the database -- removes from passports table and from account
    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : undefined   # if given, must match what is on file for the strategy
            strategy   : required
            id         : required
            cb         : required

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        opts.cb() # TODO: stub

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or false) -- true if account exists; err = problem with db connection...
        opts.cb() # TODO: stub

    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined   # if given, adds this action; if not given cb(err, [array of actions])
            ttl           : undefined
            cb            : required

    update_account_settings: (opts={}) ->
        opts = defaults opts,
            account_id : required
            settings   : required
            cb         : required

    # Save remember einfo in the database
    save_remember_me: (opts) =>
        opts = defaults opts,
            account_id : required
            hash       : required
            value      : required
            ttl        : required
            cb         : undefined

    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id    : required
            cb            : undefined

    # Change the password for the given account.
    change_password: (opts={}) =>
        opts = defaults opts,
            account_id             : required
            password_hash          : required
            invalidate_remember_me : true
            cb                     : undefined

    # Change the email address, unless the email_address we're changing to is already taken.
    change_email_address: (opts={}) =>
        opts = defaults opts,
            account_id    : required
            email_address : required
            cb            : undefined



    #############
    # Tracking file access
    ############
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined

    # Get all files accessed in all projects
    get_file_access: (opts) =>
        opts = defaults opts,
            day    : required    # GMT string year-month-day
            start  : undefined   # start time on that day in iso format
            end    : undefined   # end time on that day in iso format
            cb     : required

    #############
    # Projects
    ############
    get_project_data: (opts) =>
        opts = defaults opts,
            project_id  : required
            columns     : required
            objectify   : false
            consistency : undefined
            cb          : required

    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            consistency : undefined
            cb          : required

    publish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            description : required
            cb          : required

    unpublish_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            path        : required
            cb          : required

    # get map {project_group:[{account_id:?,first_name:?,last_name:?}], ...}
    get_project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            groups     : PROJECT_GROUPS
            cb         : required

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30 seconds (per project).  In particular,
    # once called, it ignores subsequent calls for the same project for 30 seconds.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            size       : undefined
            cb         : undefined

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required

    create_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required  # owner
            title       : required
            description : undefined  # optional
            public      : required
            cb          : required

    undelete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : undefined

    delete_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : undefined

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : undefined

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : undefined


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

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)

    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)

    # cb(err, true if project is public)
    project_is_public: (opts) =>
        opts = defaults opts,
            project_id  : required
            consistency : undefined
            cb          : required  # cb(err, is_public)

    # cb(err, true if user is in one of the groups)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required
            groups      : required  # array of elts of PROJECT_GROUPS above
            consistency : undefined
            cb          : required  # cb(err)

    # all id's of projects having anything to do with the given account (ignores
    # hidden projects unless opts.hidden is true).
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            hidden     : false
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])

    get_hidden_project_ids: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required    # cb(err, mapping with keys the project_ids and values true)

    # gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets all data about them, not just id's
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            collabs_as_names : true       # replace all account_id's of project collabs with their user names.
            hidden           : false      # if true, get *ONLY* hidden projects; if false, don't include hidden projects
            cb               : required

    get_projects_with_ids: (opts) =>
        opts = defaults opts,
            ids     : required   # an array of id's
            columns : PROJECT_COLUMNS
            cb      : required

    get_project_titles: (opts) =>
        opts = defaults opts,
            project_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from project_id to string (project title))

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required

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



    ###
    # Fast count of number of entries in tables
    ###
    # Set the count of entries in a table that we manually track.
    set_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            value : required
            cb    : required
        opts.cb() # TODO

    # Modify the count of entries in a table that we manually track.
    # The default is to add 1.
    update_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            delta : 1
            cb    : required
        opts.cb() # TODO

    # Get count of entries in a table for which we manually maintain the count.
    get_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            cb    : required  # cb(err, count)
        opts.cb(undefined, 0) # TODO

exports.rethinkdb = (opts) -> new RethinkDB(opts)