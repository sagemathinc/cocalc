###
TESTING of server-side synctable

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

async  = require('async')
expect = require('expect')

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown

describe 'test storage_server synctable -- ', ->
    @timeout(5000)
    before(setup)
    after(teardown)

    synctable = undefined
    it 'creates a synctable on the storage_servers', (done) ->
        db.synctable
            table : 'storage_servers'
            cb    : (err, x) ->
                synctable = x; done(err)

    it 'adds a storage server and notices this via wait', (done) ->
        synctable.wait
            until   : (x) ->
                return x.get().size > 0
            timeout : 2
            cb      : done
        # Now do the write, which will trigger the above wait to call done.
        db._query
            query : "INSERT INTO storage_servers"
            values : {host:'storage0'}

    it 'adds another storage server and notices this via change notification', (done) ->
        new_host = 'storage1'
        f = (host) ->
            synctable.removeListener('change', f)
            if host == new_host
                done()
            else
                done("wrong host - #{host}")
        synctable.on 'change', f
        db._query
            query : "INSERT INTO storage_servers"
            values : {host:new_host}
            cb : (err) -> expect(err).toEqual(undefined)

    it 'adds 2 storage servers and notices when the last is added', (done) ->
        hosts = ['storage2', 'storage3']
        f = (host) ->
            if host == hosts[hosts.length - 1]
                synctable.removeListener('change', f)
                done()
        synctable.on('change', f)
        db._query
            query  : "INSERT INTO storage_servers"
            values : ({host:h} for h in hosts)
            cb : (err) -> expect(err).toEqual(undefined)

    it 'closes the synctable, makes some writes and does not get a notification', (done) ->
        synctable.on 'change', ->
            done("this should never be called!")
        synctable.close (err) ->
            expect(err).toEqual(undefined)
            db._query
                query : "INSERT INTO storage_servers"
                values : {host:'storage389'}
                cb : (err) ->
                    expect(err).toEqual(undefined)
                    setTimeout(done, 250)  # wait short time to NOT have the above done get called


describe 'test accounts synctable', ->
    before(setup)
    after(teardown)

    synctable = undefined
    it 'creates a synctable on accounts', (done) ->
        db.synctable
            table : 'accounts'
            columns : ['account_id', 'email_address', 'first_name', 'last_name']
            where   : {first_name:'Will'}
            cb    : (err, x) ->
                synctable = x; done(err)

    it 'adds a user and notices via wait', (done) ->
        synctable.wait
            until   : (x) ->
                return x.get().size > 0
            timeout : 2
            cb      : done
        # Now do the write, which will trigger the above wait to call done.
        db.create_account first_name:'Will', last_name:'Sage', email_address:'a@sagemath.com', cb:(e)->expect(e).toEqual(undefined)

    it 'creates a user that does not match our condition and does not get notified', (done) ->
        # First we setup a listener, which will get one notification with the *SECOND* user we add below
        # (so we know the first did not yield a notification).
        synctable.once 'change', (user) ->
            expect(synctable.getIn([user, 'last_name'])).toEqual('YES')
            done()
        db.create_account first_name:'Dennis', last_name:'Sage', email_address:'b@sagemath.com', cb:(err)->
            expect(err).toEqual(undefined)
            db.create_account first_name:'Will', last_name:'YES', email_address:'c@sagemath.com', cb:(err)->
                expect(err).toEqual(undefined)

    it 'deletes an account and gets notified', (done) ->
        id0 = id1 = undefined
        synctable.once 'change', (id) ->
            expect(id).toEqual(id1)  # i.e., delete the one that should be deleted
            done()
        async.series([
            (cb) ->
                db.create_account first_name:'X', last_name:'Y', email_address:'d@sagemath.com', cb: (err, id) ->
                    id0 = id
                    cb(err)
            (cb) ->
                db.create_account first_name:'Will', last_name:'Y', email_address:'e@sagemath.com', cb: (err, id) ->
                    id1 = id
                    cb(err)
            (cb) ->
                db.delete_account(account_id: id0, cb: cb)
            (cb) ->
                db.delete_account(account_id: id1, cb: cb)
        ])



