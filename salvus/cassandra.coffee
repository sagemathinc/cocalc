
misc    = require('misc')
{to_json, from_json, to_iso, defaults} = misc

async   = require('async')
winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus
uuid    = require('node-uuid')
{EventEmitter} = require('events')


now = () -> to_iso(new Date())



#########################################################################

exports.create_schema = (conn, cb) ->
    t = misc.walltime()
    blocks = require('fs').readFileSync('db_schema.cql', 'utf8').split('CREATE')
    f = (s, cb) ->
        if s.length > 0
            conn.cql("CREATE "+s, [], (e,r)->console.log(e) if e; cb(null,0))
        else
            cb(null, 0)
    async.mapSeries(blocks, f, (err, results) ->
        winston.info("created schema in #{misc.walltime()-t} seconds.")
        cb(err))


class UUIDValueStore
    # c = new (require("cassandra").Salvus)(); s = c.uuid_value_store('sage'); u = c.uuid_value_store('user')
    # s.set(uuid:4, value:{address:'localhost', port:5000}, ttl:30, cb:console.log)
    # u.set(uuid:7, value:{address:'localhost', port:5000})
    # u.get(uuid:7, cb:console.log)
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts,  name:'default')
        
    set: (opts={}) ->
        opts = defaults(opts,  uuid:undefined, value:undefined, ttl:0, cb:undefined)
        opts.uuid = uuid.v4() if not opts.uuid?
        @cassandra.update(
            table:'uuid_value'
            where:{name:@opts.name, uuid:opts.uuid}
            set:{value:to_json(opts.value)}
            ttl:opts.ttl
            cb:opts.cb
        )
        return opts.uuid
        
    get: (opts={}) ->
        opts = defaults(opts, uuid:undefined, cb:undefined)
        @cassandra.select(
            table:'uuid_value'
            columns:['value']
            where:{name:@opts.name, uuid:opts.uuid}
            cb:(error, results) -> opts.cb(error, if results.length == 1 then from_json(results[0]))
        )
            
    delete: (opts={}) ->
        opts = defaults(opts, uuid:undefined, cb:undefined)
        @cassandra.delete(table:'uuid_value', where:{name:@opts.name, uuid:opts.uuid}, cb:opts.cb)
        
    delete_all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.delete(table:'uuid_value', where:{name:@opts.name}, cb:opts.cb)
        
    length: (opts={}) ->
        opts = defaults(opts,  cb:undefined)
        @cassandra.count(table:'uuid_value', where:{name:@opts.name}, cb:opts.cb)
        
    all: (opts={}) ->
        opts = defaults(opts,  cb:undefined)        
        @cassandra.select(
            table:'uuid_value'
            columns:['uuid', 'value']
            where:{name:@opts.name},
            cb:(err, results) ->
                obj = {}
                for r in results
                    obj[r[0]] = from_json(r[1])
                opts.cb(err, obj))

