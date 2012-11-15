async     = require("async")

message = require("message")
misc    = require("misc")

conn = null

exports.setUp = (cb) ->
    conn = require("client_node").connect("http://localhost:5000")
    conn.on("connected", (proto) -> cb())

exports.tearDown = (cb) ->
    conn.on("close", cb)
    conn.close()

# credentials of an account we create and will use for some tests.
email_address = "#{misc.uuid()}@salv.us"
password = "#{misc.uuid()}"

exports.test_account_management = (test) ->
    test.expect(23)
    new_password = null
    async.series([
        (cb) ->
            conn.create_account(
                first_name    : ''
                last_name     : ''
                email_address : 'salvusmath-gmail.com'
                password      : 'qazqazqazqaz'
                agreed_to_terms : false
                timeout       : 1
                cb:(error, mesg) ->
                    test.ok(not error, 'should not get connection error creating account')
                    # Verify that account creation requires the terms of service to be agreed to
                    test.equal(mesg.event,'account_creation_failed', "should get an account creation error")
                    test.equal(mesg.reason.agreed_to_terms?, true, "should get an error about terms of usage")
                    # Verify that first_name and last_name must both be nonempty.
                    test.equal(mesg.reason.first_name?, true, "should get an error about missing first name")
                    test.equal(mesg.reason.last_name?, true, "should get an error about missing last name")
                    # Verify that email address must be valid
                    test.equal(mesg.reason.email_address?, true, "should get an error about missing email address")
                    # Verify that weak passwords are checked for -- disabled, because they are not right now
                    # test.equal(mesg.reason.password?, true, "should get an error about the password")
                    test.equal(mesg.reason.password?, false, "shouldn't get an error about the password")
                    cb()
            )
        
        # Create a valid account
        (cb) ->
            conn.create_account(
                first_name    : 'Salvus'
                last_name     : 'Math'
                email_address : email_address
                password      : password
                agreed_to_terms: true
                timeout       : 1
                cb:(error, mesg) ->
                    test.ok(not error, "should not get connection error when creating account second time")
                    test.equal(mesg.event, 'signed_in', "event type should be 'signed_in'")
                    test.equal(mesg.first_name, 'Salvus', "first name should be 'Salvus'")
                    test.equal(mesg.last_name, 'Math', "last name should be 'Math'")
                    test.equal(mesg.email_address, email_address, "email address should be as generated")
                    cb()
            )

        # Attempt to sign in to the account we just created -- first with the wrong password
        (cb) ->
            conn.sign_in(
                email_address : email_address
                password      : password + 'wrong'
                timeout       : 1
                cb            : (error, mesg) ->
                    test.ok(not error, "should not get a comm error when signing in")
                    test.equal(mesg.event, "sign_in_failed", "should get a sign_in_failed event")
                    cb()
            )
            
        
        # "Sign in to the account we just created -- now with the right password"
        (cb) ->
            conn.sign_in(
                email_address : email_address
                password      : password
                timeout       : 1
                cb            : (error, mesg) ->
                    test.equal(mesg.event, "signed_in", "should successfully sign in")
                    test.equal(mesg.first_name, "Salvus", "first name should be 'Salvus'")
                    test.equal(mesg.last_name, "Math", "last name should be 'Math'")
                    test.equal(mesg.email_address, email_address, "email address should be as generated")
                    cb()
            )

        # Change password
        (cb) ->
            new_password = "#{misc.uuid()}"
            conn.change_password(
                email_address : email_address
                old_password  : password
                new_password  : new_password
                cb            : (error, mesg) ->
                    test.ok(not error, "should not get a communcations error when changing password") 
                    test.equal(mesg.event, 'changed_password', "should get a changed_password event")
                    test.equal(mesg.error, false, "should have the error property set to false")
                    cb()
            )

        # Verify that the password is really changed
        (cb) ->
            password = new_password # for other tests to use
            conn.sign_in(
                email_address : email_address
                password      : new_password
                timeout       : 1
                cb            : (error, mesg) ->
                    test.equal(mesg.event, "signed_in", "sign in should result in a signed_in event")
                    test.equal(mesg.email_address, email_address, "the email address upon sign_in should match")
                    cb()
            )
            
    ], () -> test.done())

