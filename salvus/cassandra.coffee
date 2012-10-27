
misc = require('misc')    

winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/helenus

class Sessions
    # EXAMPLES:
    # c = new (require("cassandra").Cassandra)(['localhost']); s = c.sessions('sage'); u = c.sessions('user')
    # s.register(4, 'localhost', 5000, 30, (err,r) -> console.log(err))
    # u.register(5, 'localhost', 5000, 30, (err,r) -> console.log(err))
    # 
    constructor: (conn, type) ->
        @conn = conn
        @type = type
        
    register: (uuid, address, port, ttl, cb) ->
        @conn.cql("UPDATE sessions USING TTL ? SET address = ?, port = ? WHERE type = ? AND uuid = ?",
                 [ttl, address, port, @type, uuid], cb)
                
    delete: (uuid, cb) ->
        @conn.cql("DELETE FROM sessions WHERE type = ? AND uuid = ?", [@type, uuid], cb)

    location: (uuid, cb) ->
        @conn.cql("SELECT address, port FROM sessions WHERE type = ? and uuid = ?", [@type, uuid],
            (err,results) -> cb(
                if results.length==1
                    {address:results[0].get('address').value,port:results[0].get('port').value}
                else
                    null
            )
        )
            

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

    key_value_store: (name) -> new KeyValueStore(@conn, name)

    sessions: (type) -> new Sessions(@conn, type)
               
###

c = new (require("cassandra").Cassandra)(['localhost'])

###