class KeyValueStore
    #   c = new (require("cassandra").Salvus)(); d = c.key_value_store('test')
    #   d.set(key:[1,2], value:[465, {abc:123, xyz:[1,2]}], ttl:5)
    #   d.get(key:[1,2], console.log)   # but call it again in > 5 seconds and get nothing...
    constructor: (@cassandra, opts={}) ->
        @opts = defaults(opts,  name:'default')
        
    set: (opts={}) ->
        opts = defaults(opts,  key:undefined, value:undefined, ttl:0, cb:undefined)        
        @cassandra.update(
            table:'key_value'
            where:{name:@opts.name, key:to_json(opts.key)}
            set:{value:to_json(opts.value)}
            ttl:opts.ttl
            cb:opts.cb
        )
                        
    get: (opts={}) ->
        opts = defaults(opts, key:undefined, cb:undefined)
        @cassandra.select(
            table:'key_value'
            columns:['value']
            where:{name:@opts.name, key:to_json(opts.key)}
            cb:(error, results) -> opts.cb?(error, if results.length == 1 then from_json(results[0]))
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
            

class exports.Cassandra extends EventEmitter
    constructor: (opts={}) ->    # cb is called on connect
        opts = defaults(opts, hosts:['localhost'], cb:undefined, keyspace:undefined, timeout:3000)
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
        if opts.cb?
            @conn.connect(opts.cb)
        else
            @conn.connect((err) -> )

    _where: (where_key, vals) ->
        where = "";
        for key, val of where_key
            where += "#{key}=? AND "
            vals.push(val)
        return where.slice(0,-4)

    _set: (properties, vals) ->
        set = ""; 
        for key, val of properties
            set += "#{key}=?,"
            vals.push(val)
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
        opts = defaults(opts,  table:undefined, where:{}, set:{}, ttl:0, cb:undefined)
        vals = []
        set = @_set(opts.set, vals)
        where = @_where(opts.where, vals)
        @cql("UPDATE #{opts.table} USING ttl #{opts.ttl} SET #{set} WHERE #{where}", vals, opts.cb)

    delete: (opts={}) ->
        opts = defaults(opts,  table:undefined, where:{}, cb:undefined)
        vals = []
        where = @_where(opts.where, vals)
        @cql("DELETE FROM #{opts.table} WHERE #{where}", vals, opts.cb)

    select: (opts={}) ->
        opts = defaults(opts,  table:undefined, columns:[], where:undefined, cb:undefined, limit:undefined)
        vals = []
        query = "SELECT #{opts.columns.join(',')} FROM #{opts.table}"
        if opts.where?
            where = @_where(opts.where, vals)
            query += " WHERE #{where} "
        if opts.limit?
            query += " LIMIT #{opts.limit} "
        @cql(query, vals,
            (error, results) ->
                opts.cb?(error, (r.get(col).value for col in opts.columns) for r in results)
        )

    cql: (query, vals, cb) ->
        #winston.debug(query, vals)
        @conn.cql(query, vals, (error, results) =>
            winston.error("Query '#{query}' caused a CQL error:\n#{error}") if error
            @emit('error', error) if error
            cb?(error, results))

    key_value_store: (opts={}) -> new KeyValueStore(@, opts)
    
    uuid_value_store: (opts={}) -> new UUIDValueStore(@, opts)

class exports.Salvus extends exports.Cassandra
    constructor: (opts={}) ->
        if not opts.keyspace?
            opts.keyspace = 'salvus' 
        super(opts)
        
    running_sage_servers: (opts={}) ->  
        opts = defaults(opts,  cb:undefined)
        @select(table:'sage_servers', cb:(error, results) ->
            # TODO: we hardcoded 6000 for now
            opts.cb(error, {address:x.get('address').value, port:6000} for x in results when x.get('running').value )
        )

    random_sage_server: (opts={}) -> # cb(error, random running sage server) or if there are no running sage servers, then cb(undefined)
        opts = defaults(opts,  cb:undefined)        
        @running_sage_servers((error, res) -> opts.cb(error, if res.length == 0 then undefined else misc.random_choice(res)))

    #############
    # Plans
    ############
    create_plan: (opts={}) ->
        opts = defaults(opts,  name:undefined, cb:undefined)        
        @update(
            table:'plans'
            where:{plan_id:uuid.v4()}
            set:{name:opts.name, created:now()}
            cb:opts.cb
        )

    plan: (opts={}) ->
        opts = defaults(opts,  id:undefined, columns:[], cb:undefined)        
        @select(table:'plans', columns:columns, where:{plan_id:id}, cb:opts.cb)
        
    current_plans: (opts={}) ->
        opts = defaults(columns:[], cb:undefined)        
        @select(table:'plans', columns:opts.columns, where:{current:true}, cb:opts.cb)

    ############
    # Accounts
    ############
    create_account: (opts={}) ->           # returns (not callback) the uuid of the newly created account
        opts = defaults(opts,  cb:undefined, username:'', account_id:undefined)
        opts.account_id = uuid.v4() if not opts.account_id?
        @update(
            table:'accounts'
            set:{username:opts.username}
            where:{account_id:opts.account_id}
            cb:opts.cb
        )
        return opts.account_id



        
            
exports.test = () ->
    c = new exports.Cassandra(keyspace:'salvus', cb:(error) ->
        console.log(error)
        c.count(table:'accounts', cb:console.log, where:{username:'wstein'})
    )

    
    

                            
###
# EXAMPLES:

c = new (require("cassandra").Salvus)()
c.count('accounts',{},console.log)
c.select(table:'accounts', columns:['username'], cb:console.log, limit:1)

id=null; c.create_account((a) -> id=a)
c.update_account(id, {username:'williamstein'}, console.log)

###