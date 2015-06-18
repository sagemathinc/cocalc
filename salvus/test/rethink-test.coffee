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

test_create_account = (cb) ->
    async.series([
        (cb) ->
            setup(cb)
        (cb) ->
            db.create_account(first_name:"Sage", last_name:"Salvus", created_by:"1.2.3.4",\
                              email_address:"sage@example.com", password_hash:"blah", cb:cb)
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
            teardown(cb)
    ], cb)

describe 'create_account', ->
    it 'test creating accounts', (done) ->
        @timeout(5000)
        test_create_account (err) ->
            assert.equal(err, undefined)
            done()


