###########################################
#
# A vt100 console
#
###########################################
#


{EventEmitter} = require('events')
{filename_extension, required, defaults, to_json} = require('misc')

class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            session     : undefined
            title       : ""
            description : ""
