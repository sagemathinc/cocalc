#########################################################################
#
# Interface to the Cassandra Database.
#
# *ALL* DB queries (using CQL, etc.) should be in this file, with
# *Cassandra/CQL agnostic wrapper functions defined here.   E.g.,
# to find out if an email address is available, define a function
# here that does the CQL query.
# Well, calling "select" is ok, but don't ever directly write
# CQL statements.
#
# (c) 2013 William Stein, University of Washington
#
# fs=require('fs'); a = new (require("cassandra").Salvus)(keyspace:'salvus', hosts:['10.1.1.2:9160'], username:'salvus', password:fs.readFileSync('data/secrets/cassandra/salvus').toString().trim(), cb:console.log)
# fs=require('fs'); a = new (require("cassandra").Salvus)(keyspace:'salvus', hosts:['localhost:8403'], username:'salvus', password:fs.readFileSync('data/secrets/cassandra/salvus').toString().trim(), cb:console.log)

#
#########################################################################

# This is used for project servers.  [[um, -- except it isn't actually used at all anywhere! (oct 11, 2013)]]
MAX_SCORE = 3
MIN_SCORE = -3   # if hit, server is considered busted.

# recent times, used for recently_modified_projects
exports.RECENT_TIMES = RECENT_TIMES =
    short : 5*60
    day   : 60*60*24
    week  : 60*60*24*7
    month : 60*60*24*7*30

RECENT_TIMES_ARRAY = ({desc:desc,ttl:ttl} for desc,ttl of RECENT_TIMES)

misc    = require('misc')

PROJECT_GROUPS = misc.PROJECT_GROUPS

{to_json, from_json, to_iso, defaults} = misc
required = defaults.required

fs      = require('fs')
assert  = require('assert')
async   = require('async')
winston = require('winston')                    # https://github.com/flatiron/winston

Client  = require("node-cassandra-cql").Client  # https://github.com/jorgebay/node-cassandra-cql
uuid    = require('node-uuid')
{EventEmitter} = require('events')

moment  = require('moment')

storage = require('storage')

_ = require('underscore')



# the time right now, in iso format ready to insert into the database:
now = exports.now = () -> to_iso(new Date())

# the time ms milliseconds ago, in iso format ready to insert into the database:
exports.milliseconds_ago = (ms) -> to_iso(new Date(new Date() - ms))
exports.seconds_ago      = (s)  -> exports.milliseconds_ago(1000*s)
exports.minutes_ago      = (m)  -> exports.seconds_ago(60*m)
exports.hours_ago        = (h)  -> exports.minutes_ago(60*h)
exports.days_ago         = (d)  -> exports.hours_ago(24*d)

#########################################################################

PROJECT_COLUMNS = exports.PROJECT_COLUMNS = ['project_id', 'account_id', 'title', 'last_edited', 'description', 'public', 'location', 'size', 'deleted'].concat(PROJECT_GROUPS)

# This is used in account creation right now, so has to be set.
# It is actually not used in practice and the limits have no meaning.
DEFAULT_PLAN_ID = "13814000-1dd2-11b2-0000-fe8ebeead9df"
exports.create_default_plan = (conn, cb) ->
    conn.cql("UPDATE plans SET current=true, name='Free', session_limit=3, storage_limit=250, max_session_time=30, ram_limit=2000, support_level='None' WHERE plan_id=#{DEFAULT_PLAN_ID}",[],cb)

exports.create_schema = (conn, cb) ->
    t = misc.walltime()
    blocks = require('fs').readFileSync('db_schema.cql', 'utf8').split('CREATE')
    f = (s, cb) ->
        console.log(s)
        if s.length > 0
            conn.cql("CREATE "+s, [], ((e,r)->console.log(e) if e; cb(null,0)))
        else
            cb(null, 0)
    async.mapSeries blocks, f, (err, results) ->
        winston.info("created schema in #{misc.walltime()-t} seconds.")
        winston.info(err)
        if not err
            # create default plan 0
            exports.create_default_plan(conn, (error, results) => cb(error) if error)

        cb(err)

class UUIDStore
    set: (opts) ->
        opts = defaults opts,
            uuid  : undefined
            value : undefined
            ttl   : 0
            cb    : undefined
        if not opts.uuid?
            opts.uuid = uuid.v4()
        else
            if not misc.is_valid_uuid_string(opts.uuid)
                throw "invalid uuid #{opts.uuid}"
        @cassandra.update
            table : @_table
            where : {name:@opts.name, uuid:opts.uuid}
            set   : {value:@_to_db(opts.value)}
            ttl   : opts.ttl
            cb    : opts.cb
        return opts.uuid

    # returns 0 if there is no ttl set; undefined if no object in table
    get_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : required

        @cassandra.select
            table  : @_table
            where  : {name:@opts.name, uuid:opts.uuid}
            columns : ['ttl(value)']
            objectify : false
            cb     : (err, result) =>
                if err
                    opts.cb(err)
                else
                    ttl = result[0]?[0]
                    if ttl == null
                        ttl = 0
                    opts.cb(err, ttl)

    # change the ttl of an existing entry -- requires re-insertion, which wastes network bandwidth...
    _set_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            ttl  : 0         # no ttl
            cb   : undefined
        @get
            uuid : opts.uuid
            cb : (err, value) =>
                if value?
                    @set
                        uuid : opts.uuid
                        value : value      # note -- the implicit conversion between buf and string is *necessary*, sadly.
                        ttl   : opts.ttl
                        cb    : opts.cb
                else
                    opts.cb?(err)

    # Set ttls for all given uuids at once; expensive if needs to change ttl, but cheap otherwise.
    set_ttls: (opts) =>
        opts = defaults opts,
            uuids : required    # array of strings/uuids
            ttl   : 0
            cb    : undefined
        if opts.uuids.length == 0
            opts.cb?()
            return
        @cassandra.select
            table   : @_table
            columns : ['ttl(value)', 'uuid']
            where   : {name:@opts.name, uuid:{'in':opts.uuids}}
            objectify : true
            cb      : (err, results) =>
                f = (r, cb) =>
                    if r['ttl(value)'] != opts.ttl
                        @_set_ttl
                            uuid : r.uuid
                            ttl  : opts.ttl
                            cb   : cb
                    else
                        cb()
                async.map(results, f, opts.cb)

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
            uuid : required
            cb   : required
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb("invalid uuid #{opts.uuid}")
        @cassandra.select
            table   : @_table
            columns : ['value']
            where   : {name:@opts.name, uuid:opts.uuid}
            cb      : (err, results) =>
                if err
                    opts.cb(err)
                else
                    if results.length == 0
                        opts.cb(false, undefined)
                    else
                        r = results[0][0]
                        if r == null
                            opts.cb(false, undefined)
                        else
                            opts.cb(false, @_from_db(r))

    delete: (opts) ->
        opts = defaults opts,
            uuid : required
            cb   : undefined
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("invalid uuid #{opts.uuid}")
        @cassandra.delete
            table : @_table
            where : {name:@opts.name, uuid:opts.uuid}
            cb    : opts.cb

    delete_all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.delete
            table : @_table
            where : {name:@opts.name}
            cb    : opts.cb

    length: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.count
            table : @_table
            where : {name:@opts.name}
            cb    : opts.cb

    all: (opts={}) ->
        opts = defaults(opts,  cb:required)
        @cassandra.select
            table   : @_table
            columns : ['uuid', 'value']
            where   : {name:@opts.name},
            cb      : (err, results) ->
                obj = {}
                for r in results
                    obj[r[0]] = @_from_db(r[1])
                opts.cb(err, obj)

class UUIDValueStore extends UUIDStore
    # c = new (require("cassandra").Salvus)(keyspace:'test'); s = c.uuid_value_store(name:'sage')
    # uid = s.set(value:{host:'localhost', port:5000}, ttl:30, cb:console.log)
    # uid = u.set(value:{host:'localhost', port:5000})
    # u.get(uuid:uid, cb:console.log)
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts,  name:required)
        @_table = 'uuid_value'
        @_to_db = to_json
        @_from_db = from_json

class UUIDBlobStore extends UUIDStore
    # c = new (require("cassandra").Salvus)(keyspace:'test'); s = c.uuid_blob_store(name:'test')
    # b = new Buffer("hi\u0000there"); uuid = s.set(value:b, ttl:300, cb:console.log)
    # s.get(uuid: uuid, cb:(e,r) -> console.log(r))
    constructor: (@cassandra, opts={}) ->
        @opts     = defaults(opts, name:required)
        @_table   = 'uuid_blob'
        @_to_db   = (x) ->
            winston.debug("converting object of length #{x.length} to hex")
            s = x.toString('hex')
            winston.debug('converted, now storing')
            return s
        @_from_db = (x) -> new Buffer(x, 'hex')

class KeyValueStore
    #   c = new (require("cassandra").Salvus)(); d = c.key_value_store('test')
    #   d.set(key:[1,2], value:[465, {abc:123, xyz:[1,2]}], ttl:5)
    #   d.get(key:[1,2], console.log)   # but call it again in > 5 seconds and get nothing...
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts,  name:required)

    set: (opts={}) ->
        opts = defaults opts,
            key   : undefined
            value : undefined
            ttl   : 0
            cb    : undefined

         @cassandra.update
            table:'key_value'
            where:{name:@opts.name, key:to_json(opts.key)}
            set:{value:to_json(opts.value)}
            ttl:opts.ttl
            cb:opts.cb

    get: (opts={}) ->
        opts = defaults opts,
            key       : undefined
            cb        : undefined  # cb(error, value)
            timestamp : false      # if specified, result is {value:the_value, timestamp:the_timestamp} instead of just value.
        if opts.timestamp
            @cassandra.select(
                table     : 'key_value'
                columns   : ['value']
                timestamp : ['value']
                where     : {name:@opts.name, key:to_json(opts.key)}
                cb : (error, results) ->
                    opts.cb?(error, if results.length == 1 then {'value':from_json(results[0][0].value), 'timestamp':results[0][0].timestamp})
            )
        else
            @cassandra.select(
                table:'key_value'
                columns:['value']
                where:{name:@opts.name, key:to_json(opts.key)}
                cb:(error, results) -> opts.cb?(error, if results.length == 1 then from_json(results[0][0]))
            )

    delete: (opts={}) ->
        opts = defaults(opts, key:undefined, cb:undefined)
        @cassandra.delete(table:'key_value', where:{name:@opts.name, key:to_json(opts.key)}, cb:opts.cb)

    delete_all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.delete(table:'key_value', where:{name:@opts.name}, cb:opts.cb)

    length: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.count(table:'key_value', where:{name:@opts.name}, cb:opts.cb)

    all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.select(
            table:'key_value'
            columns:['key', 'value']
            where:{name:@opts.name}
            cb:(error, results) -> opts.cb(error, [from_json(r[0]), from_json(r[1])] for r in results)
        )

