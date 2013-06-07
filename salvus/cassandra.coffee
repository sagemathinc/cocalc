#########################################################################
#
# Interface to the Cassandra Database.
#
# *ALL* DB queries (using CQL, etc.) should be in this file, with
# *Cassandra/CQL agnostic wrapper functions defined here.   E.g.,
# to find out if an email address is available, define a function
# here that does the CQL query.
#
# (c) William Stein, University of Washington
#
#########################################################################

# This is used for project servers.
MAX_SCORE = 3
MIN_SCORE = -3   # if hit, server is considered busted.

misc    = require('misc')
{to_json, from_json, to_iso, defaults} = misc
required = defaults.required

assert  = require('assert')
async   = require('async')
winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus
uuid    = require('node-uuid')
{EventEmitter} = require('events')


# the time right now, in iso format ready to insert into the database:
now = exports.now = () -> to_iso(new Date())

# the time ms milliseconds ago, in iso format ready to insert into the database:
exports.milliseconds_ago = (ms) -> to_iso(new Date(new Date() - ms))

exports.seconds_ago = (s) -> exports.milliseconds_ago(1000*s)

exports.minutes_ago = (m) -> exports.seconds_ago(60*m)

exports.hours_ago = (h) -> exports.minutes_ago(60*h)

exports.days_ago = (d) -> exports.hours_ago(24*d)

#########################################################################

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
    async.mapSeries(blocks, f, (err, results) ->
        winston.info("created schema in #{misc.walltime()-t} seconds.")
        winston.info(err)
        if not err
            # create default plan 0
            exports.create_default_plan(conn, (error, results) => cb(error) if error)

        cb(err)
    )




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

    # change the ttl of an existing entry -- requires re-insertion, which wastes network bandwidth...
    set_ttl: (opts) =>
        opts = defaults opts,
            uuid : required
            ttl  : 0         # no ttl
            cb   : undefined

        @get
            uuid : opts.uuid
            cb : (err, value) =>
                if err
                    opts.cb(err)
                else if value?
                    @set
                        uuid : opts.uuid
                        value : value      # note -- the implicit conversion between buf and string is *necessary*, sadly.
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
# want to use everywhere in Salvus. For example, uuids are converted to
# strings instead of their own special object type, since otherwise they
# convert to JSON incorrectly.

exports.from_cassandra = from_cassandra = (obj, json, timestamp) ->
    if not obj?
        return undefined

    value = obj.value
    if json
        value = from_json(value)
    else if value and value.hex?    # uuid de-mangle
        value = value.hex
    if timestamp
        return {timestamp:obj.timestamp, value:value}
    else
        return value

