async = require('async')
rethink = require '../rethink.coffee'
assert = require('assert')

db = undefined
setup = (cb) ->
    db = rethink.rethinkdb(database:'test')
    async.series([
        (cb) ->
            teardown(cb)
        (cb) ->
            db.update_schema(cb:cb)
    ], cb)

teardown = (cb) ->
    db.r.dbList().run (err, v) ->
        if err
            cb(err); return
        if 'test' in v
            db.r.dbDrop('test').run(cb)
        else
            cb()

describe 'working with accounts', ->
    @timeout(5000)
    before(setup)
    after(teardown)
    it 'test creating accounts', (done) ->
        async.series([
            (cb) ->
                db.account_exists
                    email_address:'sage@example.com'
                    cb:(err, exists) -> cb(err or exists)
            (cb) ->
                db.create_account(first_name:"Sage", last_name:"Salvus", created_by:"1.2.3.4",\
                                  email_address:"sage@example.com", password_hash:"blah", cb:cb)
            (cb) ->
                db.account_exists
                    email_address:'sage@example.com'
                    cb:(err, exists) -> cb(err or not exists)
            (cb) ->
                db.create_account(first_name:"Mr", last_name:"Smith", created_by:"10.10.1.1",\
                                  email_address:"sage-2@example.com", password_hash:"foo", cb:cb)
            (cb) ->
                db.get_stats
                    cb: (err, stats) ->
                        cb(err or stats.accounts != 2)
            (cb) ->
                db.get_account
                    email_address:'sage-2@example.com'
                    cb:(err, account) ->
                        if err
                            cb(err)
                        else
                            cb(account.first_name=="Mr" and account.password_is_set)
            (cb) ->
                db.count_accounts_created_by
                    ip_address : '1.2.3.4'
                    age_s      : 1000000
                    cb         : (err, n) ->
                        cb(err or n != 1)
        ], (err) ->
            assert.equal(err, undefined)
            done()
        )

    it 'test deleting accounts', (done) ->
        account_id = undefined
        n_start = undefined
        async.series([
            (cb) ->
                db.table('accounts').count().run (err, n) ->
                    n_start = n; cb(err)
            (cb) ->
                db.get_account
                    email_address:'sage-2@example.com'
                    cb : (err, account) ->
                        account_id = account?.account_id
                        cb(err)
            (cb) ->
                db.delete_account
                    account_id : account_id
                    cb         : cb
            (cb) ->
                db.table('accounts').count().run (err, n) ->
                    assert.equal(n, n_start-1)
                    cb(err)
        ], (err) ->
            assert.equal(err, undefined)
            done()
        )

describe 'working with logs', ->
    @timeout(5000)
    before(setup)
    after(teardown)
    it 'test central log', (done) ->
        async.series([
            (cb) ->
                db.log
                    event : "test"
                    value : "a message"
                    cb    : cb
            (cb) ->
                db.get_log
                    start : new Date(new Date() - 10000000)
                    end   : new Date()
                    event : 'test'
                    cb    : (err, log) ->
                        cb(err or log.length != 1 or log[0].event != 'test' or log[0].value != 'a message')
        ], (err) ->
            assert.equal(err, undefined)
            done()
        )



