async = require('async')
rethink = require '../rethink.coffee'
expect = require('expect')
misc = require('misc')

db = undefined
setup = (cb) ->
    db = rethink.rethinkdb(database:'test', debug:false)
    async.series([
        (cb) ->
            teardown(cb)
        (cb) ->
            db.update_schema(cb:cb)
    ], cb)

teardown = (cb) ->
    db?.delete_all(cb:cb, confirm:'yes')


describe 'working with accounts: ', ->
    @timeout(5000)
    before(setup)
    after(teardown)
    it "checks that the account we haven't made yet doesn't already exist", (done) ->
        db.account_exists
            email_address:'sage@example.com'
            cb:(err, exists) -> expect(exists).toBe(false); done(err)
    it "tries to get an account that doesn't exist", (done) ->
        db.get_account
            email_address:'sage@example.com'
            cb : (err, account) -> expect(err?).toBe(true); done()
    it "creates a new account", (done) ->
        db.create_account(first_name:"Sage", last_name:"Salvus", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:done)
    it "checks the newly created account does exist", (done) ->
        db.account_exists
            email_address:'sage@example.com'
            cb:(err, exists) -> expect(exists).toBe(true); done(err)
    it "verifies that there is 1 account in the database via a count", (done) ->
        db.table('accounts').count().run (err, n) -> expect(n).toBe(1); done(err)
    it "creates a second account", (done) ->
        db.create_account(first_name:"Mr", last_name:"Smith", created_by:"10.10.1.1",\
                          email_address:"sage-2@example.com", password_hash:"foo", cb:done)
    it "verifies that there are a total of 2 accounts in the database via the stats table", (done) ->
        db.get_stats(cb: (err, stats) -> expect(stats.accounts).toBe(2); done(err))
    it "grabs our second new account by email and checks a name and property", (done) ->
        db.get_account
            email_address:'sage-2@example.com'
            cb:(err, account) ->
                expect(account.first_name).toBe("Mr")
                expect(account.password_is_set).toBe(true)
                done(err)
    it "computes number of accounts created from 1.2.3.4", (done) ->
        db.count_accounts_created_by
            ip_address : '1.2.3.4'
            age_s      : 1000000
            cb         : (err, n) -> expect(n).toBe(1); done(err)
    it "deletes an account", (done) ->
        db.get_account
            email_address:'sage-2@example.com'
            cb : (err, account) ->
                db.delete_account
                    account_id : account.account_id
                    cb         : done
    it "checks that account is gone", (done) ->
        db.account_exists
            email_address:'sage-2@example.com'
            cb:(err, exists) -> expect(exists).toBe(false); done(err)
    it "creates an account with no password set", (done) ->
        db.create_account(first_name:"Simple", last_name:"Sage", created_by:"1.2.3.4",\
                          email_address:"simple@example.com", cb:done)
    it "verifies that the password_is_set field is false", (done) ->
        db.get_account
            email_address:'simple@example.com'
            cb:(err, account) -> expect(account.password_is_set).toBe(false); done(err)

describe 'working with logs', ->
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
                        expect(log.length).toBe(1)
                        expect(log[0]).toEqual(event:'test', value:'a message', id:log[0].id, time:log[0].time)
                        cb(err)
            (cb) ->
                # no old stuff
                db.get_log
                    start : new Date(new Date() - 10000000)
                    end   : new Date(new Date() - 1000000)
                    cb    : (err, log) ->
                        expect(log.length).toBe(0)
                        cb(err)
        ], (err) ->
            expect(err).toBe(undefined)
            done()
        )

    it 'test client error log', (done) ->
        account_id = '4d29eec4-c126-4f06-b679-9a661fd7bcdf'
        error = {something:"a message -- bad"}
        event = 'test'
        async.series([
            (cb) ->
                db.log_client_error
                    event      : event
                    error      : error
                    account_id : account_id
                    cb         : cb
            (cb) ->
                db.log_client_error
                    event      : event + "-other"
                    error      : error
                    account_id : account_id
                    cb         : cb
            (cb) ->
                db.get_client_error_log
                    start : new Date(new Date() - 10000000)
                    end   : new Date()
                    event : event
                    cb    : (err, log) ->
                        expect(log.length).toBe(1)
                        expect(log[0]).toEqual(event:event, error:error, account_id:account_id, id:log[0].id, time:log[0].time)
                        cb(err)
            (cb) ->
                db.get_client_error_log
                    start : new Date(new Date() - 10000000)
                    end   : new Date(new Date() - 1000000)
                    event : event
                    cb    : (err, log) ->
                        expect(log.length).toBe(0)
                        cb(err)
        ], (err) ->
            expect(err).toBe(undefined)
            done()
        )