class exports.Cassandra extends EventEmitter
    constructor: (opts={}) ->    # cb is called on connect
        opts = defaults opts,
            hosts    : ['localhost']
            cb       : undefined
            keyspace : undefined
            timeout  : 3000

        @keyspace = opts.keyspace
        console.log("keyspace = #{opts.keyspace}")
        console.log("hosts = #{opts.hosts}")
        @conn = new helenus.ConnectionPool(
            hosts     :  opts.hosts
            keyspace  :  opts.keyspace
            timeout   :  opts.timeout
            cqlVersion: '3.0.0'
        )
        @conn.on('error', (err) =>
            winston.error(err.name, err.message)
            @emit('error', err)
        )

        @conn.connect (err) =>
            opts.cb?(err, @)

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
                        # !!!!!!!!!!!!!! potential CQL-injection attack  !!!!!!!!!!!
                        # TODO -- keep checking/complaining?:  in queries just aren't supported by helenus, at least as of Nov 17, 2012 ! :-(
                        where += "#{key} IN #{array_of_strings_to_cql_list(x2)}"
                    else if typeof(val) == 'boolean'
                        # work around a *MAJOR* driver bug :-(
                        # TODO: check if fixed in new Helenus driver...
                        # This is not a CQL-injection vector though, since we explicitly write out each case:
                        if x
                            where += "#{key} #{op} true"
                        else
                            where += "#{key} #{op} false"
                    else if misc.is_valid_uuid_string(x2)
                        # The Helenus driver is completely totally
                        # broken regarding uuid's (their own UUID type
                        # doesn't work at all). (as of April 15, 2013)
                        # This is of course scary/dangerous since what if x2 is accidentally a uuid!
                        where += "#{key} #{op} #{x2}"
                    else
                        where += "#{key} #{op} ?"
                        vals.push(x2)
                    where += " AND "
        return where.slice(0,-4)

    _set: (properties, vals, json=[]) ->
        set = "";
        for key, val of properties
            if key in json
                val = to_json(val)
            if val?  # only consider properties with defined values
                if misc.is_valid_uuid_string(val)
                    # The Helenus driver is completely totally
                    # broken regarding uuid's (their own UUID type
                    # doesn't work at all). (as of April 15, 2013)
                    # This is of course scary/dangerous since what if x2 is accidentally a uuid!
                    set += "#{key}=#{val},"
                else if typeof(val) != 'boolean'
                    set += "#{key}=?,"
                    vals.push(val)
                else
                    # TODO: here we work around a driver bug :-(
                    set += "#{key}=#{val},"
        return set.slice(0,-1)

    close: () ->
        @conn.close()
        @emit('close')

    count: (opts={}) ->
        opts = defaults(opts,  table:undefined, where:{}, cb:undefined)
        query = "SELECT COUNT(*) FROM #{opts.table}"
        vals = []
        if not misc.is_empty_object(opts.where)
            where = @_where(opts.where, vals)
            query += " WHERE #{where}"
        @cql(query, vals, (error, results) -> opts.cb?(error, results[0].get('count').value))

    update: (opts={}) ->
        opts = defaults opts,
            table     : required
            where     : {}
            set       : {}
            ttl       : 0
            cb        : undefined
            json      : []          # list of columns to convert to JSON
        vals = []
        set = @_set(opts.set, vals, opts.json)
        where = @_where(opts.where, vals, opts.json)
        @cql("UPDATE #{opts.table} USING ttl #{opts.ttl} SET #{set} WHERE #{where}", vals, opts.cb)

    delete: (opts={}) ->
        opts = defaults(opts,  table:undefined, where:{}, cb:undefined)
        vals = []
        where = @_where(opts.where, vals)
        @cql("DELETE FROM #{opts.table} WHERE #{where}", vals, opts.cb)

    select: (opts={}) ->
        opts = defaults opts,
            table     : required    # string -- the table to query
            columns   : required    # list -- columns to extract
            where     : undefined   # object -- conditions to impose; undefined = return everything
            cb        : required    # callback(error, results)
            objectify : false       # if false results is a array of arrays (so less redundant); if true, array of objects (so keys redundant)
            limit     : undefined   # if defined, limit the number of results returned to this integer
            json      : []          # list of columns that should be converted from JSON format
            timestamp : []          # list of columns to retrieve in the form {value:'value of that column', timestamp:timestamp of that column}
                                    # timestamp columns must not be part of the primary key
            order_by : undefined    # if given, adds an "ORDER BY opts.order_by"

        vals = []
        query = "SELECT #{opts.columns.join(',')} FROM #{opts.table}"
        if opts.where?
            where = @_where(opts.where, vals, opts.json)
            query += " WHERE #{where} "
        if opts.limit?
            query += " LIMIT #{opts.limit} "
        if opts.order_by?
            query += " ORDER BY #{opts.order_by} "
        @cql(query, vals,
            (error, results) ->
                if opts.objectify
                    x = (misc.pairs_to_obj([col,from_cassandra(r.get(col), col in opts.json, col in opts.timestamp)] for col in opts.columns) for r in results)
                else
                    x = ((from_cassandra(r.get(col), col in opts.json, col in opts.timestamp) for col in opts.columns) for r in results)
                opts.cb(error, x)
        )

    # Exactly like select (above), but gives an error if there is not exactly one
    # row in the table that matches the condition.
    select_one: (opts={}) ->
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

    cql: (query, vals, cb) ->
        #winston.debug("About to query db #{query}...")
        # TODO: sometimes allow filtering is needed -- TODO -- fix this to be a clearly specified option.
        if query.slice(0,6).toLowerCase() == 'select'
            query += '   ALLOW FILTERING'
        @conn.cql query, vals, (error, results) =>
            if error
                winston.error("Query cql('#{query}','params=#{vals}') caused a CQL error:\n#{error}")
            else
                #winston.debug("query completed")
            if error
                @emit('error', error)
            cb?(error, results)

    key_value_store: (opts={}) -> # key_value_store(name:"the name")
        new KeyValueStore(@, opts)

    uuid_value_store: (opts={}) -> # uuid_value_store(name:"the name")
        new UUIDValueStore(@, opts)

    uuid_blob_store: (opts={}) -> # uuid_blob_store(name:"the name")
        new UUIDBlobStore(@, opts)

