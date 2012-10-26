
misc = require('misc')    

winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus

class KeyValueStore
    # EXAMPLE:
    #   c = new (require("cassandra").Cassandra)(['localhost']); d = c.key_value_store('test')
    #   d.set([1,2], [465, {abc:123, xyz:[1,2]}])
    #   d.get([1,2], (r) -> console.log(r))
    # 
    constructor: (conn, name) ->
        @conn = conn
        @name = name

    set: (key, value, cb) ->
        @conn.cql("UPDATE key_value SET value = ? WHERE name = ? and key = ?",
                    [JSON.stringify(value), @name, JSON.stringify(key)], cb)

    # cb(cache[key])
    get: (key, cb) ->
        @conn.cql("SELECT value FROM key_value WHERE name = ? AND key = ? LIMIT 1", [@name, JSON.stringify(key)],
         (err, results) -> cb(if results.length == 1 then JSON.parse(results[0].get('value').value) else null))

    delete: (key, cb) ->
        @conn.cql("DELETE FROM key_value WHERE name = ? AND key = ?", [@name, JSON.stringify(key)], cb)

    delete_all: (cb) ->
        @conn.cql("DELETE FROM key_value WHERE name = ?", [@name], cb)

    length: (cb) ->
        @conn.cql("SELECT COUNT(*) FROM key_value WHERE name = ?", [@name],
            (err, results) -> cb(results[0].get('count').value))
    
        

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

    # cb(array of all running sage servers)
    running_sage_servers: (cb) ->
        @conn.cql("SELECT * FROM sage_servers", [], (err, results) ->
            # TODO: we hardcoded 6000 for now
            cb( {address:x.get('address').value, port:6000} for x in results when x.get('running').value )
        )

    # cb(random running sage server) or if there are no running sage servers, then cb(null)
    random_sage_server: (cb) ->
        @running_sage_servers((res) -> cb(if res.length == 0 then null else misc.random_choice(res)))

    key_value_store: (name, cb) -> new KeyValueStore(@conn, name)
               
###

c = new (require("cassandra").Cassandra)(['localhost'])

###