# Convert individual entries in columns from cassandra formats to what we
# want to use everywhere in Salvus. For example, uuids ficare converted to
# strings instead of their own special object type, since otherwise they
# convert to JSON incorrectly.

exports.from_cassandra = from_cassandra = (value, json) ->
    if not value?
        return undefined
    if value.toInt?
        value = value.toInt()   # newer version of node-cassandra-cql uses the Javascript long type
    else
        value = value.valueOf()
        if json
            value = from_json(value)
    return value

class exports.Cassandra extends EventEmitter
    constructor: (opts={}) ->    # cb is called on connect
        opts = defaults opts,
            hosts    : ['localhost']
            cb       : undefined
            keyspace : undefined
            username : undefined
            password : undefined
            consistency : undefined
            verbose : false # quick hack for debugging...
            conn_timeout_ms : 5000  # Maximum time in milliseconds to wait for a connection from the pool.

        @keyspace = opts.keyspace

        if opts.hosts.length == 1
            # the default QUORUM won't work if there is only one node.
            opts.consistency = 1

        @consistency = opts.consistency  # the default consistency (for now)

        #winston.debug("connect using: #{JSON.stringify(opts)}")  # DEBUG ONLY!! output contains sensitive info (the password)!!!

        @conn = new Client
            hosts      : opts.hosts
            keyspace   : opts.keyspace
            username   : opts.username
            password   : opts.password
            getAConnectionTimeout : opts.conn_timeout_ms

        if opts.verbose
            @conn.on 'log', (level, message) =>
                winston.debug('database connection event: %s -- %j', level, message)

        @conn.on 'error', (err) =>
            winston.error(err.name, err.message)
            @emit('error', err)

        @conn.connect (err) =>
            if err
                winston.debug("failed to connect to database -- #{err}")
            else
                winston.debug("connected to database")
            opts.cb?(err, @)
            # CRITICAL -- we must not call the callback multiple times; note that this
            # connect event happens even on *reconnect*, which will happen when the
            # database connection gets dropped, e.g., due to restarting the database,
            # network issues, etc.
            opts.cb = undefined

    _where: (where_key, vals, json=[]) ->
        where = "";
        for key, val of where_key
            equals_fallback = true
            for op in ['>', '<', '>=', '<=', '==', 'in', '']
                if op == '' and equals_fallback
                    x = val
                    op = '=='
                else
                    assert(val?, "val must be defined -- there's a bug somewhere: _where(#{to_json(where_key)}, #{to_json(vals)}, #{to_json(json)})")
                    x = val[op]
                if x?
                    if key in json
                        x2 = to_json(x)
                    else
                        x2 = x
                    if op != ''
                        equals_fallback = false
                    if op == '=='
                        op = '=' # for cassandra
                    if op == 'in'
                        # !!!!!!!!!!!!!! potential CQL-injection attack !?  !!!!!!!!!!!
                        # TODO -- keep checking/complaining?:  in queries with params don't seem to work right at least as of Oct 13, 2013 !
                        where += "#{key} IN #{array_of_strings_to_cql_list(x2)}"
                    else
                        where += "#{key} #{op} ?"
                        vals.push(x2)
                    where += " AND "
        return where.slice(0,-4)    # slice off final AND.

    _set: (properties, vals, json=[]) ->
        set = "";
        for key, val of properties
            if key in json
                val = to_json(val)
            if val?
                if misc.is_valid_uuid_string(val)
                    # The Helenus driver is completely totally
                    # broken regarding uuid's (their own UUID type
                    # doesn't work at all). (as of April 15, 2013)  - TODO: revisit this since I'm not using Helenus anymore.
                    # This is of course scary/dangerous since what if x2 is accidentally a uuid!
                    set += "#{key}=#{val},"
                else if typeof(val) != 'boolean'
                    set += "#{key}=?,"
                    vals.push(val)
                else
                    # TODO: here we work around a driver bug :-(
                    set += "#{key}=#{val},"
            else
                set += "#{key}=null,"
        return set.slice(0,-1)

    close: () ->
        @conn.close()
        @emit('close')

    ###########################################################################################
    # Set the count of entries in a table that we manually track.
    # (Note -- I tried implementing this by deleting the entry then updating and that made
    # the value *always* null no matter what.  So don't do that.)
    set_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            value : required
            cb    : required

        current_value = undefined
        async.series([
            (cb) =>
                @get_table_counter
                    table : opts.table
                    cb    : (err, value) =>
                        current_value = value
                        cb(err)
            (cb) =>
                @update_table_counter
                    table : opts.table
                    delta : opts.value - current_value
                    cb    : cb
        ], opts.cb)

    # Modify the count of entries in a table that we manually track.
    # The default is to add 1.
    update_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            delta : 1
            cb    : required
        query = "update counts set count=count+? where table_name=?"
        @cql query, [opts.delta, opts.table], opts.cb

    # Get count of entries in a table for which we manually maintain the count.
    get_table_counter: (opts) =>
        opts = defaults opts,
            table : required
            cb    : required  # cb(err, count)
        @select
            table     : 'counts'
            where     : {table_name : opts.table}
            columns   : ['count']
            objectify : false
            cb        : (err, result) =>
                if err
                    opts.cb(err)
                else
                    if result.length == 0
                        opts.cb(false, 0)
                    else
                        opts.cb(false, result[0][0])

    # Compute a count directly from the table.
    # ** This is highly inefficient in general and doesn't scale.  PAIN.  **
    count: (opts) ->
        opts = defaults opts,
            table : required
            where : {}
            cb    : required   # cb(err, the count if delta=set=undefined)

        query = "SELECT COUNT(*) FROM #{opts.table}"
        vals = []
        if not misc.is_empty_object(opts.where)
            where = @_where(opts.where, vals)
            query += " WHERE #{where}"

        @cql query, vals, (err, results) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, from_cassandra(results[0].get('count')))

    update: (opts={}) ->
        opts = defaults opts,
            table     : required
            where     : required
            set       : {}
            ttl       : 0
            cb        : undefined
            json      : []          # list of columns to convert to JSON
        vals = []
        set = @_set(opts.set, vals, opts.json)
        where = @_where(opts.where, vals, opts.json)
        @cql("UPDATE #{opts.table} USING ttl #{opts.ttl} SET #{set} WHERE #{where}", vals, opts.cb)

    delete: (opts={}) ->
        opts = defaults opts,
            table : undefined
            where : {}
            thing : ''
            cb    : undefined
        vals = []
        where = @_where(opts.where, vals)
        @cql("DELETE #{opts.thing} FROM #{opts.table} WHERE #{where}", vals, opts.cb)

    select: (opts={}) =>
        opts = defaults opts,
            table     : required    # string -- the table to query
            columns   : required    # list -- columns to extract
            where     : undefined   # object -- conditions to impose; undefined = return everything
            cb        : required    # callback(error, results)
            objectify : false       # if false results is a array of arrays (so less redundant); if true, array of objects (so keys redundant)
            limit     : undefined   # if defined, limit the number of results returned to this integer
            json      : []          # list of columns that should be converted from JSON format
            order_by : undefined    # if given, adds an "ORDER BY opts.order_by"
            consistency : undefined  # default...
            allow_filtering : false

        vals = []
        query = "SELECT #{opts.columns.join(',')} FROM #{opts.table}"
        if opts.where?
            where = @_where(opts.where, vals, opts.json)
            query += " WHERE #{where} "
        if opts.limit?
            query += " LIMIT #{opts.limit} "
        if opts.order_by?
            query += " ORDER BY #{opts.order_by} "

        if opts.allow_filtering
            query += " ALLOW FILTERING"
        @cql query, vals, opts.consistency, (error, results) =>
            if error
                opts.cb(error); return
            if opts.objectify
                x = (misc.pairs_to_obj([col,from_cassandra(r.get(col), col in opts.json)] for col in opts.columns) for r in results)
            else
                x = ((from_cassandra(r.get(col), col in opts.json) for col in opts.columns) for r in results)
            opts.cb(undefined, x)

    # Exactly like select (above), but gives an error if there is not exactly one
    # row in the table that matches the condition.  Also, this returns the one
    # rather than an array of length 0.
    select_one: (opts={}) =>
        cb = opts.cb
        opts.cb = (err, results) ->
            if err
                cb(err)
            else if results.length == 0
                cb("No row in table '#{opts.table}' matched condition '#{opts.where}'")
            else if results.length > 1
                cb("More than one row in table '#{opts.table}' matched condition '#{opts.where}'")
            else
                cb(false, results[0])
        @select(opts)

    cql: (query, vals, consistency, cb) ->
        if typeof vals == 'function'
            cb = vals
            vals = []
            consistency = undefined
        if typeof consistency == 'function'
            cb = consistency
            consistency = undefined
        if not consistency?
            consistency = @consistency
        try
            @conn.execute query, vals, consistency, (error, results) =>
                if error
                    winston.error("Query cql('#{query}',params=#{vals}) caused a CQL error:\n#{error}")
                cb?(error, results?.rows)
        catch e
            cb?("exception doing cql query -- #{e}")

    key_value_store: (opts={}) -> # key_value_store(name:"the name")
        new KeyValueStore(@, opts)

    uuid_value_store: (opts={}) -> # uuid_value_store(name:"the name")
        new UUIDValueStore(@, opts)

    uuid_blob_store: (opts={}) -> # uuid_blob_store(name:"the name")
        new UUIDBlobStore(@, opts)

    chunked_storage: (project_id) =>
        return new ChunkedStorage(@, project_id)

