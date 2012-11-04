###
#
# For manual testing:
#
#    require('./node_modules/tests/test_cassandra').setUp(); database = new (require('cassandra').Salvus)(keyspace:'test');0;
#
###


cassandra = require("cassandra")
helenus   = require("helenus")
async     = require("async")

misc      = require("misc")

database = null

exports.setUp = (cb) ->
    conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'})
    async.series([
        (cb) -> conn.connect(cb)
        (cb) -> conn.cql("DROP KEYSPACE test", [], () -> cb(null))
        (cb) -> conn.cql("CREATE KEYSPACE test WITH strategy_class = 'SimpleStrategy' AND strategy_options:replication_factor=3", [], cb)
        (cb) -> conn.cql("USE test", [], cb)
        (cb) -> cassandra.create_schema(conn, cb)
        (cb) -> conn.cql("UPDATE sage_servers SET running='true' WHERE address='localhost'", [], cb)
        (cb) -> database = new cassandra.Salvus(keyspace:'test', cb:cb)
        (cb) -> conn.close(); cb()
    ], cb)
        
exports.tearDown = (cb) ->
    conn = null
    async.series([
        (cb) -> database.close() if database?; cb()
        (cb) -> conn = new helenus.ConnectionPool({hosts: ['localhost'], timeout: 3000, cqlVersion: '3.0.0'}); conn.connect(cb)
        (cb) -> conn.close(); cb()
    ], cb)


exports.test_user_feedback = (test) ->
    test.expect(11)
    async.series [
        # Submit severals user feedback forms for user with account_id=0 and 1.
        (cb) ->
            database.report_feedback
                account_id  : 0
                category        : 'bug'
                description : 'This is my first bug report.'
                data        : {'sage_version':'5.4', 'hostname':'sage04'}
                nps         : 9
                cb          : (err, results) -> test.ok(not err); cb()
        (cb) -> 
            database.report_feedback
                account_id  : 0
                category        : 'bug'
                description : 'This is my first bug report.'
                data        : {'sage_version':'5.5', 'hostname':'sage07'}
                nps         : 7
                cb          : (err, results) -> test.ok(not err); cb()
        (cb) -> 
            database.report_feedback
                account_id  : 0
                category        : 'idea'
                description : 'Implement way more features!'
                data        : {'sage_version':'5.4', 'hostname':'sage05'}
                nps         : 5
                cb          : (err, results) -> test.ok(not err); cb()
        
        (cb) -> 
            database.report_feedback
                account_id  : 1
                category        : 'comment'
                description : 'So far this is pretty good.'
                data        : {'sage_version':'5.4', 'hostname':'sage01'}
                nps         : 7
                cb          : (err, results) -> test.ok(not err); cb()

        (cb) ->
            console.log("check count of inserted entries")
            database.count
                table:'feedback',
                cb:(err, results) ->
                    test.equal(results, 4)
                    cb()

        # Get all feedback and verify consistency with what we
        # submitted.  Also verify the automatically set time was
        # within the last few seconds.
        (cb) ->
            database.get_all_feedback_from_user
                account_id : 1
                cb : (err, results) ->
                    test.equal(results.length, 1, "should be 1 feedback form for user with id 1, but got #{results.length}")
                    test.equal(results[0].category, 'comment')
                    test.deepEqual(results[0].data, {'sage_version':'5.4', 'hostname':'sage01'})
                    test.equal(results[0].description, 'So far this is pretty good.')
                    cb()
                    
        (cb) -> 
            database.get_all_feedback_from_user
                account_id : 0
                cb : (err, results) ->
                    test.equal(results.length, 3, "should be 3 feedback form for user with account_id 0, but got #{results.length}")
                    cb()
        
        (cb) -> 
            database.get_all_feedback_of_category
                category : 'bug'
                cb : (err, results) ->
                    test.equal(results.length, 2, "should be 2 bugs, but got #{results.length}")
                    cb()

    ], () -> test.done()


exports.test_account_management = (test) ->
    test.expect(18)
    account_id = null
    account =
        first_name : 'Salvus'
        last_name  : 'Math'
        email_address : 'salvusmath@gmail.com'
        password_hash : 'sha512$e0d3590cbe964b540cf6fa2713b4bbab$1$67fddb5643ef79ea092ccff9ea41575fc2c833fe7071c74dde50e04a3fc24af65dc130a13313de558dc2d7e1ed360c1f2fd8c690a2b61a28c89f90a28dae2401'  # salvus
        plan_name     : 'Free'
        
    async.series([
        # address starts out available
        (cb) ->
            database.is_email_address_available(account.email_address, (error, result) ->
                test.equal(result, true)
                cb()
            )
        # we create a new account
        (cb) ->
            account.account_id = database.create_account(
                first_name    : account.first_name
                last_name     : account.last_name
                email_address : account.email_address
                password_hash : account.password_hash
                cb            : (error, result) ->
                    test.ok(not error)
                    test.equal(result, account.account_id)
                    cb()
            )
        # now the email address is no longer available
        (cb) -> 
            database.is_email_address_available(account.email_address, (error, result) ->
                test.equal(result, false)
                cb()
            )
        # we fetch the account by email_address and confirm correctness of what is returned
        (cb) ->
            database.get_account(
                email_address : account.email_address
                cb:(error,result) ->
                    test.ok(not error)
                    for k in misc.keys(account)  # test.deepEqual doesn't work right maybe becuase of uuid changes into and out of db
                        test.equal(result[k], account[k])
                    cb()
            )
        # we fetch the account by account_id
        (cb) ->
            database.get_account(
                account_id : account.account_id
                cb : (error, result) ->
                    test.ok(not error)
                    test.equal(result.email_address, account.email_address)
                    cb()
            )
        # we attempt to fetch an account that doesn't exist, and verify that this is an error
        (cb) ->
            database.get_account(
                account_id: 0
                cb : (error, result) ->
                    test.ok(error)
                    cb()
            )

        # we change the password
        (cb) ->
            account.password_hash = 'sha512$0c6b41b54a59b57bfea7a1c697f44d41$1$da260a09ae9e5ee1e829c88eea094a9ac4b1af248705c8ff5087cfb263711374d3d9cdc70be0095cc2bb609355192ab1687210b31aba05aa249c977d15de4fc9'  # salvus2
            database.change_password(
                account_id    : account.account_id
                password_hash : account.password_hash
                cb            : (error, result) ->
                    test.ok(not error)
                    cb()
            )

        # confirm the password change
        (cb) ->
            database.get_account(
                account_id: account.account_id
                cb : (error, result) ->
                    test.equal(result.password_hash, account.password_hash)
                    cb()
            )

        # we change the email address
        (cb) ->
            account.email_address = 'salvusmath@uw.edu'
            database.change_email_address(
                account_id    : account.account_id
                email_address : account.email_address
                cb : (error, result) ->
                    test.ok(not error)
                    cb()
            )

        # confirm the email address change
        (cb) ->
            database.get_account(
                account_id: account.account_id
                cb : (error, result) ->
                    test.equal(result.email_address, account.email_address)
                    cb()
            )

    ], () -> test.done())

exports.test_key_value_store = (test) ->
    test.expect(8)
    kvs = database.key_value_store(name:'test')
    kvs2 = database.key_value_store(name:'test2')
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
    uvs = database.uuid_value_store(name:'test')
    uvs2 = database.uuid_value_store(name:'test2')    
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

          
        
    