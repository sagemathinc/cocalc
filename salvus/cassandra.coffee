
misc    = require('misc')
{to_json, from_json, to_iso, defaults} = misc

winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus
uuid    = require('node-uuid')
{EventEmitter} = require('events')

now = () -> to_iso(new Date())

class UUIDValueStore
    # c = new (require("cassandra").Cassandra)(['localhost']); s = c.uuid_value_store('sage'); u = c.uuid_value_store('user')
    # s.set(4, {address:'localhost', port:5000}, 30, (err,r) -> console.log(err))
    # u.set(7, {address:'localhost', port:5000})
    # u.get(7, (r) -> console.log(r))
    constructor: (@cassandra, @name) ->
    set: (uuid, value, ttl, cb) ->
        @cassandra.update('uuid_value', {name:@name, uuid:uuid}, {value:to_json(value)}, ttl, cb)
    get: (uuid, cb) ->
        @cassandra.select('uuid_value', ['value'], {name:@name, uuid:uuid},
             (results) -> cb(if results.length == 1 then from_json(results[0])))
    delete: (uuid, cb) ->
        @cassandra.delete('uuid_value', {name:@name, uuid:uuid}, cb)
    delete_all: (cb) ->
        @cassandra.delete('uuid_value', {name:@name}, cb)        
    length: (cb) ->
        @cassandra.count('uuid_value', {name:@name}, cb)
    all: (cb) ->
        @cassandra.select('uuid_value', ['uuid', 'value'], {name:@name},
            (results) ->
                obj = {}
                for r in results
                    obj[r[0]] = from_json(r[1])
                cb(obj))

class KeyValueStore
    #   c = new (require("cassandra").Cassandra)(['localhost']); d = c.key_value_store('test')
    #   d.set([1,2], [465, {abc:123, xyz:[1,2]}], 5)   # 5 = ttl
    #   d.get([1,2], console.log)   # but call it again in > 5 seconds and get nothing...
    constructor: (@cassandra, @name) ->
    set: (key, value, ttl, cb) ->
        @cassandra.update('key_value', {name:@name, key:to_json(key)}, {value:to_json(value)}, ttl, cb)
    get: (key, cb) ->
        @cassandra.select('key_value', ['value'], {name:@name, key:to_json(key)},
             (results) -> cb(if results.length == 1 then from_json(results[0])))
    delete: (key, cb) ->
        @cassandra.delete('key_value', {name:@name, key:to_json(key)}, cb)
    delete_all: (cb) ->
        @cassandra.delete('key_value', {name:@name}, cb)        
    length: (cb) ->
        @cassandra.count('key_value', {name:@name}, cb)
    all: (cb) ->
        @cassandra.select('key_value', ['key', 'value'], {name:@name},
            (results) -> cb( [from_json(r[0]), from_json(r[1])] for r in results ))

class exports.Cassandra extends EventEmitter
    constructor: (opts={}) ->    # cb is called on connect
        opts = defaults(opts, {hosts:['localhost'], cb:undefined, keyspace:'salvus', timeout:3000})
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
        @conn.connect(opts.cb) if opts.cb?

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
        where = @_where(where, vals)
        @cql("DELETE FROM #{opts.table} WHERE #{where}", vals, opts.cb)

    select: (opts={}) ->
        opts = defaults(opts,  table:undefined, columns:[], where:{}, cb:undefined)
        vals = []
        where = @_where(opts.where, vals)
        @cql("SELECT #{opts.columns.join(',')} FROM #{opts.table} WHERE #{where}", vals,
            (error, results) ->
                opts.cb?(error, (r.get(col).value for col in opts.columns) for r in results)
        )

    cql: (query, vals, cb) ->
        winston.info(query, vals)
        @conn.cql(query, vals, (error, results) =>
            winston.error(error) if error  # TODO -- should emit an event instead.
            @emit('error', error) if error
            cb?(error, results))

class exports.Salvus extends exports.Cassandra
    ######################################################################################                                
    # cb(array of all running sage servers)
    running_sage_servers: (cb) ->
        @conn.cql("SELECT * FROM sage_servers", [], (err, results) ->
            # TODO: we hardcoded 6000 for now
            cb( {address:x.get('address').value, port:6000} for x in results when x.get('running').value )
        )

    # cb(random running sage server) or if there are no running sage servers, then cb(undefined)
    random_sage_server: (cb) ->
        @running_sage_servers((res) -> cb(if res.length == 0 then undefined else misc.random_choice(res)))

    key_value_store: (name) -> new KeyValueStore(@, name)

    uuid_value_store: (name) -> new UUIDValueStore(@, name)

    #############
    # Plans
    ############
    create_plan: (name, cb) ->
        @update('plans', {where:{plan_id:uuid.v4()}, set:{name:name, created:now()}}, cb)
    plan: (id, columns, cb) ->
        @select('plans', {columns:columns, where:{plan_id:id}}, (r) -> cb(r[0]))
    current_plans: (columns, cb) ->
        @select('plans', {columns:columns, where:{current:true}}, cb)

    ############
    # Accounts
    ############
    create_account: (cb) ->  # returns the id of the newly created account
        id = uuid.v4(); 
        @conn.cql("UPDATE accounts SET creation_time=? WHERE account_id=?",[now(),id],(e,r) -> cb(id))

    update_account: (account_id, properties, cb) ->
        @update('accounts', {account_id:account_id}, properties, 0, cb)


            
exports.test = () ->
    c = new exports.Cassandra(keyspace:'salvus', cb:(error) ->
        console.log(error)
        c.count(table:'accounts', cb:console.log, where:{username:'wstein'})
    )

    
    

                            
###
# EXAMPLES:

c = new (require("cassandra").Cassandra)(['localhost'])
c.count('accounts',{},console.log)

id=null; c.create_account((a) -> id=a)
c.update_account(id, {username:'williamstein'}, console.log)

###