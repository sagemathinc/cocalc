 
misc = require('misc')    

winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus
uuid    = require('node-uuid')

to_json = misc.to_json
from_json = misc.from_json
to_iso = misc.date_to_local_iso

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

class exports.Cassandra
    constructor: (hosts) ->
        @conn = new helenus.ConnectionPool(
            hosts:hosts
            keyspace:'salvus'
            timeout:3000
            cqlVersion: '3.0.0'
        )
        @conn.on('error', (err) -> winston.error(err.name, err.message))
        @conn.connect ((err, keyspace) -> winston.error(err) if err)

    ##################################
    # General Cassandra functionality
    ##################################
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

    count: (table, where_key, cb) ->
        query = "SELECT COUNT(*) FROM #{table}"
        vals = []
        if not misc.is_empty_object(where_key)
            where = @_where(where_key, vals)
            query += " WHERE #{where}"
        @query(query, vals, (error, results) -> cb(results[0].get('count').value))

    update: (table, where_key, properties, ttl, cb) ->
        vals = []
        set = @_set(properties, vals)
        where = @_where(where_key, vals)
        @query("UPDATE #{table} USING ttl #{ttl} SET #{set} WHERE #{where}", vals, cb)

    delete: (table, where_key, cb) ->
        vals = []
        where = @_where(where_key, vals)
        @query("DELETE FROM #{table} WHERE #{where}", vals, cb)

    select: (table, column_names, where_key, cb) ->
        vals = []
        where = @_where(where_key, vals)
        @query("SELECT #{column_names.join(',')} FROM #{table} WHERE #{where}", vals,
            (error, results) ->
                cb((r.get(column).value for column in column_names) for r in results)
        )

    query: (query, vals, cb) ->
        console.log(query, vals) # TODO - delete
        @conn.cql(query, vals, (error, results) ->
            winston.error(error) if error  # TODO -- should emit an event instead.
            cb?(error, results))

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
    create_plan: (data, cb) ->
        id = uuid.v4(); data.timestamp = now()
        @uuid_value_store('plans').set(id, data, 0, () -> cb?(id))
    plan: (id, cb) ->
        @uuid_value_store('plans').get(id, cb)
    all_plans: (cb) ->
        @uuid_value_store('plans').all(cb)

    ############
    # Accounts
    ############
    create_account: (cb) ->  # returns the id of the newly created account
        id = uuid.v4(); 
        @conn.cql("UPDATE accounts SET creation_time=? WHERE account_id=?",[now(),id],(e,r) -> cb(id))

    update_account: (account_id, properties, cb) ->
        @update('accounts', {account_id:account_id}, properties, 0, cb)


            
        
###
# EXAMPLES:

c = new (require("cassandra").Cassandra)(['localhost'])
c.count('accounts',{},console.log)

id=null; c.create_account((a) -> id=a)
c.update_account(id, {username:'williamstein'}, console.log)

###