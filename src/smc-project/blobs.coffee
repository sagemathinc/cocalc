###
Saving blobs to hub

SageMathCloud: Collaborative web-based SageMath, Jupyter, LaTeX and Terminals.
Copyright 2015, SageMath, Inc., GPL v3.
###

misc      = require('smc-util/misc')
message   = require('smc-util/message')
winston = require('winston')

{defaults, required} = misc

_save_blob_callbacks = {}
exports.receive_save_blob_message = (opts) ->  # temporarily used by file_session_manager
    opts = defaults opts,
        sha1    : required
        cb      : required
        timeout : 30  # maximum time in seconds to wait for response message
    winston.debug("receive_save_blob_message: #{opts.sha1}")
    sha1 = opts.sha1
    id = misc.uuid()
    if not _save_blob_callbacks[sha1]?
        _save_blob_callbacks[sha1] = [[opts.cb, id]]
    else
        _save_blob_callbacks[sha1].push([opts.cb, id])

    # Timeout functionality -- send a response after opts.timeout seconds,
    # in case no hub responded.
    if not opts.timeout
        return
    f = () ->
        v = _save_blob_callbacks[sha1]
        if v?
            mesg = message.save_blob
                sha1  : sha1
                error : "timed out after local hub waited for #{opts.timeout} seconds"

            w = []
            for x in v   # this is O(n) instead of O(1), but who cares since n is usually 1.
                if x[1] == id
                    x[0](mesg)
                else
                    w.push(x)

            if w.length == 0
                delete _save_blob_callbacks[sha1]
            else
                _save_blob_callbacks[sha1] = w

    setTimeout(f, opts.timeout*1000)

exports.handle_save_blob_message = (mesg) ->
    winston.debug("handle_save_blob_message: #{mesg.sha1}")
    v = _save_blob_callbacks[mesg.sha1]
    if v?
        for x in v
            x[0](mesg)
        delete _save_blob_callbacks[mesg.sha1]