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
            
    cache_put: (name, key, value, cb) ->
        winston.info("cassandra cache_put(name='#{name}', key=#{JSON.stringify(key)}, value=#{JSON.stringify(value)}, cb)")
        cb?()

    cache_get: (name, key, cb) ->
        winston.info("cassandra cache_get(name='#{name}', key=#{JSON.stringify(key)}, cb)")
        cb(null)
        
               
               
                                   