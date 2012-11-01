async     = require("async")

message = require("message")

conn = null

exports.setUp = (cb) ->
    conn = require("client_node").connect("http://localhost:5000")
    conn.on("connected", (proto) -> cb())

exports.tearDown = (cb) ->
    conn.on("close", cb)
    conn.close()

exports.test_conn = (test) ->
    test.expect(9)
    async.series([
        (cb) ->
            uuid = conn.execute_code(
                code : '2+2'
                cb   : (mesg) ->
                    test.equal(mesg.stdout, '4\n')
                    test.equal(mesg.done, true)
                    test.equal(mesg.event, 'output')
                    test.equal(mesg.id, uuid); cb()
            )
        (cb) ->
            conn.on('ping', (tm) -> test.ok(tm<1); cb())
            conn.ping()
        # test the call mechanism for doing a simple ping/pong message back and forth
        (cb) ->
            conn.call(
                message : message.ping()
                cb      : (error, mesg) -> (test.equal(mesg.event,'pong'); cb())
            )
        # test the call mechanism for doing a simple ping/pong message back and forth -- but with a timeout that is *not* triggered
        (cb) ->
            conn.call(
                message : message.ping()
                timeout : 2  # 2 seconds
                cb      : (error, mesg) -> (test.equal(mesg.event,'pong'); cb())
            )
        # test sending a message that times out.
        (cb) ->
            conn.call(
                message : message.execute_code(code:'sleep(2)', allow_cache:false)
                timeout : 0.1
                cb      : (error, mesg) -> test.equal(error,true); test.equal(mesg.event,'error'); cb()
            )
    ], () -> test.done())

exports.test_session = (test) ->
    test.expect(8)
    s = null
    v = []
    async.series([
        # create a session that will time out after 5 seconds (just in case)
        (cb) -> s = conn.new_session(walltime:10); s.on("open", cb)
        # execute some code that will produce at least 2 output messages, and collect all messages
        (cb) -> s.execute_code(
                    code: "2+2;sys.stdout.flush();sleep(.5)",
                    cb: (mesg) ->
                        v.push(mesg)
                        if mesg.done
                            cb()
                )
        # make some checks on the messages
        (cb) ->
            test.equal(v[0].stdout, '4\n')
            test.equal(v[0].done, false)
            test.equal(v[1].stdout, '')
            test.equal(v[1].done, true)
            cb()
        # verify that the walltime method on the session is sane
        (cb) ->
            test.ok(s.walltime() >= .5)
            cb()
        # evaluate a silly expression without the Sage preparser
        (cb) ->
            s.execute_code(
                code:"2^3 + 1/3",
                cb:(mesg) -> test.equal(mesg.stdout,'1\n'); cb(),
                preparse:false
            )
        # start a computation going, then interrupt it and do something else
        (cb) ->
            s.execute_code(
                code:'print(1);sys.stdout.flush();sleep(10)', 
                cb: (mesg) ->
                    if not mesg.done
                        test.equal(mesg.stdout,'1\n')
                        s.interrupt()
                    else
                        test.equal(mesg.stderr.slice(0,5),'Error')
                        cb()
            )
    ],()->s.kill(); test.done())

