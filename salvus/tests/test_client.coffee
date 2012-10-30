async     = require("async")


conn = null

exports.setUp = (cb) ->
    conn = require("client_node").connect("http://localhost:5000", cb)

exports.tearDown = (cb) ->
    conn.conn.close()

exports.test_exec = (test) ->
    test.expect(0)
    #    conn.execute_code('2+6', 
    test.done()
        