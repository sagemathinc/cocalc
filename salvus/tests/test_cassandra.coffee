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
    test.expect(8)
    kvs = salvus.key_value_store(name:'test')
    kvs2 = salvus.key_value_store(name:'test2')
    async.series([
        # test setting and getting a complicated object
        (cb) -> kvs.set(key:{abc:[1,2,3]}, value:{a:[1,2],b:[3,4]}, cb:cb)
        (cb) -> kvs.get(key:{abc:[1,2,3]}, cb:(error,value) -> test.deepEqual(value, {a:[1,2],b:[3,4]}); cb(error))
        # test deleting what we just added
        (cb) -> kvs.delete(key:{abc:[1,2,3]}, cb:cb)
        (cb) -> kvs.get(key:{abc:[1,2,3]}, cb:(error,value) -> test.ok(value==undefined); cb(error))
        # test ttl (time to live) 
        (cb) -> kvs.set(key:1, value:2, cb:cb, ttl:1)
        # first it is there
        (cb) -> kvs.get(key:1, cb:(error,value) -> test.ok(value?); cb(error))
        # then it is gone (after a second)
        (cb) -> setTimeout((()->kvs.get(key:1, cb:(error,value) -> test.equal(value, undefined); cb(error))),  1100)
        # delete all records, and confirm they are gone
        (cb) -> kvs.delete_all(cb:cb)
        (cb) -> kvs.length(cb:(err,value) -> test.equal(value,0); cb(err))
        # create many records and confirm length
        (cb) -> async.mapSeries([1..1000], ((n,cb)->kvs.set(key:n,value:n,cb:cb)), cb)
        (cb) -> kvs.length(cb:(err,value) -> test.equal(value,1000); cb(err))
        # get all records and confirm that we get the right number
        (cb) -> kvs.all(cb:(err,value) -> test.equal((x for x of value).length,1000); cb(err))
        # make sure different key:value store is independent
        (cb) -> kvs2.set(key:1, value:2, cb:cb)
        (cb) -> kvs2.length(cb:(err,value) -> test.equal(value,1); cb(err))
    ],()->test.done())

exports.test_uuid_value_store = (test) ->
    test.expect(8)
    uvs = salvus.uuid_value_store(name:'test')
    uvs2 = salvus.uuid_value_store(name:'test2')    
    uuid = null
    async.series([
        # test setting and getting a complicated object
        (cb) -> uuid = uvs.set(value:{a:[1,2],b:[3,4]}, cb:cb)
        (cb) -> uvs.get(uuid:uuid, cb:(error,value) -> test.deepEqual(value, {a:[1,2],b:[3,4]}); cb(error))
        # test deleting what we just added
        (cb) -> uvs.delete(uuid:uuid, cb:cb)
        (cb) -> uvs.get(uuid:uuid, cb:(error,value) -> test.ok(value==undefined); cb(error))
        # test ttl (time to live)
        (cb) -> uvs.set(uuid:0, value:2, ttl:1, cb:cb)
        # first it is there
        (cb) -> uvs.get(uuid:0, cb:(error,value) -> test.ok(value?); cb(error))
        # then it is gone
        (cb) -> setTimeout((()->uvs.get(uuid:0, cb:(error,value) -> test.equal(value, undefined); cb(error))),  1100)
        # delete all records, and confirm they are gone
        (cb) -> uvs.delete_all(cb:cb)
        (cb) -> uvs.length(cb:(err,value) -> test.equal(value,0); cb(err))
        # create many records and confirm length
        (cb) -> async.mapSeries([1..1000], ((n,cb)->uvs.set(value:n,cb:cb)), cb)
        (cb) -> uvs.length(cb:(err,value) -> test.equal(value,1000); cb(err))
        # get all records and confirm that we get the right number
        (cb) -> uvs.all(cb:(err,value) -> test.equal((x for x of value).length,1000); cb(err))
        # make sure different uuid:value store independent
        (cb) -> uvs2.set(value:2, cb:cb)
        (cb) -> uvs2.length(cb:(err,value) -> test.equal(value,1); cb(err))
    ],()->test.done())


        
    
