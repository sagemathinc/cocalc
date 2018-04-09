###
Utilities for testing
###

async = require('async')

misc = require('smc-util/misc')
{required, defaults} = misc

###
Set the given line in the given codemirror instance to be empty.
Then simultate typing the given content into the line.
When done verify that the result is as it should be.
###
exports.test_line = (opts) ->
    opts = defaults opts,
        cm      : required
        length  : 48
        line    : 1
        burst   : 10
        delay   : 500  # wait in ms before "typing" chunks
        wait    : 2500 # wait this long between main steps
        cb      : undefined
    if opts.cm.__test_line
        throw Error("already testing this cm!")
    opts.cm.__test_line = true
    n       = opts.length
    alpha   = (String.fromCharCode(65+i) for i in [0...26]).join('')
    content = (alpha for i in [0...Math.ceil(opts.length/alpha.length)]).join(' ')
    content = content.slice(0, opts.length)
    line    = opts.line - 1

    # empty the line
    opts.cm.replaceRange('\n', {line:line,ch:0}, {line:line+1,ch:0})

    f = (i, cb) ->
        console.log('chunk', i)
        # put this chunk at the end of the line
        chunk = content.slice(i*opts.burst, (i+1)*opts.burst)
        opts.cm.replaceRange(opts.cm.getLine(line) + chunk + '\n', {line:line,ch:0}, {line:line+1,ch:0})
        if opts.cm.getLine(line) != content.slice(0, (i+1)*opts.burst)
            cb("ERROR: corrupted!")
            return
        setTimeout(cb, opts.delay)

    verify = (cb) ->  # not really async...
        console.log 'verifying...'
        if opts.cm.getLine(line) != content
            console.log("content='#{content}'")
            console.log("getLine='#{opts.cm.getLine(line)}'")
            cb("FAIL -- input was corrupted!")
        else
            cb()

    async.series([
        (cb) ->
            console.log 'do test, starting at ', new Date()
            opts.cm.replaceRange("\n", {line:line,ch:0}, {line:line+1,ch:0})
            async.mapSeries([0..Math.floor(n/opts.burst)], f, cb)
        (cb) ->
            verify(cb)
        (cb) ->
            console.log 'wait before verifying second time.'
            setTimeout(cb, opts.wait)
        (cb) ->
            verify(cb)
    ], (err) ->
        delete opts.cm.__test_line
        if err
            console.warn("FAIL -- ", err)
        else
            console.log("SUCCESS")
        opts.cb?(err)
    )
