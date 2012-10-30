cassandra = require("cassandra")
helenus   = require("helenus")

salvus = null

exports.setUp = (cb) ->
    conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'})
    conn.connect( () -> 
        conn.cql("DROP KEYSPACE test", [], () -> 
            conn.cql("CREATE KEYSPACE test WITH strategy_class = 'SimpleStrategy' AND strategy_options:replication_factor=3", [],
                (error, results) ->
                    console.log(error)
                    conn.cql("USE test", [], (error) ->
                        console.log(error)
                        cassandra.create_schema(conn, (error) ->
                            console.log(error)
                            salvus = new cassandra.Salvus(keyspace:'test', cb: () -> conn.close(); cb())
                        )
                    )
            )
        )
    )

exports.tearDown = (cb) ->
    salvus.close()
    cb()
    return
    
    conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'})
    conn.connect( () -> conn.cql("DROP KEYSPACE test", [], () -> console.log('closing tearDown'); conn.close(); cb()) )





exports.test_key_value_store = (test) ->
    test.expect(2)

    kvs = salvus.key_value_store(name:'test')
    
    kvs.set(
        key:10
        value:20
        cb: (error) ->
            test.ok(not error)
            kvs.get(
                key:10
                cb: (error, value) ->
                    test.ok(value == 20)
                    test.done()
                )
    )
    
            