exports.test_user_feedback = (test) ->
    email_address = "#{misc.uuid()}@salv.us"
    password = "#{misc.uuid()}"
    test.expect(2)
    async.series([
        (cb) ->
            conn.create_account
                first_name    : 'Salvus'
                last_name     : 'Math'
                email_address : email_address
                password      : password
                agreed_to_terms: true
                timeout       : 1
                cb            : (error, results) -> cb()
        (cb) ->
            conn.sign_in
                email_address : email_address
                password      : password
                timeout       : 1
                cb            : (error, results) -> cb()
        (cb) -> 
            conn.report_feedback
                category : 'bug'
                description: "there is a bug"
                nps : 3
                cb : (err, results) -> cb()
        (cb) -> 
            conn.report_feedback
                category : 'idea'
                description: "there is a bug"
                nps : 3
                cb : (err, results) -> cb()
        (cb) ->
            conn.feedback
                cb: (err, results) ->
                    test.ok(not err, 'error reading feedback #{err}')
                    test.equal(results.length, 2, 'length of resulting feedback wrong #{results}')
                    cb()
    ], () -> test.done())
    

exports.test_conn = (test) ->
    test.expect(10)
    async.series([
        (cb) ->
            conn.sign_in
                email_address : email_address
                password      : password
                timeout       : 1
                cb            : (error, results) -> test.ok(not error); cb()
        (cb) ->
            uuid = conn.execute_code(
                code : '2+2'
                cb   : (mesg) ->
                    test.equal(mesg.stdout, '4\n', 'output should be 4')
                    test.equal(mesg.done, true, 'done should be true')
                    test.equal(mesg.event, 'output', 'event should be "output"')
                    test.equal(mesg.id, uuid, 'id should be the uuid'); cb()
            )
        (cb) ->
            conn.on('ping', (tm) -> test.ok(tm<1); cb())
            conn.ping()
        # test the call mechanism for doing a simple ping/pong message back and forth
        (cb) ->
            conn.call(
                message : message.ping()
                cb      : (error, mesg) -> (test.equal(mesg.event,'pong', "should get pong (no timeout)"); cb())
            )
        # test the call mechanism for doing a simple ping/pong message back and forth -- but with a timeout that is *not* triggered
        (cb) ->
            conn.call(
                message : message.ping()
                timeout : 2  # 2 seconds
                cb      : (error, mesg) -> (test.equal(mesg.event,'pong', "should get pong (timeout 2)"); cb())
            )
        # test sending a message that times out.
        (cb) ->
            conn.call(
                message : message.execute_code(code:'sleep(2)', allow_cache:false)
                timeout : 0.1
                cb      : (error, mesg) -> test.ok(error, 'should get an error'); test.equal(mesg.event,'error', 'event should be error'); cb()
            )
    ], () -> test.done())

exports.test_session = (test) ->
    test.expect(10)
    s = undefined
    v = []
    async.series([
        (cb) ->
            conn.sign_in
                email_address : email_address
                password      : password
                timeout       : 1
                cb            : (error, results) -> test.ok(not error); cb()
                
        # create a session that will time out after 5 seconds (just in case of failure)
        (cb) ->
            conn.new_session
                limits:{walltime:5, cputime:5}
                cb: (error, session) ->
                    if error
                        test.ok(false)
                        cb(true) # game over
                    else
                        test.ok(session)
                        s = session
                        s.on("open", cb)
                        cb()
                    
        # execute some code that will produce at least 2 output messages, and collect all messages
        (cb) ->
            s.execute_code
                code: "2+2;sys.stdout.flush();sleep(.5)"
                cb: (mesg) ->
                    v.push(mesg)
                    if mesg.done
                        cb()
                        
        # make some checks on the messages
        (cb) ->
            test.equal(v[0].stdout, '4\n', 'first output is 4')
            test.equal(v[0].done, false, 'not done after first output')
            test.equal(v[1].stdout, '', 'second output is empty')
            test.equal(v[1].done, true, 'done after second output')
            cb()

        (cb) ->
            test.ok(s.walltime() >= .5, 'verify that the walltime method on the session is sane')
            cb()

        # preparser: false
        (cb) ->
            s.execute_code
                code : "2^3 + 1/3"
                preparse : false
                cb   : (mesg) ->
                    test.equal(mesg.stdout,'1\n','evaluate a silly expression without the Sage preparser')
                    cb()
            
        # start a computation going, then interrupt it and do something else
        (cb) ->
            s.execute_code(
                code:'print(1);sys.stdout.flush();sleep(10)', 
                cb: (mesg) ->
                    if not mesg.done
                        test.equal(mesg.stdout,'1\n', 'test that we get 1 from interrupted computation')
                        s.interrupt()
                    else
                        test.equal(mesg.stderr?.slice(0,5),'Error', 'test that there is an error message from interrupting')
                        cb()
            )
    ],()->s?.kill(); test.done())