class exports.Salvus extends exports.Cassandra
    constructor: (opts={}) ->
        @_touch_project_cache = {}
        if not opts.keyspace?
            opts.keyspace = 'salvus'
        super(opts)

    #####################################
    # The cluster status monitor
    #####################################

    # returns array [{host:'10.x.y.z', ..., other data about compute node}, ...]
    compute_status: (opts={}) =>
        opts = defaults opts,
            cb : required
        @select_one
            table : 'monitor_last'
            columns : ['compute']
            json    : ['compute']
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, result[0])

    #####################################
    # The log: we log important conceptually meaningful events
    # here.  This is something we will actually look at.
    #####################################
    log: (opts={}) ->
        opts = defaults opts,
            event : required    # string
            value : required    # object (will be JSON'd)
            ttl   : undefined
            cb    : undefined

        @update
            table :'central_log'
            set   : {event:opts.event, value:to_json(opts.value)}
            where : {'time':now()}
            cb    : opts.cb


    get_log: (opts={}) ->
        opts = defaults(opts,
            start_time : undefined
            end_time   : undefined
            cb         : required
        )

        where = {}
        # TODO -- implement restricting the range of times -- this
        # isn't trivial because I haven't implemented ranges in
        # @select yet, and I don't want to spend a lot of time on this
        # right now. maybe just write query using CQL.

        @select
            table   : 'central_log'
            where   : where
            columns : ['time', 'event', 'value']
            cb      : (error, results) ->
                if error
                    cb(error)
                else
                    cb(false, ({time:r[0], event:r[1], value:from_json(r[2])} for r in results))

    ##-- search


    # all_users: cb(err, array of {first_name:?, last_name:?, account_id:?, search:'names and email thing to search'})
    #
    # No matter how often all_users is called, it is only updated at most once every 60 seconds, since it is expensive
    # to scan the entire database, and the client will typically make numerous requests within seconds for
    # different searches.  When some time elapses and we get a search, if we have an old cached list in memory, we
    # use it and THEN start computing a new one -- so user queries are always answered nearly instantly, but only
    # repeated queries will give an up to date result.
    #
    # Of course, caching means that newly created accounts, or modified account names,
    # will not show up in searches for 1 minute.  That's
    # very acceptable.
    #
    # This obviously doesn't scale, and will need to be re-written to use some sort of indexing system, or
    # possibly only allow searching on email address, or other ways.  I don't know yet.
    #
    all_users: (cb) =>
        if @_all_users_fresh?
            cb(false, @_all_users); return
        if @_all_users?
            cb(false, @_all_users)
        if @_all_users_computing? and @_all_users?
            return
        @_all_users_computing = true
        @select
            table     : 'accounts'
            columns   : ['first_name', 'last_name', 'email_address', 'account_id']
            objectify : true
            consistency : 1     # since we really want optimal speed, and missing something temporarily is ok.
            limit     : 1000000  # TODO: probably start failing due to timeouts around 100K users (?) -- will have to cursor or query multiple times then?
            cb        : (err, results) =>
                console.log("queried...", err, results.length)
                if err and not @_all_users?
                    cb(err); return
                v = []
                for r in results
                    if not r.first_name?
                        r.first_name = ''
                    if not r.last_name?
                        r.last_name = ''
                    search = (r.first_name + ' ' + r.last_name).toLowerCase()
                    obj = {account_id : r.account_id, first_name:r.first_name, last_name:r.last_name, search:search, email:r.email_address?.toLowerCase()}
                    v.push(obj)
                delete @_all_users_computing
                if not @_all_users?
                    cb(false,v)
                @_all_users = v
                @_all_users_fresh = true
                f = () =>
                    delete @_all_users_fresh
                setTimeout(f, 60000)   # cache for 1 minute

    user_search: (opts) =>
        opts = defaults opts,
            query : required
            limit : undefined
            cb    : required

        @all_users (err, users) =>
            if err
                opts.cb(err); return
            query = opts.query.toLowerCase().split(/\s+/g)
            match = (search, email) ->
                for q in query
                    if (search.indexOf(q) == -1 and email != q)
                        return false
                return true
            r = []
            # LOCKING WARNING: In the worst case, this is a non-indexed linear search through all
            # names which completely locks the server.  That said, it would take about
            # 500,000 users before this blocks the server for *1 second*... at which point the
            # database query to load all users into memory above (in @all_users) would take
            # several hours.   So let's optimize this, but do that later!!
            for x in users
                if match(x.search, x.email)
                    r.push(x)
                    if opts.limit? and r.length >= opts.limit
                        break
            opts.cb(false, r)

    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(false, [])
            return
        @select
            table     : 'accounts'
            columns   : ['account_id', 'first_name', 'last_name']
            where     : {account_id:{'in':opts.account_ids}}
            objectify : true
            cb        : (err, results) =>
                v = {}
                for r in results
                    v[r.account_id] = {first_name:r.first_name, last_name:r.last_name}
                opts.cb(err, v)

    #####################################
    # Snap servers
    #####################################
    snap_servers: (opts) =>
        opts = defaults opts,
            server_ids : undefined
            columns    : ['id', 'host', 'port', 'key', 'size']
            cb         : required

        if opts.server_ids?
            if opts.server_ids.length == 0
                opts.cb(false, [])
                return
            where = {dummy:true, id:{'in':opts.server_ids}}
        else
            where = {dummy:true}

        @select
            table     : 'snap_servers'
            columns   : opts.columns
            where     : where
            objectify : true
            cb        : opts.cb

    # Return one snap server and repo_id with the given commit.
    # The servers are the same format as output by snap_servers above.
    snap_locate_commit: (opts) =>
        opts = defaults opts,
            project_id : required
            timestamp  : required
            cb         : required   # (err, {server:{host:?,port:?,key:?}, repo_id:?})

        answer    = undefined
        servers   = undefined
        async.series([
            (cb) =>
                @snap_servers
                    cb : (err, _servers) =>
                        servers = _servers
                        cb(err)
            (cb) =>
                server_ids = (x.id for x in servers)
                @select
                    table      : 'snap_commits'   # this query uses ALLOW FILTERING.
                    where      : {server_id:{'in':server_ids}, project_id : opts.project_id, timestamp : opts.timestamp}
                    columns    : ['server_id', 'repo_id']
                    objectify  : true
                    cb         : (err, locations) =>
                        if err
                            cb(err); return
                        server_ids = (x.server_id for x in locations)
                        servers = (x for x in servers when x.id in server_ids)
                        if servers.length == 0
                            cb("no snapshot server with snapshot #{opts.timestamp} of #{opts.project_id}"); return
                        server = misc.random_choice(servers)
                        for x in locations
                            if x.server_id == server.id
                                answer = {server:server, repo_id:x.repo_id}
                                cb()
                                return
                        cb("Internal BUG -- problem location snapshot server with snapshot #{opts.timestamp} of #{opts.project_id}")

        ], (err) => opts.cb(err, answer))

    snap_commits: (opts) =>
        opts = defaults opts,
            server_ids : required
            project_id : required
            columns    : ['server_id', 'project_id', 'timestamp', 'size']
            cb         : required

        if opts.server_ids.length == 0
            opts.cb(false, [])
            return

        @select
            table   : 'snap_commits'
            where   : {server_id:{'in':opts.server_ids}, project_id:opts.project_id}
            columns : opts.columns
            objectify : true
            cb      : opts.cb

    snap_ls_cache: (opts) =>
        opts = defaults opts,
            project_id : required
            timestamp  : required
            path       : required
            listing    : undefined   # if given, store listing in the cache
            ttl        : 3600*24*7   # 1 week
            cb         : required    # cb(err, listing or undefined)

        where = {project_id:opts.project_id, timestamp:opts.timestamp, path:opts.path}
        if opts.listing?
            # store in cache
            @update
                table : 'snap_ls_cache'
                set   : {listing:opts.listing}
                json  : ['listing']
                where : where
                ttl   : opts.ttl
                cb    : opts.cb
        else
            # get listing out of cache, if there.
            @select
                table   : 'snap_ls_cache'
                columns : ['listing']
                where   : where
                json    : ['listing']
                objectify : false
                cb      : (err, results) =>
                    if err
                        opts.cb(err)
                    else if results.length == 0
                        opts.cb(false, undefined)  # no error, but nothing in caching
                    else
                        opts.cb(false, results[0][0])

    random_snap_server: (opts) =>
        opts = defaults opts,
            cb        : required
        @snap_servers
            cb : (err, results) =>
                if err
                    opts.cb(err)
                else
                    if results.length == 0
                        opts.cb("No snapshot servers are available -- try again later.")
                    else
                        opts.cb(false, misc.random_choice(results))



    #####################################
    # Managing compute servers
    #####################################
    # if keyspace is test, and there are no compute servers, returns
    # 'localhost' no matter what, since often when testing we don't
    # put an entry in the database.
    running_compute_servers: (opts={}) ->
        opts = defaults opts,
            cb   : required
            min_score : MIN_SCORE

        @select
            table   : 'compute_servers'
            columns : ['host', 'score']
            where   : {running:true, dummy:true}
            allow_filtering : true
            cb      : (err, results) =>
                if results.length == 0 and @keyspace == 'test'
                    # This is used when testing the compute servers
                    # when not run as a daemon so there is not entry
                    # in the database.
                    opts.cb(err, [{host:'localhost', score:0}])
                else
                    opts.cb(err, {host:x[0], score:x[1]} for x in results when x[1]>=opts.min_score)

    # cb(error, random running sage server) or if there are no running
    # sage servers, then cb(undefined).  We only consider servers whose
    # score is strictly greater than opts.min_score.
    random_compute_server: (opts={}) ->
        opts = defaults opts,
            cb        : required

        @running_compute_servers
            cb   : (error, res) ->
                if not error and res.length == 0
                    opts.cb("no compute servers")
                else
                    opts.cb(error, misc.random_choice(res))

    # Adjust the score on a compute server.  It's possible that two
    # different servers could change this at the same time, thus
    # messing up the score slightly.  However, the score is a rough
    # heuristic, not a bank account balance, so I'm not worried.
    # TODO: The score algorithm -- a simple integer delta -- is
    # trivial; there is a (provably?) better approach used by
    # Cassandra that I'll implement in the future.
    score_compute_server: (opts) ->
        opts = defaults opts,
            host  : required
            delta : required
            cb    : undefined
        new_score = undefined
        async.series([
            (cb) =>
                @select
                    table   : 'compute_servers'
                    columns : ['score']
                    where   : {host:opts.host, dummy:true}
                    cb      : (err, results) ->
                        if err
                            cb(err)
                            return
                        if results.length == 0
                            cb("No compute server '#{opts.host}'")
                        new_score = results[0][0] + opts.delta
                        cb()
            (cb) =>
                if new_score >= MIN_SCORE and new_score <= MAX_SCORE
                    @update
                        table : 'compute_servers'
                        set   : {score : new_score}
                        where : {host  : opts.host, dummy:true}
                        cb    : cb
                else
                    # new_score is outside the allowed range, so we do nothing.
                    cb()
        ], opts.cb)

    #####################################
    # User plans (what features they get)
    #####################################
    get_plan: (opts={}) ->
        opts = defaults opts,
            plan_id : required
            cb      : required

        if not misc.is_valid_uuid_string(opts.plan_id)   # I've seen 0 in tracebacks
            opts.plan_id = DEFAULT_PLAN_ID
        @select
            table  : 'plans'
            where  : {plan_id:opts.plan_id}
            columns: ['plan_id', 'name', 'description', 'price', 'current', 'stateless_exec_limits',
                      'session_limit', 'storage_limit', 'max_session_time', 'ram_limit', 'support_level']
            objectify: true
            cb : (error, results) ->
                if error
                    opts.cb(error)
                else if results.length != 1
                    opts.cb("No plan with id #{opts.plan_id}")
                else
                    opts.cb(false, results[0])

    #####################################
    # Account Management
    #####################################
    is_email_address_available: (email_address, cb) =>
        @count
            table : "email_address_to_account_id"
            where :{email_address : misc.lower_email_address(email_address)}
            cb    : (error, cnt) =>
                if error
                   cb(error)
                else
                   cb(null, cnt==0)

    create_account: (opts={}) ->
        opts = defaults opts,
            first_name    : required
            last_name     : required
            email_address : required
            password_hash : required
            cb            : required

        account_id = uuid.v4()
        opts.email_address = misc.lower_email_address(opts.email_address)   # canonicalize the email address
        async.series([
            # verify that account doesn't already exist
            (cb) =>
                @select
                    table : 'email_address_to_account_id'
                    columns : ['account_id']
                    where : {'email_address':opts.email_address}
                    cb    : (err, results) =>
                        if err
                            cb(err)
                        else if results.length > 0
                            cb("account with email address '#{opts.email_address}' already exists")
                        else
                            cb()
            # create account
            (cb) =>
                @update
                    table :'accounts'
                    set   :
                        first_name    : opts.first_name
                        last_name     : opts.last_name
                        email_address : opts.email_address
                        password_hash : opts.password_hash
                        plan_id       : DEFAULT_PLAN_ID
                    where : {account_id:account_id}
                    cb    : cb
            (cb) =>
                @update
                    table : 'email_address_to_account_id'
                    set   : {account_id : account_id}
                    where : {email_address: opts.email_address}
                    cb    : cb
            # add 1 to the "number of accounts" counter
            (cb) =>
                @update_table_counter
                    table : 'accounts'
                    delta : 1
                    cb    : cb
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(false, account_id)
        )

    # This should never have to be run; however, it could be useful to run it periodically "just in case".
    # I wrote this when migrating the database to avoid secondary indexes.
    update_email_address_to_account_id_table: (cb) =>
        @select
            table: 'accounts'
            limit: 10000000  # effectively unlimited...
            columns: ['email_address', 'account_id']
            objectify: false
            cb: (err, results) =>
                console.log("Got full table with #{results.length} entries.  Now populating email_address_to_account_id table....")
                t = {}
                f = (r, cb) =>
                     if not r[0]? or not r[1]?
                          console.log("skipping", r)
                          cb()
                          return
                     if t[r[0]]?
                         console.log("WARNING: saw the email address '#{r[0]}' more than once.  account_id=#{r[1]} ")
                     t[r[0]] = r[1]
                     @update
                         table : 'email_address_to_account_id'
                         set   : {account_id: r[1]}
                         where : {email_address: r[0]}
                         cb    : cb
                async.map results, f, (err) =>
                    console.log("#{misc.len(t)} distinct email addresses")
                    if err
                        console.log("error updating...",err)
                        cb(err)
                    else
                        @set_table_counter
                            table : 'accounts'
                            value : misc.len(t)
                            cb    : cb

    # A *one-off* computation!  For when we canonicalized email addresses to be lower case.
    lowercase_email_addresses: (cb) =>
        ###
        Algorithm:
         - get list of all pairs (account_id, email_address)
         - use to make map  {lower_email_address:[[email_address, account_id], ... }
         - for each key of that map:
               - if multiple addresses, query db to see which was used most recently
               - set accounts record with given account_id to lower_email_address
               - set email_address_to_account_id --> accounts mapping to map lower_email_address to account_id.
        ###
        dbg = (m) -> console.log("lowercase_email_addresses: #{m}")
        dbg()
        @select
            table     : 'accounts'
            limit     : 10000000  # effectively unlimited...
            columns   : ['email_address', 'account_id']
            objectify : false
            cb: (err, results) =>
                dbg("There are #{results.length} accounts.")
                results.sort()
                t = {}
                for r in results
                    if r[0]?
                        k = r[0].toLowerCase()
                        if not t[k]?
                            t[k] = []
                        t[k].push(r)
                total = misc.len(t)
                cnt = 1
                dbg("There are #{total} distinct lower case email addresses.")
                f = (k, cb) =>
                    dbg("#{k}: #{cnt}/#{total}"); cnt += 1
                    v = t[k]
                    account_id = undefined
                    async.series([
                        (c) =>
                            if v.length == 1
                                dbg("#{k}: easy case of only one account")
                                account_id = v[0][1]
                                c(true)
                            else
                                dbg("#{k}: have to deal with #{v.length} accounts")
                                c()
                        (c) =>
                            @select
                                table    : 'successful_sign_ins'
                                columns  : ['time','account_id']
                                where    : {'account_id':{'in':(x[1] for x in v)}}
                                order_by : 'time'
                                cb       : (e, results) =>
                                    if e
                                        c(e)
                                    else
                                        if results.length == 0   # never logged in... -- so just take one arbitrarily
                                            account_id = v[0][1]
                                        else
                                            account_id = results[results.length-1][1]
                                        c()
                    ], (ignore) =>
                        if account_id?
                            async.series([
                                (c) =>
                                    @update
                                        table : 'accounts'
                                        set   : {'email_address': k}
                                        where : {'account_id': account_id}
                                        cb    : c
                                (c) =>
                                    @update
                                        table : 'email_address_to_account_id'
                                        set   : {'account_id': account_id}
                                        where : {'email_address': k}
                                        cb    : c
                            ], cb)
                        else
                            cb("unable to determine account for email '#{k}'")
                    )
                async.mapLimit misc.keys(t), 5, f, (err) =>
                    dbg("done -- err=#{err}")


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
        email_address = undefined
        async.series([
            # find email address associated to this account
            (cb) =>
                @get_account
                    account_id : opts.account_id
                    columns    : ['email_address']
                    cb         : (err, account) =>
                        if err
                            cb(err)
                        else
                            email_address = account.email_address
                            cb()
            # delete entry in the email_address_to_account_id table
            (cb) =>
                @select
                    table   : 'email_address_to_account_id'
                    columns : ['account_id']
                    where   : {email_address: email_address}
                    cb      : (err, results) =>
                        if err
                            cb(err)
                        else if results.length > 0 and results[0][0] == opts.account_id
                            # delete entry of that table
                            @delete
                                table : 'email_address_to_account_id'
                                where : {email_address: email_address}
                                cb    : cb
                        else
                            # deleting a "spurious" account that isn't mapped to by email_address_to_account_id table,
                            # so nothing to do here.
                            cb()
            # everything above worked, so now delete the actual account
            (cb) =>
                @delete
                    table : "accounts"
                    where : {account_id : opts.account_id}
                    cb    : cb
            # subtract 1 from the "number of accounts" counter
            (cb) =>
                @update_table_counter
                    table : 'accounts'
                    delta : -1
                    cb    : cb

        ], opts.cb)


    get_account: (opts={}) =>
        opts = defaults opts,
            cb            : required
            email_address : undefined     # provide either email or account_id (not both)
            account_id    : undefined
            columns       : ['account_id', 'password_hash',
                             'first_name', 'last_name', 'email_address',
                             'plan_id', 'plan_starttime',
                             'default_system', 'evaluate_key',
                             'email_new_features', 'email_maintenance', 'enable_tooltips',
                             'connect_Github', 'connect_Google', 'connect_Dropbox',
                             'autosave', 'terminal', 'editor_settings', 'other_settings']

        account = undefined
        if opts.email_address?
            opts.email_address = misc.lower_email_address(opts.email_address)
        async.series([
            (cb) =>
                if opts.account_id?
                    cb()
                else if not opts.email_address?
                    cb("either the email_address or account_id must be specified")
                else
                    @select
                        table     : 'email_address_to_account_id'
                        where     : {email_address:opts.email_address}
                        columns   : ['account_id']
                        objectify : false
                        cb        : (err, results) =>
                            if err
                                cb(err)
                            else if results.length == 0
                                cb("There is no account with email address #{opts.email_address}.")
                            else
                                # success!
                                opts.account_id = results[0][0]
                                cb()
            (cb) =>
                @select
                    table     : 'accounts'
                    where     : {account_id : opts.account_id}
                    columns   : opts.columns
                    objectify : true
                    json      : ['terminal', 'editor_settings', 'other_settings']
                    cb        : (error, results) ->
                        if error
                            cb(error)
                        else if results.length == 0
                            cb("There is no account with account_id #{opts.account_id}.")
                        else
                            account = results[0]
                            cb()
        ], (err) =>
            opts.cb(err, account)
        )

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)
        if not opts.email_address? or opts.account_id?
            opts.cb("at least one of email_address or account_id must be given")
            return
        if opts.email_address?
            opts.email_address = misc.lower_email_address(opts.email_address)
        dbg = (m) -> winston.debug("user_is_banned(email_address=#{opts.email_address},account_id=#{opts.account_id}): #{m}")
        banned_accounts = undefined
        email_address = undefined
        async.series([
            (cb) =>
                if @_account_is_banned_cache?
                    banned_accounts = @_account_is_banned_cache
                    cb()
                else
                    dbg("filling cache")
                    @select
                        table   : 'banned_email_addresses'
                        columns : ['email_address']
                        cb      : (err, results) =>
                            if err
                                cb(err); return
                            @_account_is_banned_cache = {}
                            for x in results
                                @_account_is_banned_cache[x] = true
                            banned_accounts = @_account_is_banned_cache
                            f = () =>
                                delete @_account_is_banned_cache
                            setTimeout(f, 60000)    # cache db lookups for 1 minute
                            cb()
            (cb) =>
                if opts.email_address?
                    email_address = opts.email_address
                    cb()
                else
                    dbg("determining email address from account id")
                    @select_one
                        table   : 'accounts'
                        columns : ['email_address']
                        cb      : (err, result) =>
                            if err
                                cb(err); return
                            email_address = result[0]
                            cb()
        ], (err) =>
            if err
                opts.cb(err)
            else
                # finally -- check if is banned
                opts.cb(undefined, banned_accounts[misc.canonicalize_email_address(email_address)]==true)
        )

    ban_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            cb            : undefined
        @update
            table  : 'banned_email_addresses'
            set    : {dummy : true}
            where  : {email_address : misc.canonicalize_email_address(opts.email_address)}
            cb     : (err) => opts.cb?(err)

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or false) -- true if account exists; err = problem with db connection...

        opts.email_address = misc.lower_email_address(opts.email_address)   # canonicalize the email address
        @select
            table     : 'email_address_to_account_id'
            where     : {email_address:opts.email_address}
            columns   : ['account_id']
            objectify : false
            cb        : (err, results) =>
                if err
                    opts.cb(err)
                else
                    if results.length == 0
                        opts.cb(false, false)
                    else
                        opts.cb(false, results[0][0])

    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined   # if given, adds this action; if not given cb(err, [array of actions])
            ttl           : undefined
            cb            : required
        if opts.action?
            if opts.ttl?
                ttl = "USING ttl #{opts.ttl}"
            else
                ttl = ""
            query = "UPDATE account_creation_actions #{ttl} SET actions=actions+{?} WHERE email_address=?"
            @cql(query, [misc.to_json(opts.action), opts.email_address], opts.cb)
        else
            @select
                table     : 'account_creation_actions'
                where     : {email_address: opts.email_address}
                columns   : ['actions']
                objectify : false
                cb        : (err, results) =>
                    if err
                        opts.cb(err)
                    else
                        opts.cb(false, (misc.from_json(r[0]) for r in results))

    update_account_settings: (opts={}) ->
        opts = defaults opts,
            account_id : required
            settings   : required
            cb         : required

        async.series([
            # We treat email separately, since email must be unique,
            # but Cassandra does not have a unique col feature.
            (cb) =>
                if opts.settings.email_address?
                    @change_email_address
                        account_id    : opts.account_id
                        email_address : opts.settings.email_address
                        cb : (error, result) ->
                            if error
                                opts.cb(error)
                                cb(true)
                            else
                                delete opts.settings.email_address
                                cb()
                else
                    cb()
            # make all the non-email changes
            (cb) =>
                @update
                    table      : 'accounts'
                    where      : {'account_id':opts.account_id}
                    set        : opts.settings
                    json       : ['terminal', 'editor_settings', 'other_settings']
                    cb         : (error, result) ->
                        opts.cb(error, result)
                        cb()
        ])


    change_password: (opts={}) ->
        opts = defaults(opts,
            account_id    : required
            password_hash : required
            cb            : undefined
        )
        @update(
            table   : 'accounts'
            where   : {account_id:opts.account_id}
            set     : {password_hash: opts.password_hash}
            cb      : opts.cb
        )

    # Change the email address, unless the email_address we're changing to is already taken.
    change_email_address: (opts={}) =>
        opts = defaults opts,
            account_id    : required
            email_address : required
            cb            : undefined

        dbg = (m) -> winston.debug("change_email_address(#{opts.account_id}, #{opts.email_address}): #{m}")
        dbg()

        orig_address = undefined
        opts.email_address = misc.lower_email_address(opts.email_address)

        async.series([
            (cb) =>
                dbg("verify that email address is not already taken")
                @count
                    table   : 'email_address_to_account_id'
                    where   : {email_address : opts.email_address}
                    cb      : (err, result) =>
                        if err
                            cb(err); return
                        if result > 0
                            cb('email_already_taken')
                        else
                            cb()
            (cb) =>
                dbg("get old email address")
                @select_one
                    table : 'accounts'
                    where : {account_id : opts.account_id}
                    columns : ['email_address']
                    cb      : (err, result) =>
                        if err
                            cb(err)
                        else
                            orig_address = result[0]
                            cb()
            (cb) =>
                dbg("change in accounts table")
                @update
                    table   : 'accounts'
                    where   : {account_id    : opts.account_id}
                    set     : {email_address : opts.email_address}
                    cb      : cb
            (cb) =>
                dbg("add new one")
                @update
                    table : 'email_address_to_account_id'
                    set   : {account_id : opts.account_id}
                    where : {email_address: opts.email_address}
                    cb    : cb
            (cb) =>
                dbg("delete old address in email_address_to_account_id")
                @delete
                    table : 'email_address_to_account_id'
                    where : {email_address: orig_address}
                    cb    : (ignored) => cb()

        ], (err) =>
            if err == "nothing to do"
                opts.cb?()
            else
                opts.cb?(err)
        )



    #####################################
    # User Feedback
    #####################################
    report_feedback: (opts={}) ->
        opts = defaults opts,
            account_id:  undefined
            category:        required
            description: required
            data:        required
            nps:         undefined
            cb:          undefined

        feedback_id = uuid.v4()
        time = now()
        @update
            table : "feedback"
            where : {feedback_id:feedback_id}
            json  : ['data']
            set   : {account_id:opts.account_id, time:time, category: opts.category, description: opts.description, nps:opts.nps, data:opts.data}
            cb    : opts.cb

    get_all_feedback_from_user: (opts={}) ->
        opts = defaults opts,
            account_id : required
            cb         : undefined

        @select
            table     : "feedback"
            where     : {account_id:opts.account_id}
            columns   : ['time', 'category', 'data', 'description', 'status', 'notes', 'url']
            json      : ['data']
            objectify : true
            cb        : opts.cb

    get_all_feedback_of_category: (opts={}) ->
        opts = defaults opts,
            category      : required
            cb        : undefined
        @select
            table     : "feedback"
            where     : {category:opts.category}
            columns   : ['time', 'account_id', 'data', 'description', 'status', 'notes', 'url']
            json      : ['data']
            objectify : true
            cb        : opts.cb


    #############
    # Plans
    ############
    create_plan: (opts={}) ->
        opts = defaults(opts,  name:undefined, cb:undefined)
        @update
            table : 'plans'
            where : {plan_id:uuid.v4()}
            set   : {name:opts.name, created:now()}
            cb    : opts.cb

    plan: (opts={}) ->
        opts = defaults(opts,  id:undefined, columns:[], cb:undefined)
        @select(table:'plans', columns:columns, where:{plan_id:id}, cb:opts.cb)

    current_plans: (opts={}) ->
        opts = defaults(columns:[], cb:undefined)
        @select(table:'plans', columns:opts.columns, where:{current:true}, cb:opts.cb)


    #############
    # Tracking file access
    ############
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        date = new Date()
        @update
            table : 'file_access_log'
            set   :
                filename : opts.filename
            where :
                day        : date.toISOString().slice(0,10)
                timestamp  : to_iso(date)
                project_id : opts.project_id
                account_id : opts.account_id
            cb : opts.cb

    # Get all files accessed in all projects
    get_file_access: (opts) =>
        opts = defaults opts,
            day    : required    # GMT string year-month-day
            start  : undefined   # start time on that day in iso format
            end    : undefined   # end time on that day in iso format
            cb     : required
        where = {day:opts.day, timestamp:{}}
        if opts.start?
            where.timestamp['>='] = opts.start
        if opts.end?
            where.timestamp['<='] = opts.end
        if misc.len(where.timestamp) == 0
            delete where.timestamp
        console.log("where = #{misc.to_json(where)}")
        @select
            table   : 'file_access_log'
            columns : ['day', 'timestamp', 'account_id', 'project_id', 'filename']
            where   : where
            cb      : opts.cb


    #############
    # Projects
    ############
    #
    get_gitconfig: (opts) ->
        opts = defaults opts,
            account_id : required
            cb         : required
        @select
            table      : 'accounts'
            columns    : ['gitconfig', 'first_name', 'last_name', 'email_address']
            objectify  : true
            where      : {account_id : opts.account_id}
            cb         : (err, results) ->
                if err
                    opts.cb(err)
                else if results.length == 0
                    opts.cb("There is no account with id #{opts.account_id}.")
                else
                    r = results[0]
                    if r.gitconfig? and r.gitconfig.length > 0
                        gitconfig = r.gitconfig
                    else
                        # Make a github out of first_name, last_name, email_address
                        gitconfig = "[user]\n    name = #{r.first_name} #{r.last_name}\n    email = #{r.email_address}\n"
                    opts.cb(false, gitconfig)

    get_project_data: (opts) =>
        opts = defaults opts,
            project_id : required
            columns    : required
            objectify  : false
            cb         : required
        @select_one
            table   : 'projects'
            where   : {project_id: opts.project_id}
            columns : opts.columns
            objectify : opts.objectify
            json    : ['quota', 'location']
            cb      : opts.cb

    # get map {project_group:[{account_id:?,first_name:?,last_name:?}], ...}
    get_project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            groups     : PROJECT_GROUPS
            cb         : required

        groups = undefined
        names = undefined
        async.series([
            # get account_id's of all users
            (cb) =>
                @get_project_data
                    project_id : opts.project_id
                    columns    : opts.groups
                    objectify  : false
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
                v = _.flatten(groups)
                @account_ids_to_usernames
                    account_ids : v
                    cb          : (err, _names) =>
                        names = _names
                        cb(err)
        ], (err) =>
            if err
                opts.cb(err)
            else
                r = {}
                i = 0
                for g in opts.groups
                    r[g] = []
                    for account_id in groups[i]
                        x = names[account_id]
                        if x?
                            r[g].push({account_id:account_id, first_name:x.first_name, last_name:x.last_name})
                    i += 1
                opts.cb(false, r)
        )

    # linked projects
    linked_projects: (opts) =>
        opts = defaults opts,
            project_id : required
            add        : undefined   # array if given
            remove     : undefined   # array if given
            cb         : required    # if neither add nor remove are specified, then cb(err, list of linked project ids)
        list = undefined
        dbg = (m) -> winston.debug("linked_projects: #{m}")
        async.series([
            (cb) =>
                if not opts.add?
                    cb(); return
                for x in opts.add
                    if not misc.is_valid_uuid_string(x)
                        cb("invalid uuid '#{x}'")
                        return
                #TODO: I don't know how to put variable number of params into a @cql call
                query = "UPDATE projects SET linked_projects=linked_projects+{#{opts.add.join(',')}} where project_id=?"
                #dbg("add query: #{query}")
                @cql(query, [opts.project_id], cb)
            (cb) =>
                if not opts.remove?
                    cb(); return
                for x in opts.remove
                    if not misc.is_valid_uuid_string(x)
                        cb("invalid uuid '#{x}'")
                        return
                query = "UPDATE projects SET linked_projects=linked_projects-{#{opts.remove.join(',')}} where project_id=?"
                #dbg("remove query: #{query}")
                @cql(query, [opts.project_id], cb)
            (cb) =>
                if opts.add? or opts.remove?
                    cb(); return
                @select_one
                    table   : 'projects'
                    where   : {'project_id':opts.project_id}
                    columns : ['linked_projects']
                    objectify : false
                    cb      : (err, result) =>
                        if err
                            cb(err)
                        else
                            list = result[0]
                            cb()
        ], (err) => opts.cb(err, list))

    # TODO: REWRITE THE function below (and others) to use get_project_data above.
    _get_project_location: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @select
            table   : 'projects'
            where   : {project_id: opts.project_id}
            columns : ['location','title']   # include title to avoid situation when location is null.
            json    : ['location']
            cb : (err, results) ->
                if err
                    opts.cb(err)
                else if results.length == 0
                    opts.cb("There is no project with ID #{opts.project_id}.")  # error
                else
                    location = results[0][0]
                    # We also support "" for the host not being
                    # defined, since some drivers might not
                    # support setting a column to null.
                    if not location
                        location = undefined
                    opts.cb(false, location)

    # Caching wrapper around _get_project_location
    # Right now projects *can't* move, so caching their location makes a lot of sense.
    get_project_location: (opts) =>
        opts = defaults opts,
            project_id  : required
            allow_cache : false # if false, will always get location from database; client can use this to first try cached version and if fails, use;  since projects can move, caching is a very bad idea.
            cb          : required
        if not @_project_location_cache?
            @_project_location_cache = {'array':[], 'obj':{}}
        if opts.allow_cache
            location = @_project_location_cache.obj[opts.project_id]
            if location?
                opts.cb(false, location)
                return
        @_get_project_location
            project_id : opts.project_id
            cb         : (err, location) =>
                if err
                    opts.cb(err)
                else
                    @_project_location_cache.obj[opts.project_id] = location
                    @_project_location_cache.array.push(opts.project_id)
                    while @_project_location_cache.array.length > 1 # TODO!!!! make bigger -- this is just for testing.
                        delete @_project_location_cache.obj[@_project_location_cache.array.shift()]
                    opts.cb(false, location)


    set_project_location: (opts) ->
        opts = defaults opts,
            project_id : required
            location   : required    # "" means "not deployed anywhere" -- see get_project_location above.
            ttl        : undefined   # used when deploying
            cb         : undefined
        @update
            table : 'projects'
            json  : ['location']
            ttl   : opts.ttl
            set   :
                location : opts.location
            where :
                project_id : opts.project_id
            cb    : opts.cb

    is_project_being_opened: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @uuid_value_store(name:'project_open_lock').get(uuid:opts.project_id, cb:opts.cb)

    lock_project_for_opening: (opts) ->
        opts = defaults opts,
            project_id : required
            ttl        : required
            cb         : required
        @uuid_value_store(name:'project_open_lock').set(uuid:opts.project_id, value:true, ttl:opts.ttl, cb:opts.cb)

    remove_project_opening_lock: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : undefined
        @uuid_value_store(name:'project_open_lock').delete(uuid:opts.project_id, cb:opts.cb)


    is_project_being_saved: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @uuid_value_store(name:'project_save_lock').get(uuid:opts.project_id, cb:opts.cb)

    lock_project_for_saving: (opts) ->
        opts = defaults opts,
            project_id : required
            ttl        : required
            cb         : required
        @uuid_value_store(name:'project_save_lock').set(uuid:opts.project_id, value:true, ttl:opts.ttl, cb:opts.cb)

    remove_project_saving_lock: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : undefined
        @uuid_value_store(name:'project_save_lock').delete(uuid:opts.project_id, cb:opts.cb)

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30 seconds (per project).  In particular,
    # once called, it ignores subsequent calls for the same project for 30 seconds.
    touch_project: (opts) ->
        opts = defaults opts,
            project_id : required
            size       : undefined
            cb         : undefined

        id = opts.project_id
        tm = @_touch_project_cache[id]
        if tm?
            if misc.walltime(tm) < 30
                opts.cb?()
                return
            else
                delete @_touch_project_cache[id]

        @_touch_project_cache[id] = misc.walltime()

        # Try to make a snapshot (will not make them too frequently) if the project is *not* currently being replicated
        storage.snapshot
            project_id              : opts.project_id
            only_if_not_replicating : true  # since making snapshots can mess up replication

        set = {last_edited: now()}
        if opts.size
            set.size = opts.size

        @update
            table : 'projects'
            set   : set
            where : {project_id : opts.project_id}
            cb    : (err, result) =>
                if err
                    opts.cb?(err); return
                f = (t, cb) =>
                    @update
                        table : 'recently_modified_projects'
                        set   : {dummy:true}
                        where : {ttl:t.desc, project_id : opts.project_id}
                        # This ttl should be substantially bigger than the snapshot_interval
                        # in snap.coffee, but not too long to make the query and search of
                        # everything in this table slow.
                        ttl   : t.ttl
                        cb    : cb
                async.map(RECENT_TIMES_ARRAY, f, (err) -> opts.cb?(err))

    # Return all projects that were active in the last week, but *not* active in the last ttl seconds,
    # whose status is not 'closed'.
    stale_projects: (opts) =>
        opts = defaults opts,
            ttl     : 60*60*24   # time in seconds (up to a week)
            cb      : required
        dbg = (m) -> winston.debug("database stale_projects(#{opts.ttl}): #{m}")

        project_ids = undefined
        t = misc.mswalltime() - opts.ttl*1000  # cassandra timestamps come back in ms since UTC epoch
        ans = undefined
        async.series([
            (cb) =>
                @select
                    table   : 'recently_modified_projects'
                    where   : {ttl:'week'}
                    limit   : 100000   # TODO: something better when we have 100,000 weekly users...
                    columns : ['project_id']
                    cb      : (err, v) =>
                        if err
                            cb(err)
                        else
                            project_ids = (x[0] for x in v)
                            dbg("got #{project_ids.length} project id's in last week")
                            cb()
            (cb) =>
                @select
                    table   : 'projects'
                    where   : {'project_id':{'in':project_ids}}
                    columns : ['project_id', 'location', 'last_edited', 'timeout_disabled', 'status']
                    cb      : (err, v) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{v.length} matching projects")
                            ans = ({'project_id':x[0], 'location':misc.from_json(x[1]), 'last_edited':x[2]} for x in v when x[1] and x[2] <= t and not x[3] and x[4] != 'closed')
                            dbg("of these #{ans.length} are open but old.")
                            cb()
        ], (err) =>
            if err
                dbg("error -- #{err}")
            opts.cb(err, ans)
        )

    create_project: (opts) ->
        opts = defaults opts,
            project_id  : required
            account_id  : required  # owner
            title       : required
            location    : undefined
            description : undefined  # optional
            public      : required
            quota       : required
            idle_timeout: required
            cb          : required

        async.series([
            # add entry to projects table
            (cb) =>
                @update
                    table : 'projects'
                    set   :
                        account_id  : opts.account_id
                        title       : opts.title
                        location    : opts.location
                        last_edited : now()
                        description : opts.description
                        public      : opts.public
                        quota       : opts.quota
                        status      : 'new'
                    where : {project_id: opts.project_id}
                    json  : ['quota', 'location']
                    cb    : (error, result) ->
                        if error
                            opts.cb(error)
                            cb(true)
                        else
                            cb()
            # add account_id as owner of project (modifies both project and account records).
            (cb) =>
                @add_user_to_project
                    project_id : opts.project_id
                    account_id : opts.account_id
                    group      : 'owner'
                    cb         : cb
            # increment number of projects counter
            (cb) =>
                @update_table_counter
                    table : 'projects'
                    delta : 1
                    cb    : cb
        ], opts.cb)

    # DEPRECATED
    set_all_project_owners_to_users: (cb) =>
        # DELETE THIS: This is solely due fix some database consistency issues... -- that said, this
        # is a deprecated table anyways, so this can be deleted soon.
        @select
            table: 'projects'
            limit: 100000
            columns: ['project_id', 'account_id']
            objectify: false
            cb: (err, results) =>
                 f = (r, cb) =>
                     if not r[0]? or not r[1]?
                          console.log("skipping", r)
                          cb()
                          return
                     @update
                         table : 'project_users'
                         set   :
                               mode : 'owner'
                         where :
                               project_id : r[0]
                               account_id : r[1]
                         cb: cb
                 async.map(results, f, cb)

    undelete_project: (opts) ->
        opts = defaults opts,
            project_id  : required
            cb          : undefined
        @update
            table : 'projects'
            set   : {deleted:false}
            where : {project_id : opts.project_id}
            cb    : opts.cb

    delete_project: (opts) ->
        opts = defaults opts,
            project_id  : required
            cb          : undefined
        @update
            table : 'projects'
            set   : {deleted:true}
            where : {project_id : opts.project_id}
            cb    : opts.cb

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
        e = @_verify_project_user(opts)
        if e
            opts.cb(e); return
        async.series([
            # add account_id to the project's set of users (for the given group)
            (cb) =>
                query = "UPDATE projects SET #{opts.group}=#{opts.group}+{?} WHERE project_id=?"
                @cql(query, [opts.account_id, opts.project_id], cb)
            # add project_id to the set of projects (for the given group) for the user's account
            (cb) =>
                query = "UPDATE accounts SET #{opts.group}=#{opts.group}+{?} WHERE account_id=?"
                @cql(query, [opts.project_id, opts.account_id], cb)
        ], opts.cb)

    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)
        e = @_verify_project_user(opts)
        if e
            opts.cb(e); return
        async.series([
            # remove account_id from the project's set of users (for the given group)
            (cb) =>
                query = "UPDATE projects SET #{opts.group}=#{opts.group}-{?} WHERE project_id=?"
                @cql(query, [opts.account_id, opts.project_id], cb)
            # remove project_id from the set of projects (for the given group) for the user's account
            (cb) =>
                query = "UPDATE accounts SET #{opts.group}=#{opts.group}-{?} WHERE account_id=?"
                @cql(query, [opts.project_id, opts.account_id], cb)
        ], opts.cb)

    # SINGLE USE ONLY:
    # This code below is *only* used for migrating from the project_users table to a
    # denormalized representation using the PROJECT_GROUPS collections.
    migrate_from_deprecated_project_users_table: (cb) =>
        results = undefined
        async.series([
            (cb) =>
                console.log("Load entire project_users table into memory")
                @select
                    table     : 'project_users'
                    limit     : 1000000
                    columns   : ['project_id', 'account_id', 'mode', 'state']
                    objectify : true
                    cb        : (err, _results) =>
                        results = _results
                        cb(err)
            (cb) =>
                console.log("For each row in the table, call add_user_to_project")
                f = (r, c) =>
                    console.log(r)
                    group = r.mode
                    if r.state == 'invited'
                        group = 'invited_' + group
                    @add_user_to_project
                        project_id : r.project_id
                        account_id : r.account_id
                        group      : group
                        cb         : c
                # note -- this does all bazillion in parallel :-)
                async.map(results, f, cb)
        ], cb)

    # cb(err, true if user is in one of the groups)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            groups     : required  # array of elts of PROJECT_GROUPS above
            cb         : required  # cb(err)
        @get_project_data
            project_id : opts.project_id
            columns    : opts.groups
            objectify  : false
            cb         : (err, result) ->
                if err
                    opts.cb(err)
                else
                    opts.cb(false, opts.account_id in _.flatten(result))

    # all id's of projects having anything to do with the given account
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        @select_one
            table     : 'accounts'
            columns   : PROJECT_GROUPS
            where     : {account_id : opts.account_id}
            objectify : false
            cb        : (err, result) ->
                if err
                    opts.cb(err); return
                v = []
                for r in result
                    if r?
                        v = v.concat(r)
                opts.cb(false, v)

    # gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets all data about them, not just id's
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            collabs_as_names : true       # replace all account_id's of project collabs with their user names.
            cb               : required

        ids = undefined
        projects = undefined
        async.series([
            (cb) =>
                @get_project_ids_with_user
                    account_id : opts.account_id
                    cb         : (err, r) =>
                        ids = r
                        cb(err)
            (cb) =>
                @get_projects_with_ids
                    ids : ids
                    cb  : (err, _projects) =>
                        projects = _projects
                        cb(err)
            (cb) =>
                if not opts.collabs_as_names
                    cb(); return
                account_ids = []
                for p in projects
                    for group in PROJECT_GROUPS
                        if p[group]?
                            for id in p[group]
                                account_ids.push(id)
                @account_ids_to_usernames
                    account_ids : account_ids
                    cb          : (err, usernames) =>
                        if err
                            cb(err); return
                        for p in projects
                            for group in PROJECT_GROUPS
                                if p[group]?
                                    p[group] = ({first_name:usernames[id].first_name, last_name:usernames[id].last_name, account_id:id} for id in p[group] when usernames[id]?)
                        cb()
        ], (err) =>
                opts.cb(err, projects)
        )

    get_projects_with_ids: (opts) ->
        opts = defaults opts,
            ids : required   # an array of id's
            cb  : required

        if opts.ids.length == 0  # easy special case -- don't bother to query db!
            opts.cb(false, [])
            return

        @select
            table     : 'projects'
            json      : ['location', 'quota']
            columns   : PROJECT_COLUMNS
            objectify : true
            where     : { project_id:{'in':opts.ids} }
            cb        : (error, results) ->
                if error
                    opts.cb(error)
                else

                    for r in results
                        # fill in a default name for the project -- used in the URL
                        if not r.name and r.title?
                            r.name = misc.make_valid_name(r.title)
                    opts.cb(false, results)

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @select
            table      : 'projects'
            columns    : (c for c in PROJECT_COLUMNS when c.indexOf('invited') == -1)
            where      : { project_id : opts.project_id }
            cb         : (err, results) =>
                if err?
                    opts.cb(err)
                else
                    v = []
                    for r in results
                        v = v.concat(r)
                    opts.cb(false, v)

    get_project_open_info: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @select
            table      : 'projects'
            columns    : ['quota', 'idle_timeout']
            json       : ['quota']
            objectify  : true
            cb         : (err, results) ->
                if err
                    opts.cb(err)
                else if results.length == 0
                    opts.cb("No project in the database with id #{project_id}")
                else
                    opts.cb(false, results[0])

    # DEPRECATED
    get_project_bundles: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required

        @select
            table      : 'project_bundles'
            columns    : ['filename', 'bundle']
            where      : { project_id:opts.project_id }
            cb         : (err, results) ->
                if err
                    opts.cb(err)
                else
                    v = []
                    for r in results
                        v.push([r[0], new Buffer(r[1], 'hex')])
                    opts.cb(err, v)

    # DEPRECATED
    get_project_bundle_filenames: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required

        @select
            table      : 'project_bundles'
            columns    : ['filename']
            where      : { project_id:opts.project_id }
            cb         : opts.cb

    # DEPRECATED
    save_project_bundle: (opts) ->
        opts = defaults opts,
            project_id : required
            filename   : required
            bundle     : required
            cb         : required

        @update
            table      : 'project_bundles'
            set        :
                bundle : opts.bundle.toString('hex')
            where      :
                project_id : opts.project_id
                filename   : opts.filename
            cb         : opts.cb

    # Get array of uuid's all *all* projects in the database
    get_all_project_ids: (opts) =>   # cb(err, [project_id's])
        opts = defaults opts,
            cb      : required
            deleted : false     # by default, only return non-deleted projects
        @select
            table   : 'projects'
            columns : ['project_id', 'deleted']
            cb      : (err, results) =>
                if err
                    opts.cb(err)
                else
                    if not opts.deleted  # can't do this with a query given current data model.
                        ans = (r[0] for r in results when not r[1])
                    else
                        ans = (r[0] for r in results)
                    opts.cb(false, ans)

    update_project_count: (cb) =>
        @count
            table : 'projects'
            cb    : (err, value) =>
                @set_table_counter
                    table : 'projects'
                    value : value
                    cb    : cb

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
        stats = {timestamp:moment(new Date()).format('YYYY-MM-DD-HHmmss') }
        cached_answer = undefined
        async.series([
            (cb) =>
                @select
                    table     : 'stats_cache'
                    where     : {dummy:true}
                    objectify : true
                    json      : ['hub_servers']
                    columns   : [ 'timestamp', 'accounts', 'projects', 'active_projects',
                                  'last_day_projects', 'last_week_projects',
                                  'last_month_projects', 'snap_servers', 'hub_servers']
                    cb        : (err, result) =>
                        if err
                            cb(err)
                        else if result.length == 0 # nothing in cache
                            cb()
                        else
                            # done
                            cached_answer = result[0]
                            # don't do anything else
                            cb(true)
            (cb) =>
                @get_table_counter
                    table : 'accounts'
                    cb    : (err, val) =>
                        stats.accounts = val
                        cb(err)
            (cb) =>
                @get_table_counter
                    table : 'projects'
                    cb    : (err, val) =>
                        stats.projects = val
                        cb(err)
            (cb) =>
                @count
                    table : 'recently_modified_projects'
                    where : {ttl : 'short'}
                    cb    : (err, val) =>
                        stats.active_projects = val
                        cb(err)
            (cb) =>
                @count
                    table : 'recently_modified_projects'
                    where : {ttl : 'day'}
                    cb    : (err, val) =>
                        stats.last_day_projects = val
                        cb(err)
            (cb) =>
                @count
                    table : 'recently_modified_projects'
                    where : {ttl : 'week'}
                    cb    : (err, val) =>
                        stats.last_week_projects = val
                        cb(err)
            (cb) =>
                @count
                    table : 'recently_modified_projects'
                    where : {ttl : 'month'}
                    cb    : (err, val) =>
                        stats.last_month_projects = val
                        cb(err)
            (cb) =>
                @count
                    table : 'snap_servers'
                    where : {dummy:true}
                    cb    : (err, val) =>
                        stats.snap_servers = val
                        cb(err)
            (cb) =>
                @select
                    table     : 'hub_servers'
                    columns   : ['host', 'port', 'clients']
                    objectify : true
                    where     : {dummy: true}
                    cb    : (err, val) =>
                        stats.hub_servers = val
                        cb(err)
            (cb) =>
                @update
                    table : 'stats'
                    set   : stats
                    json  : ['hub_servers']
                    where : {time:now()}
                    cb    : cb
            (cb) =>
                @update
                    table : 'stats_cache'
                    set   : stats
                    where : {dummy : true}
                    json  : ['hub_servers']
                    ttl   : opts.ttl
                    cb    : cb
            (cb) =>
                # store result in a cache
                cb()
        ], (err) =>
            if cached_answer?
                opts.cb(false, cached_answer)
            else
                opts.cb(err, stats)
        )