class exports.Salvus extends exports.Cassandra
    constructor: (opts={}) ->
        if not opts.keyspace?
            opts.keyspace = 'salvus'
        super(opts)

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

    user_search: (opts) =>
        opts = defaults opts,
            query : required
            limit : undefined
            cb    : required

        # TODO: this obviously won't scale to a large number of users; we need a full-text search index
        # system for that, which will have to get written somehow...
        @select
            table     : 'accounts'
            columns   : ['first_name', 'last_name', 'account_id']
            objectify : true
            cb        : (err, results) =>
                if err
                    opts.cb(err)
                    return
                query = opts.query.toLowerCase().split(/\s+/g)
                match = (name) ->
                    name = name.toLowerCase()
                    for q in query
                        if name.indexOf(q) == -1
                            return false
                    return true
                r = []
                for x in results
                    if match(x.first_name + x.last_name)
                        r.push(x)
                        if opts.limit? and r.length >= opts.limit
                            break
                opts.cb(false, r)

    project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required   # (err, list of users)
        @select
            table     : 'project_users'
            columns   : ['account_id', 'mode', 'state']
            where     : {project_id : opts.project_id}
            objectify : true
            cb        : (err, results) =>
                if err
                    opts.cb(err)
                    return
                @account_ids_to_usernames
                    account_ids : (x.account_id for x in results)
                    cb          : (err, users) =>
                        if err
                            opts.cb(err)
                            return
                        for x in results
                            x.first_name = users[x.account_id].first_name
                            x.last_name = users[x.account_id].last_name
                        opts.cb(false, results)

    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
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
            where = {id:{'in':opts.server_ids}}
        else
            where = undefined

        @select
            table     : 'snap_servers'
            columns   : opts.columns
            where     : where
            objectify : true
            cb        : opts.cb

    # Return array of all *active* snap servers with the given commit.
    # The servers are the same format as output by snap_servers above.
    snap_servers_with_commit: (opts) =>
        opts = defaults opts,
            project_id : required
            timestamp  : required
            cb         : required   # (err, list of objects)

        server_ids = undefined
        servers    = undefined
        async.series([
            (cb) =>
                @select
                    table      : 'snap_commits'   # this query uses ALLOW FILTERING.
                    where      : {project_id : opts.project_id, timestamp : opts.timestamp}
                    columns    : ['server_id']
                    objectify  : false
                    cb         : (err, results) =>
                        if err
                            cb(err)
                        else
                            server_ids = (r[0] for r in results)
                            cb()
            (cb) =>
                @snap_servers
                    server_ids : server_ids
                    cb         : (err, _servers) =>
                        servers = _servers
                        cb(err)
        ], (err) => opts.cb(err, servers))

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
            where   : {running:true, score:{'>':opts.min_score}}
            cb      : (err, results) =>
                if results.length == 0 and @keyspace == 'test'
                    # This is used when testing the compute servers
                    # when not run as a daemon so there is not entry
                    # in the database.
                    opts.cb(err, [{host:'localhost', score:0}])
                else
                    opts.cb(err, {host:x[0], score:x[1]} for x in results)

    # cb(error, random running sage server) or if there are no running
    # sage servers, then cb(undefined).  We only consider servers whose
    # score is strictly greater than opts.min_score.
    random_compute_server: (opts={}) ->
        opts = defaults opts,
            cb        : required

        @running_compute_servers
            cb   : (error, res) ->
                opts.cb(error, if res.length == 0 then undefined else misc.random_choice(res))

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
                    where   : {host:opts.host}
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
                        where : {host  : opts.host}
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
    is_email_address_available: (email_address, cb) ->
        @count(table:"accounts", where:{email_address:email_address}, cb:(error, cnt) ->
            if error
                cb(error)
            else
                cb(null, cnt==0)
        )

    create_account: (opts={}) ->
        opts = defaults(opts,
            cb:undefined
            first_name    : required
            last_name     : required
            email_address : required
            password_hash : required
        )

        account_id = uuid.v4()
        a = {first_name:opts.first_name, last_name:opts.last_name, email_address:opts.email_address, password_hash:opts.password_hash, plan_id:DEFAULT_PLAN_ID}

        @update(
            table :'accounts'
            json  : []
            set   : a
            where : {account_id:account_id}
            cb    : (error, result) -> opts.cb?(error, account_id)
        )

        return account_id

    get_account: (opts={}) ->
        opts = defaults(opts,
            cb            : required
            email_address : undefined     # provide either email or account_id (not both)
            account_id    : undefined
            columns       : ['account_id', 'password_hash', 'first_name', 'last_name', 'email_address',
                             'plan_id', 'plan_starttime',
                             'default_system', 'evaluate_key',
                             'email_new_features', 'email_maintenance', 'enable_tooltips',
                             'connect_Github', 'connect_Google', 'connect_Dropbox',
                             'autosave', 'terminal']
        )
        where = {}
        if opts.account_id?
            where.account_id = opts.account_id
        if opts.email_address?
            where.email_address = opts.email_address

        @select
            table   : 'accounts'
            where   : where
            columns : opts.columns
            objectify : true
            json    : ['terminal']
            cb      : (error, results) ->
                if error
                    opts.cb(error)
                else if results.length != 1
                    if opts.account_id?
                        opts.cb("There is no account with account_id #{opts.account_id}.")
                    else
                        opts.cb("There is no account with email address #{opts.email_address}.")
                else
                    opts.cb(false, results[0])

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
                    json       : ['terminal']
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
    change_email_address: (opts={}) ->
        opts = defaults(opts,
            account_id    : required
            email_address : required
            cb            : undefined
        )

        # verify that email address is not already taken
        async.series([
            (cb) =>
                @count
                    table   : 'accounts'
                    where   : {email_address : opts.email_address}
                    cb      : (error, result) ->
                        if result > 0
                            opts.cb('email_already_taken')
                            cb(true)
                        else
                            cb()
            (cb) =>
                @update
                    table   : 'accounts'
                    where   : {account_id    : opts.account_id}
                    set     : {email_address : opts.email_address}
                    cb      : (error, result) ->
                        opts.cb(error, true)
                        cb()
        ])


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

    get_project_data: (opts) ->
        opts = defaults opts,
            project_id : required
            columns    : required
            cb         : required
        @select_one
            table   : 'projects'
            where   : {project_id: opts.project_id}
            columns : opts.columns
            json    : ['quota', 'location']
            cb      : opts.cb

    # TODO: REWRITE THE function below (and others) to use get_project_data above.
    get_project_location: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @select
            table   : 'projects'
            where   : {project_id: opts.project_id}
            columns : ['location']
            json    : ['location']
            cb : (err, results) ->
                if err
                    opts.cb(err)
                else if results.length == 0
                    opts.cb("There is no project with ID #{opts.project_id}.")  # error
                else
                    location = results[0][0]
                    # We also support "" for the host not being
                    # defined, since some drivers, e.g., cqlsh do not
                    # support setting a column to null.
                    if not location? or not location
                        location = undefined
                    opts.cb(false, location)

    set_project_location: (opts) ->
        opts = defaults opts,
            project_id : required
            location   : undefined   # undefined is meaningful, and means "not deployed anywhere" (as does "")
            cb         : undefined
        @update
            table : 'projects'
            json  : ['location']
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
    touch_project: (opts) ->
        opts = defaults opts,
            project_id : required
            location   : undefined
            size       : undefined
            cb         : undefined

        set = {last_edited: now()}
        if opts.size
            set.size = opts.size

        @update
            table : 'projects'
            set   : set
            where : {project_id : opts.project_id}
            cb    : (err, result) =>
                if err or not opts.location?
                    opts.cb?(err); return
                @update
                    table : 'recently_modified_projects'
                    json  : ['location']
                    set   : {location:opts.location}
                    where : {project_id : opts.project_id}
                    # This ttl should be substantially bigger than the snapshot_interval
                    # in snap.coffee, but not too long to make the query and search of
                    # everything in this table slow.
                    ttl   : 5*60   # 5 minutes -- just a guess; this may need tuning as Salvus grows!
                    cb    : opts.cb

    create_project: (opts) ->
        opts = defaults opts,
            project_id  : required
            account_id  : required  # owner
            title       : required
            location    : required
            description : undefined  # optional
            public      : required
            quota       : required
            idle_timeout: required
            cb          : undefined

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
                    where : {project_id: opts.project_id}
                    json  : ['quota', 'location']
                    cb    : (error, result) ->
                        if error
                            opts.cb(error)
                            cb(true)
                        else
                            cb()
            # add entry to project_users table
            (cb) =>
                @update
                    table : 'project_users'
                    set   :
                        mode       : 'owner'
                    where :
                        project_id : opts.project_id
                        account_id : opts.account_id
                    cb    : (error, result) ->
                        if error
                            opts.cb(error)
                            cb(true)
                        else
                            opts.cb(false)
                            cb()
        ])

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

        # This was an implementation of destructive deletion.  But this has no place in SMC, given
        # that we have numerous snapshots of all data of every project anyways!
        #async.series([
        #    (cb) =>
        #        @delete(table:'projects', where:{project_id : opts.project_id}, cb:cb)
        #    (cb) =>
        #        @delete(table:'project_users', where:{project_id : opts.project_id}, cb:cb)
        #], (err) ->
        #    if opts.cb?
        #        opts.cb(err)
        #)

    # gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets all data about them, not just id's
    get_projects_with_user: (opts) ->
        opts = defaults opts,
            account_id : required
            cb         : required

        projects = undefined  # array of pairs (project_id, mode)
        async.series([
            (cb) =>
                @select
                    table     : 'project_users'
                    columns   : ['project_id', 'mode']
                    where     : {account_id : opts.account_id}
                    objectify : false
                    cb        : (error, results) ->
                        if error
                            opts.cb(error)
                            cb(true)
                        else
                            projects = results
                            cb()
            (cb) =>
                @get_projects_with_ids
                    ids : (x[0] for x in projects)
                    cb  : (error, results) ->
                        if error
                            opts.cb(error)
                            cb(true)
                        else
                            # The following is a little awkward and is done this way only
                            # because of the potential for inconsistency in the database, e.g.,
                            # project_id's in the project_users table that shouldn't be there
                            # since the project was deleted but something nasty happened before
                            # everything else related to that project was deleted.
                            modes = {}
                            for p in projects
                                modes[p.project_id] = p.mode
                            for r in results
                                r.mode = modes[r.project_id]
                            opts.cb(false, results)
                            cb()
        ])

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
            columns   : ['project_id', 'account_id', 'title', 'last_edited', 'description', 'public', 'location', 'size', 'deleted']
            objectify : true
            where     : { project_id:{'in':opts.ids} }
            cb        : (error, results) ->
                if error
                    opts.cb(error)
                else
                    opts.cb(false, results)

    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required

        @select
            table      : 'project_users'
            columns    : ['account_id']
            where      : { project_id:opts.project_id }
            cb         : (error, results) ->
                if error
                    opts.cb(error)
                else
                    opts.cb(false, results)

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

    get_project_bundle_filenames: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required

        @select
            table      : 'project_bundles'
            columns    : ['filename']
            where      : { project_id:opts.project_id }
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
