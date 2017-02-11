###
Test suite for PostgreSQL interface and functionality.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown

async  = require('async')
expect = require('expect')

misc = require('smc-util/misc')

describe 'working with accounts: ', ->
    @timeout(5000)
    before(setup)
    after(teardown)
    it "checks that the account we haven't made yet doesn't already exist", (done) ->
        db.account_exists
            email_address: 'sage@example.com'
            cb:(err, exists) -> expect(!!exists).toBe(false); done(err)
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
            cb:(err, exists) -> expect(!!exists).toBe(true); done(err)
    it "verifies that there is 1 account in the database via a count", (done) ->
        db.count
            table : 'accounts'
            cb : (err, n) -> expect(n).toBe(1); done(err)
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
            cb:(err, exists) -> expect(!!exists).toBe(false); done(err)
    it "creates an account with no password set", (done) ->
        db.create_account(first_name:"Simple", last_name:"Sage", created_by:"1.2.3.4",\
                          email_address:"simple@example.com", cb:done)
    it "verifies that the password_is_set field is false", (done) ->
        db.get_account
            email_address:'simple@example.com'
            cb:(err, account) -> expect(account.password_is_set).toBe(false); done(err)

describe 'working with logs: ', ->
    before(setup)
    after(teardown)

    it 'creates a log message', (done) ->
        db.log
            event : "test"
            value : "a message"
            cb    : done

    it 'gets contents of the log and checks that the message we made is there', (done) ->
        db.get_log
            start : new Date(new Date() - 10000000)
            end   : new Date()
            event : 'test'
            cb    : (err, log) ->
                expect(log.length).toBe(1)
                expect(log[0]).toEqual(event:'test', value:'a message', id:log[0].id, time:log[0].time)
                done(err)

    it 'checks that there is nothing "old" in the log', (done) ->
        # no old stuff
        db.get_log
            start : new Date(new Date() - 10000000)
            end   : new Date(new Date() - 1000000)
            cb    : (err, log) -> expect(log.length).toBe(0); done(err)

    account_id = '4d29eec4-c126-4f06-b679-9a661fd7bcdf'
    error = 'Your internet connection is unstable/down or SMC is temporarily not available. Therefore SMC is not working.'
    event = 'test'
    it 'logs a client error', (done) ->
        db.log_client_error
            event      : event
            error      : error
            account_id : account_id
            cb         : done
    it 'logs another client error with a different event', (done) ->
        db.log_client_error
            event      : event + "-other"
            error      : error
            account_id : account_id
            cb         : done
    it 'gets the recent error log for only one event and checks that it has only one log entry in it', (done) ->
        db.get_client_error_log
            start : new Date(new Date() - 10000000)
            end   : new Date()
            event : event
            cb    : (err, log) ->
                expect(log.length).toBe(1)
                expect(log[0]).toEqual(event:event, error:error, account_id:account_id, id:log[0].id, time:log[0].time)
                done(err)
    it 'gets old log entries and makes sure there are none', (done) ->
        db.get_client_error_log
            start : new Date(new Date() - 10000000)
            end   : new Date(new Date() - 1000000)
            event : event
            cb    : (err, log) -> expect(log.length).toBe(0); done(err)