############################################################################
# Chunked project-by-project storage for each project.
# Store arbitrarily large blob data associated to each project here.
# This uses the storage and storage_blob tables.
############################################################################

class ChunkedStorage

    constructor: (@db, @project_id) ->
        @dbg("constructor", undefined, 'create')

    dbg: (f, args, m) =>
        winston.debug("ChunkedStorage(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    put_file: (opts) =>
        opts = defaults opts,
            name          : required
            path          : required   # actual absolute or relative path to the file
            chunk_size_mb : 200        # 200MB -- file is
            limit         : 3          # max number of chunks to save at once
            cb            : undefined
        dbg = (m) => @dbg('put_file', [opts.name, opts.path], m)

        file_size  = undefined
        chunk_size = opts.chunk_size_mb * 1000000
        fd         = undefined
        names      = undefined
        async.series([
            (cb) =>
                dbg("delete previous file with same name if there")
                @delete_file
                    name       : opts.name
                    limit      : opts.limit
                    cb         : cb
            (cb) =>
                dbg("determine file size")
                fs.stat opts.path, (err, stats) =>
                    if err
                        cb(err)
                    else
                        file_size = stats.size
                        cb()
            (cb) =>
                fs.open opts.path, 'r', (err, _fd) =>
                    if err
                        cb(err)
                    else
                        fd = _fd
                        cb()
            (cb) =>
                num_chunks = Math.ceil(file_size / chunk_size)
                # changing names this will break anything stored in DB, so don't do it:
                names = ("files.#{opts.name}-#{i}-#{num_chunks-1}" for i in [0...num_chunks])
                dbg("creating #{misc.to_json(names)}")
                f = (i, c) =>
                    dbg("reading and store chunk #{i}/#{num_chunks-1}")
                    start = i*chunk_size
                    end   = Math.min(file_size, (i+1)*chunk_size)  # really ends at pos one before this.
                    buffer = new Buffer(end-start)
                    fs.read fd, buffer, 0, buffer.length, start, (err) =>
                        @put
                            name : names[i]
                            blob : buffer
                            cb   : c
                async.mapLimit [0...num_chunks], opts.limit, f, cb
            (cb) =>
                n = misc.to_json(names).replace(/"/g, "'")
                @db.cql("UPDATE file_storage SET storage_chunk_names=#{n} WHERE project_id=#{@project_id} AND name='#{opts.name}'",
                        [], cb)
        ], (err) =>
            if err and names?
                # clean up -- attempt to delete everything
                g = (name, c) =>
                    @delete(name:name, cb:(ignore)=>c())
                async.map(names, g, (ignore) => opts.cb?(err))
            else
                opts.cb?(err)
        )

    get_file: (opts) =>
        opts = defaults opts,
            name       : required
            path       : undefined
            limit      : 3            # max number of chunks to read at once
            cb         : required
        dbg = (m) => @dbg('get_file', [opts.name, opts.path], m)

    delete_file: (opts) =>
        opts = defaults opts,
            name       : required
            limit      : 3           # number to delete at once
            cb         : undefined
        dbg = (m) => @dbg('delete_file', opts.name, m)

    put: (opts) =>
        opts = defaults opts,
            name          : required
            blob          : required   # Buffer
            chunk_size_mb : 10         # 10MB
            limit         : 20         # max number of chunks to save at once
            cb            : undefined
        dbg = (m) => @dbg('put', opts.name, m)
        dbg("divide blob of length #{opts.blob.length/1000000}mb into chunks of size at most #{opts.chunk_size_mb}")
        chunks   = []
        chunk_ids = []
        i = 0
        while i < opts.blob.length
            j = i + opts.chunk_size_mb*1000000
            chunk_ids.push(uuid.v4())
            chunks.push(opts.blob.slice(i, j))
            i = j
        async.series([
            (cb) =>
                # critical to delete first or we would leave stuff in storage_chunks just laying around never to be removed!
                @delete
                    name       : opts.name
                    limit      : opts.limit
                    cb         : cb
            (cb) =>
                b = "[#{chunk_ids.join(',')}]"
                dbg("save chunk ids: #{b}")
                @db.cql("UPDATE storage SET chunk_ids=#{b} WHERE project_id=#{@project_id} AND name='#{opts.name}'", [], cb)
            (cb) =>
                dbg("saving the chunks")
                f = (i, c) =>
                    t = misc.walltime()
                    chunk_id = chunk_ids[i]
                    chunk   = chunks[i]
                    @db.cql "UPDATE storage_chunks SET chunk=? WHERE chunk_id=#{chunk_id} AND project_id=#{@project_id}", [chunk], (err) =>
                        if err
                            c(err)
                        else
                            dbg("saved chunk #{i}/#{chunks.length-1} in #{misc.walltime(t)} s")
                            c()
                async.mapLimit([0...chunks.length], opts.limit, f, cb)
        ], (err) => opts.cb?(err))

    get: (opts) =>
        opts = defaults opts,
            name       : required
            limit      : 10         # max number of chunks to read at once
            cb         : required
        dbg = (m) => @dbg('get', opts.name, m)
        chunk_ids = undefined
        chunks = {}
        async.series([
            (cb) =>
                dbg("get chunk ids")
                @db.select_one
                    table     : 'storage'
                    where     : {project_id : @project_id, name : opts.name}
                    columns   : ['chunk_ids']
                    objectify : false
                    cb        : (err, result) =>
                        if err
                            cb(err)
                        else
                            chunk_ids = result[0]
                            dbg("chunk ids=#{misc.to_json(chunk_ids)}")
                            cb()
            (cb) =>
                dbg("get chunks")
                f = (i, c) =>
                    t = misc.walltime()
                    @db.select_one
                        table : 'storage_chunks'
                        where : {chunk_id:chunk_ids[i], project_id:@project_id}
                        columns : ['chunk']
                        objectify : false
                        cb        : (err, result) =>
                            if err
                                c(err)
                            else
                                dbg("got chunk #{i}/#{chunk_ids.length-1} in #{misc.walltime(t)} s")
                                chunks[chunk_ids[i]] = result[0]
                                c()
                async.mapLimit([0...chunk_ids.length], opts.limit, f, cb)
        ], (err) =>
            if err
                opts.cb(err)
            else
                blob = Buffer.concat( (chunks[chunk_id] for chunk_id in chunk_ids) )
                opts.cb(undefined, blob)
        )

    delete: (opts) =>
        opts = defaults opts,
            name       : required
            limit      : 10           # number to delete at once
            cb         : undefined
        dbg = (m) => @dbg('delete', opts.name, m)
        chunk_ids = undefined
        async.series([
            (cb) =>
                dbg("get chunk ids")
                @db.select
                    table     : 'storage'
                    where     : {project_id : @project_id, name : opts.name}
                    columns   : ['chunk_ids']
                    objectify : false
                    cb        : (err, result) =>
                        if err
                            cb(err)
                        else
                            if result.length > 0
                                chunk_ids = result[0][0]
                                dbg("chunk ids=#{misc.to_json(chunk_ids)}")
                            else
                                dbg("nothing there")
                            cb()
            (cb) =>
                if not chunk_ids?
                    cb(); return
                dbg("delete chunks")
                fail = false
                f = (i, c) =>
                    t = misc.walltime()
                    @db.delete
                        table : 'storage_chunks'
                        where : {chunk_id:chunk_ids[i], project_id:@project_id}
                        cb    : (err) =>
                            if err
                                fail = err
                                # nonfatal -- so at least all the other chunks get deleted, and next time this one does.
                                c()
                            else
                                dbg("deleted chunk #{i}/#{chunk_ids.length-1} in #{misc.walltime(t)} s")
                                c()
                async.mapLimit([0...chunk_ids.length], opts.limit, f, (err) -> cb(fail))
            (cb) =>
                if not chunk_ids?
                    cb(); return
                dbg("delete index")
                @db.delete
                    table : 'storage'
                    where : {project_id : @project_id, name : opts.name}
                    cb    : cb
        ], (err) => opts.cb?(err))


quote_if_not_uuid = (s) ->
    if misc.is_valid_uuid_string(s)
        return "#{s}"
    else
        return "'#{s}'"

array_of_strings_to_cql_list = (a) ->
    '(' + (quote_if_not_uuid(x) for x in a).join(',') + ')'

exports.db_test1 = (n, m) ->
    # Store n large strings of length m in the uuid:value store, then delete them.
    # This is to test how the database performs when hit by such load.

    value = ''
    possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for i in [1...m]
        value += possible.charAt(Math.floor(Math.random() * possible.length))

    S = exports.Salvus
    database = new S keyspace:'test', cb:() ->
        kv = database.key_value_store(name:'db_test1')

        tasks = []
        for i in [1...n]
            tasks.push (cb) ->
                console.log("set #{i}")
                kv.set(key:i, value:value, ttl:60, cb:cb)
        for i in [1...n]
            tasks.push (cb) ->
                console.log("delete #{i}")
                kv.delete(key:i, cb:cb)

        async.series tasks, (cb) ->
            console.log('done!')
