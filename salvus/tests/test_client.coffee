async     = require("async")

conn = null

exports.setUp = (cb) ->
    conn = require("client_node").connect("http://localhost:5000")
    conn.on("connected", (proto) -> cb())

exports.tearDown = (cb) ->
    conn.on("close", cb)
    conn.close()

exports.test_exec = (test) ->
    test.expect(4)
    uuid = conn.execute_code('2+2', (mesg) ->
        test.equal(mesg.stdout, '4\n')
        test.equal(mesg.done, true)
        test.equal(mesg.event, 'output')
        test.equal(mesg.id, uuid)
        test.done())

exports.test_session = (test) ->
    test.expect(4)
    s = null
    v = []
    async.series([
        (cb) -> s = conn.new_session(); s.on("open", cb)
        (cb) -> s.execute_code("2+2;sys.stdout.flush();sleep(.5)",
                   (mesg) ->
                        v.push(mesg)
                        if mesg.done
                            cb()
                )
        (cb) ->
            test.equal(v[0].stdout, '4\n')
            test.equal(v[0].done, false)
            test.equal(v[1].stdout, '')
            test.equal(v[1].done, true)
            cb()
    ],()->test.done())

