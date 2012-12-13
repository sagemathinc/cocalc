###########################################
#
# An Xterm Console Window
#
###########################################

{EventEmitter} = require('events')
{filename_extension, required, defaults, to_json} = require('misc')

class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            session     : undefined   # a console_session or a sage_session
            title       : ""
            