describe 'testing working with blobs -- ', ->
    beforeEach(setup)
    afterEach(teardown)
    {uuidsha1} = require('../misc_node')
    it 'creating a blob and reading it', (done) ->
        blob = new Buffer("This is a test blob")
        async.series([
            (cb) ->
                db.save_blob(uuid : uuidsha1(blob), blob : blob, cb   : cb)
            (cb) ->
                db.table('blobs').count().run (err, n) ->
                    expect(n).toBe(1)
                    cb(err)
            (cb) ->
                db.get_blob
                    uuid : uuidsha1(blob)
                    cb   : (err, blob2) ->
                        expect(blob2.equals(blob)).toBe(true)
                        cb(err)
        ], done)

    it 'creating 50 blobs and verifying that 50 are in the table', (done) ->
        async.series([
            (cb) ->
                f = (n, cb) ->
                    blob = new Buffer("x#{n}")
                    db.save_blob(uuid : uuidsha1(blob), blob : blob, cb   : cb)
                async.map([0...50], f, cb)
            (cb) ->
                db.table('blobs').count().run (err, n) ->
                    expect(n).toBe(50)
                    cb(err)
        ], done)

    it 'creating 5 blobs that expire in 0.01 second and 5 that do not, then wait 0.1s, delete_expired, then verify that the expired ones are gone from the table', (done) ->
        async.series([
            (cb) ->
                f = (n, cb) ->
                    blob = new Buffer("x#{n}")
                    db.save_blob(uuid : uuidsha1(blob), blob : blob, cb   : cb, ttl:if n<5 then 0.01 else 0)
                async.map([0...10], f, cb)
            (cb) ->
                setTimeout(cb, 100)
            (cb) ->
                db.delete_expired(cb:cb)
            (cb) ->
                db.table('blobs').count().run (err, n) ->
                    expect(n).toBe(5)
                    cb(err)
        ], done)

    it 'creating a blob that expires in 0.01 seconds, then extending it to never expire; wait, delete, and ensure it is still there', (done) ->
        blob = "a blob"
        uuid = uuidsha1(blob)
        async.series([
            (cb) ->
                db.save_blob(uuid : uuid, blob : blob, cb : cb, ttl:0.01)
            (cb) ->
                db.remove_blob_ttls(uuids:[uuid], cb:cb)
            (cb) ->
                setTimeout(cb, 100)
            (cb) ->
                db.table('blobs').count().run (err, n) ->
                    expect(n).toBe(1)
                    cb(err)
        ], done)

describe 'testing the hub servers registration table', ->
    beforeEach(setup)
    afterEach(teardown)
    it 'test registering a hub that expires in 0.05 seconds, test is right, then wait 0.1s, delete_expired, then verify done', (done) ->
        async.series([
            (cb) ->
                db.register_hub(host:"smc0", port:5000, clients:17, ttl:0.05, cb:cb)
            (cb) ->
                db.get_hub_servers cb:(err, v) ->
                    expect(v.length).toBe(1)
                    expect(v[0]).toEqual({host:"smc0", port:5000, clients:17, expire:v[0].expire})
                    cb(err)
            (cb) ->
                setTimeout(cb, 150)
            (cb) ->
                db.delete_expired(cb:cb)
            (cb) ->
                db.get_hub_servers cb:(err, v) ->
                    expect(v.length).toBe(0)
                    cb(err)
        ], done)

describe 'testing the server settings table:', ->
    before(setup)
    after(teardown)
    it 'play with server settings', (done) ->
        async.series([
            (cb) ->
                db.set_server_setting
                    name  : 'name'
                    value : {a:5, b:{x:10}}
                    cb    : cb
            (cb) ->
                db.get_server_setting
                    name : 'name'
                    cb   : (err, value) ->
                        expect(value).toEqual({a:5, b:{x:10}})
                        cb(err)
        ], done)

describe 'testing the passport settings table:', ->
    before(setup)
    after(teardown)
    it 'play with passport settings', (done) ->
        async.series([
            (cb) ->
                db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cloud.sagemath.com/auth'},  cb    : cb)
            (cb) ->
                db.get_passport_settings
                    strategy : 'site_conf'
                    cb       : (err, value) ->
                        expect(value).toEqual({auth:'https://cloud.sagemath.com/auth'})
                        cb(err)
        ], done)

describe 'user enumeration functionality: ', ->
    before(setup)
    after(teardown)
    it 'create many accounts, then enumerate search information about them', (done) ->
        num = 10
        async.series([
            (cb) ->
                f = (n, cb) ->
                    db.create_account(first_name:"Sage#{n}", last_name:"Math#{n}", created_by:"1.2.3.4",\
                              email_address:"sage#{n}@sagemath.com", password_hash:"sage#{n}", cb:cb)
                async.map([0...num],f,cb)
            (cb) ->
                db.all_users (err, users) ->
                    if err
                        cb(err); return
                    expect(users.length).toBe(num)
                    for n in [0...num]
                        expect(users[n]).toEqual(account_id:users[n].account_id, first_name: "Sage#{n}", last_name: "Math#{n}", search: "sage#{n} math#{n}")
                    cb()
            (cb) ->
                console.log("doing user_search")
                db.user_search
                    query : "sage"
                    limit : num - 2
                    cb    : (err, v) ->
                        expect(v.length).toBe(num-2)
                        cb(err)
            (cb) ->
                db.user_search
                    query : "sage0@sagemath.com"
                    cb    : (err, users) ->
                        expect(users.length).toBe(1)
                        n = 0
                        expect(users[0]).toEqual("email_address": "sage0@sagemath.com", account_id:users[n].account_id, first_name: "Sage#{n}", last_name: "Math#{n}")
                        cb(err)
        ], done)

