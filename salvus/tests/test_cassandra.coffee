cassandra = require("cassandra")
helenus   = require("helenus")
async     = require("async")

salvus = null

exports.setUp = (cb) ->
    conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'})
    async.series([
        (cb) -> conn.connect(cb)
        (cb) -> conn.cql("DROP KEYSPACE test", [], () -> cb(null))
        (cb) -> conn.cql("CREATE KEYSPACE test WITH strategy_class = 'SimpleStrategy' AND strategy_options:replication_factor=3", [], cb)
        (cb) -> conn.cql("USE test", [], cb)
        (cb) -> cassandra.create_schema(conn, cb)
        (cb) -> salvus = new cassandra.Salvus(keyspace:'test', cb:cb)
        (cb) -> conn.close(); cb()
    ], cb)
        
exports.tearDown = (cb) ->
    conn = null
    async.series([
        (cb) -> salvus.close() if salvus?; cb()
        (cb) -> conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'}); conn.connect(cb)
        (cb) -> conn.cql("DROP KEYSPACE test", [], cb)
        (cb) -> conn.close(); cb()
    ], cb)


exports.test_key_value_store = (test) ->
    test.expect(3)
    kvs = salvus.key_value_store(name:'test')
    async.series([
        # test setting and getting a complicated object
        (cb) -> kvs.set(key:{abc:[1,2,3]}, value:{a:[1,2],b:[3,4]}, cb:cb)
        (cb) -> kvs.get(key:{abc:[1,2,3]}, cb:(error,value) -> test.deepEqual(value, {a:[1,2],b:[3,4]}); cb(null))
        # test ttl (time to live) 
        (cb) -> kvs.set(key:1, value:2, cb:cb, ttl:1)
        # first it is there
        (cb) -> kvs.get(key:1, cb:(error,value) -> test.ok(not error); cb(null))
        # then it is gone (after a second)
        (cb) -> setTimeout((()->kvs.get(key:1, cb:(error,value) -> test.equal(value, undefined); cb(null))),  1100)
    ],()->test.done())

exports.test_uuid_value_store = (test) ->
    test.expect(1)
    uvs = salvus.uuid_value_store(name:'test')
    uuid = null
    async.series([
        (cb) -> uuid = uvs.set(value:{a:[1,2],b:[3,4]}, cb:cb)
        (cb) -> uvs.get(uuid:uuid, cb:(error,value) -> test.deepEqual(value, {a:[1,2],b:[3,4]}); cb(null))
    ],()->test.done())
        
    
