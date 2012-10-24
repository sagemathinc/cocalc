###
# 
c = require('cassandra'); c2 = new c.Cassandra(['localhost'])
 
###

winston = require('winston')            # https://github.com/flatiron/winston
helenus = require("helenus")            # https://github.com/simplereach/node-thrift

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

    running_sage_servers: (cb) ->
        @conn.cql("SELECT * FROM sage_servers", [], (err, results) ->
            # TODO: we hardcoded 6000 for now
            cb( {address:x.get('address').value, port:6000} for x in results when x.get('running').value )
        )
            
    cache_put: (name, key, value, cb) ->
        winston.info("cassandra cache_put(name='#{name}', key=#{JSON.stringify(key)}, value=#{JSON.stringify(value)}, cb)")
        # TODO: use name, value, key
        #@conn.cql("UPDATE stateless_exec SET output = :value WHERE input = :input"
        cb?()

    cache_get: (name, key, cb) ->
        winston.info("cassandra cache_get(name='#{name}', key=#{JSON.stringify(key)}, cb)")
        # TODO: use name!        
        cb(null)
        
               
               
                                   