describe 'testing working with blobs: ', ->
    beforeEach(setup)
    afterEach(teardown)
    {uuidsha1} = require('smc-util-node/misc_node')
    project_id = misc.uuid()
    it 'creating a blob and reading it', (done) ->
        blob = new Buffer("This is a test blob")
        async.series([
            (cb) ->
                db.save_blob(uuid : uuidsha1(blob), blob : blob, project_id : project_id, cb   : cb)
            (cb) ->
                db.count
                    table : 'blobs'
                    cb    : (err, n) ->
                        expect(n).toBe(1)
                        cb(err)
            (cb) ->
                db.get_blob
                    uuid : uuidsha1(blob)
                    cb   : (err, blob2) ->
                        expect(blob2.equals(blob)).toBe(true)
                        cb(err)
        ], done)

    it 'tries to save a blob with an invalid uuid and gets an error', (done) ->
        db.save_blob
            uuid       : 'not a uuid'
            blob       : new Buffer("This is a test blob")
            project_id : project_id
            cb         : (err) ->
                expect(err).toEqual('uuid is invalid')
                done()

    it 'save a string blob (with a null byte!), and confirms it works (properly converted to Buffer)', (done) ->
        async.series([
            (cb) ->
                db.save_blob(blob: 'my blob', project_id: project_id, cb: cb)
            (cb) ->
                db.get_blob
                    uuid : uuidsha1('my blob')
                    cb   : (err, blob2) ->
                        expect(blob2?.toString()).toEqual('my blob')
                        cb(err)
        ], done)

    it 'creating 50 blobs and verifying that 50 are in the table', (done) ->
        async.series([
            (cb) ->
                f = (n, cb) ->
                    blob = new Buffer("x#{n}")
                    db.save_blob(uuid : uuidsha1(blob), blob : blob, project_id : project_id, cb   : cb)
                async.map([0...50], f, cb)
            (cb) ->
                db.count
                    table : 'blobs'
                    cb    : (err, n) ->
                        expect(n).toBe(50)
                        cb(err)
        ], done)

    it 'creating 5 blobs that expire in 0.01 second and 5 that do not, then wait 0.15s, delete_expired, then verify that the expired ones are gone from the table', (done) ->
        async.series([
            (cb) ->
                f = (n, cb) ->
                    blob = new Buffer("x#{n}")
                    db.save_blob(uuid : uuidsha1(blob), blob : blob, project_id : project_id, cb : cb, ttl:if n<5 then 0.01 else 0)
                async.map([0...10], f, cb)
            (cb) ->
                setTimeout(cb, 150)
            (cb) ->
                db.delete_expired(cb:cb)
            (cb) ->
                db.count
                    table : 'blobs'
                    cb    : (err, n) ->
                        expect(n).toBe(5)
                        cb(err)
        ], done)

    it 'creating a blob that expires in 0.01 seconds, then extending it to never expire; wait, delete, and ensure it is still there', (done) ->
        blob = "a blob"
        uuid = uuidsha1(blob)
        async.series([
            (cb) ->
                db.save_blob(uuid : uuid, blob : blob, project_id : project_id, cb : cb, ttl:0.01)
            (cb) ->
                db.remove_blob_ttls(uuids:[uuid], cb:cb)
            (cb) ->
                setTimeout(cb, 100)
            (cb) ->
                db.count
                    table : 'blobs'
                    cb    : (err, n) ->
                        expect(n).toBe(1)
                        cb(err)
        ], done)