describe 'banning of users: ', ->
    before(setup)
    after(teardown)
    account_id = undefined
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:(err, x) => account_id=x; done(err))
    it 'checks by account_id that the user we just created is not banned', (done) ->
        db.is_banned_user(account_id:account_id, cb:(err,x)=>expect(x).toBe(false); done(err))
    it 'checks by email that user is not banned', (done) ->
        db.is_banned_user(email_address:"sage@example.com", cb:(err,x)=>expect(x).toBe(false); done(err))
    it 'verifies that a user that does not exist is not banned', (done) ->
        db.is_banned_user(email_address:"sageXXX@example.com", cb:(err,x)=>expect(x).toBe(false); done(err))
    it 'bans the user we created', (done) ->
        db.ban_user(account_id:account_id, cb:done)
    it 'checks they are banned by account_id', (done) ->
        db.is_banned_user(account_id:account_id, cb:(err,x)=>expect(x).toBe(true); done(err))
    it 'checks they are banned by email address', (done) ->
        db.is_banned_user(email_address:"sage@example.com", cb:(err,x)=>expect(x).toBe(true); done(err))
    it 'unbans our banned user', (done) ->
        db.unban_user(account_id:account_id, cb:done)
    it 'checks that the user we just unbanned is unbanned', (done) ->
        db.is_banned_user(account_id:account_id, cb:(err,x)=>expect(x).toBe(false); done(err))
    it 'bans our user by email address instead', (done) ->
        db.ban_user(email_address:"sage@example.com", cb:done)
    it 'then checks that banning by email address worked', (done) ->
        db.is_banned_user(account_id:account_id, cb:(err,x)=>expect(x).toBe(true); done(err))

describe 'testing the passport table: ', ->
    before(setup)
    after(teardown)
    account_id = undefined
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:(err, x) => account_id=x; done(err))
    it 'creates a passport', (done) ->
        db.create_passport
            account_id : account_id
            strategy   : 'google'
            id         : '929304823048'
            profile    : {email_address:"sage@example.com", avatar:'James Cameron'}
            cb         : done
    it 'checks the passport we just created exists', (done) ->
        db.passport_exists
            strategy : 'google'
            id       : '929304823048'
            cb       : (err, x) ->
                expect(x).toBe(account_id)
                done(err)
    it 'check that a non-existent passport does not exist', (done) ->
        db.passport_exists
            strategy : 'google'
            id       : 'FAKE'
            cb       : (err, x) ->
                expect(x).toBe(undefined)
                done(err)
    it 'check that a passport we created above exists directly via checking the accounts entry', (done) ->
        db.get_account
            account_id : account_id
            columns : ['passports']
            cb      : (err, x) ->
                expect(x.passports).toEqual( 'google-929304823048': { avatar: 'James Cameron', email_address: 'sage@example.com' })
                done(err)
    it 'deletes the passport we made above', (done) ->
        db.delete_passport
            account_id : account_id
            strategy : 'google'
            id       : '929304823048'
            cb       : done
    it 'verifies the passport is really gone', (done) ->
        db.passport_exists
            strategy : 'google'
            id       : '929304823048'
            cb       : (err, x) ->
                expect(x).toBe(undefined)
                done(err)
    it 'check the passport is also gone from the accounts table', (done) ->
        db.get_account
            account_id : account_id
            columns    : ['passports']
            cb         : (err, x) ->
                expect(misc.keys(x.passports).length).toEqual(0)
                done(err)
    it 'create two passports and verifies that both exist', (done) ->
        async.series([
            (cb) ->
                db.create_passport
                    account_id : account_id
                    strategy   : 'google'
                    id         : '929304823048'
                    profile    : {email_address:"sage@example.com", avatar:'James Cameron'}
                    cb         : cb
            (cb) ->
                db.create_passport
                    account_id : account_id
                    strategy   : 'facebook'
                    id         : '12346'
                    profile    : {email_address:"sage@facebook.com", avatar:'Zuck'}
                    cb         : cb
            (cb) ->
                db.get_account
                    account_id : account_id
                    columns    : ['passports']
                    cb         : (err, x) ->
                        expect(misc.keys(x.passports).length).toEqual(2)
                        cb(err)
        ], done)