describe 'testing the hub servers registration table: ', ->
    beforeEach(setup)
    afterEach(teardown)
    it 'test registering a hub that expires in 0.05 seconds, test is right, then wait 0.1s, delete_expired, then verify done', (done) ->
        async.series([
            (cb) ->
                db.register_hub(host:"smc0", port:5000, clients:17, ttl:0.05, cb:cb)
            (cb) ->
                db.get_hub_servers cb:(err, v) ->
                    expect(v.length).toBe(1)
                    expect(v[0]).toEqual({host:"smc0-5000", port:5000, clients:17, expire:v[0].expire})
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

describe 'testing the server settings table: ', ->
    before(setup)
    after(teardown)
    it 'sets a server setting', (done) ->
        db.set_server_setting
            name  : 'name'
            value : "some stuff"
            cb    : done
    it 'reads that setting back', (done) ->
        db.get_server_setting
            name : 'name'
            cb   : (err, value) ->
                expect(value).toEqual("some stuff")
                done(err)

describe 'testing the passport settings table: ', ->
    before(setup)
    after(teardown)
    it 'creates the site_conf passport auth', (done) ->
        db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cloud.sagemath.com/auth'},  cb: done)
    it 'verifies that the site_conf passport was created', (done) ->
        db.get_passport_settings
            strategy : 'site_conf'
            cb       : (err, value) ->
                expect(value).toEqual({auth:'https://cloud.sagemath.com/auth'})
                done(err)

describe 'user enumeration functionality: ', ->
    before(setup)
    after(teardown)
    num = 20
    it "creates #{num} accounts", (done) ->
        f = (n, cb) ->
            db.create_account(first_name:"Sage#{n}", last_name:"Math#{n}", created_by:"1.2.3.4",\
                      email_address:"sage#{n}@sagemath.com", password_hash:"sage#{n}", cb:cb)
        async.map([0...num], f, done)
    it "searches for users using the 'sage' query", (done) ->
        db.user_search
            query : "sage"
            limit : num - 2
            cb    : (err, v) ->
                expect(v.length).toBe(num-2)
                done(err)
    it "searches for the user with email sage0@sagemath.com", (done) ->
        db.user_search
            query : "sage0@sagemath.com"
            cb    : (err, users) ->
                expect(users.length).toBe(1)
                n = 0
                expect(users[0]).toEqual("email_address": "sage0@sagemath.com", account_id:users[n].account_id, first_name: "Sage#{n}", last_name: "Math#{n}")
                done(err)
    it "searches for the non-existent user with email sageBLAH@sagemath.com", (done) ->
        db.user_search
            query : "sageBLAH@sagemath.com"
            cb    : (err, users) -> expect(users.length).toBe(0); done(err)

    account_id = undefined
    it "adds another user", (done) ->
        db.create_account(first_name:"FOO", last_name:"BAR", created_by:"1.2.3.4",\
                  email_address:"foo@sagemath.com", password_hash:"sage", cb:(err, x) -> account_id=x; done(err))
    it "then checks that the new user is found by first name", (done) ->
        db.user_search
            query : "FOO"
            cb    : (err, users) -> expect(users.length).toBe(1); done(err)
    it "then checks that the new user is found by last name", (done) ->
        db.user_search
            query : "BAR"
            cb    : (err, users) -> expect(users.length).toBe(1); done(err)
    it "change that user in place", (done) ->
        db._query
            query : "UPDATE accounts"
            set   : {first_name:'VERT', last_name:'RAMP'}
            where : "account_id = $":account_id
            cb    : done
    it "then checks that the modified user is found", (done) ->
        db.user_search
            query : "VERT"
            cb    : (err, users) -> expect(users.length).toBe(1); done(err)
    it "but the previous name is not found", (done) ->
        db.user_search
            query : "BAR"
            cb    : (err, users) -> expect(users.length).toBe(0); done(err)

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

describe 'testing file use notifications table: ', ->
    before(setup)
    after(teardown)
    account_id = undefined
    project_id = undefined
    path0 = "test_file"
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:(err, x) => account_id=x; done(err))
    it 'creates a project', (done) ->
        db.create_project(account_id:account_id, title:"Test project", description:"The description",\
                    cb:(err, x) => project_id=x; done(err))
    it "record editing of file '#{path0}'", (done) ->
        db.record_file_use(project_id: project_id, path:path0, account_id:account_id, action:"edit", cb:done)
    it "get activity for project and '#{path0}'", (done) ->
        db.get_file_use(project_id: project_id, path      : path0, max_age_s : 1000, cb:(err, x)->
            expect(x.project_id).toBe(project_id)
            expect(x.path).toBe(path0)
            expect(misc.keys(x.users)).toEqual([account_id])
            expect(misc.keys(x.users[account_id])).toEqual(['edit'])
            done(err)
        )
    it "get activity for the project and ensure there was is instance of activity", (done) ->
        db.get_file_use(project_id: project_id, max_age_s : 1000, cb:(err, x)-> expect(x.length).toBe(1); done(err))

    path1 = "another_file"
    project_id1 = undefined
    it 'creates another project', (done) ->
        db.create_project(account_id:account_id, title:"Test project 2", description:"The description 2",\
                    cb:(err, x) => project_id1=x; done(err))

    it "tests recording activity on another file '#{path1}'", (done) ->
        db.record_file_use(project_id: project_id1, path:path1, account_id:account_id, action:"edit", cb:done)

    it "gets activity only for the second project and checks there is only one entry", (done) ->
        db.get_file_use(project_id: project_id1,  max_age_s : 1000, cb:(err, x)->  expect(x.length).toBe(1); done(err))

    it "gets activity for both projects and checks there are two entries", (done) ->
        db.get_file_use(project_ids:[project_id, project_id1], max_age_s : 1000, cb:(err, x)->  expect(x.length).toBe(2); done(err))

    it "gets all info about a project", (done) ->
        db.get_project
            project_id : project_id
            cb         : (err, info) ->
                expect(info?.title).toEqual('Test project')
                expect(info?.project_id).toEqual(project_id)
                done(err)

    account_id1 = undefined
    path2 = "a_third_file"
    it 'creates another account', (done) ->
        db.create_account(first_name:"Sage1", last_name:"Math1", created_by:"1.2.3.4",\
                          email_address:"sage1@example.com", password_hash:"blah1", cb:(err, x) => account_id1=x; done(err))
    it "records activity by new user on '#{path0}", (done) ->
        db.record_file_use(project_id: project_id, path:path0, account_id:account_id1, action:"edit", cb:done)
    it "checks that there is still one activity entry for first project", (done) ->
        db.get_file_use(project_id: project_id, max_age_s : 1000, cb:(err, x)->  expect(x.length).toBe(1); done(err))
    it "checks two users are listed as editors on '#{path0}'", (done) ->
        db.get_file_use(project_id: project_id, path: path0, max_age_s : 1000, cb:(err, x)-> expect(misc.keys(x.users).length).toBe(2); done(err))
    it "records activity by new user on '#{path2}", (done) ->
        db.record_file_use(project_id: project_id, path:path2, account_id:account_id1, action:"edit", cb:done)
    it "checks that there are two activity entries now for first project", (done) ->
        db.get_file_use(project_id: project_id, max_age_s : 1000, cb:(err, x)->  expect(x.length).toBe(2); done(err))
    it "gets activity for both projects and checks there are now three entries", (done) ->
        db.get_file_use(project_ids:[project_id, project_id1], max_age_s : 1000, cb:(err, x)->  expect(x.length).toBe(3); done(err))

    it "verifies that max_age_s filter works", (done) ->
        f = () ->
            db.get_file_use(project_ids:[project_id, project_id1], max_age_s:0.05, cb:(err, x)->  expect(x.length).toBe(0); done(err))
        setTimeout(f,100)

    it "records edit action again on a file by a user and verifies that this changes the last_edited field", (done) ->
        last_edited = undefined
        async.series([
            (cb) ->
                db.get_file_use(project_id:project_id, path: path0, max_age_s:1000, cb:(err, x)-> last_edited=x.last_edited; cb(err))
            (cb) ->
                db.record_file_use(project_id:project_id, path:path0, account_id:account_id, action:"edit", cb:cb)
            (cb) ->
                db.get_file_use(project_id:project_id, path: path0, max_age_s:1000, cb:(err, x)-> expect(last_edited).toNotBe(x.last_edited); cb(err))
        ], done)

    it "records seen action on a file by a user and verifies that this does not change the last_edited field and adds seen info", (done) ->
        async.series([
            (cb) ->
                db.record_file_use(project_id:project_id, path:path0, account_id:account_id, action:"seen", cb:cb)
            (cb) ->
                db.get_file_use(project_id:project_id, path: path0, max_age_s:1000, cb:(err, x)->
                    expect(x.users[account_id].seen?).toBe(true)
                    expect(x.users[account_id].read?).toBe(false)
                    cb(err))
        ], done)


describe 'doing a "naked update"', ->
    it 'is an error', (done) ->
        db._query
            query : "UPDATE accounts SET first_name='William'"
            cb    : (err) ->
                expect(err).toEqual("ERROR -- Dangerous UPDATE or DELETE without a WHERE, TRIGGER, or INSERT:  query='UPDATE accounts SET first_name='William''")
                done()

