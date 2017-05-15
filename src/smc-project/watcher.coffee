###
Watch a file for changes

Watch for changes to the given file.  Returns obj, which
is an event emitter with events:

   - 'change' - when file changes or is created
   - 'delete' - when file is deleted

and a method .close().
###

fs     = require('fs')
{EventEmitter} = require('events')

class exports.Watcher extends EventEmitter
    constructor: (@path, @interval, @debounce) ->
        fs.watchFile(@path, {interval: @interval}, @listen)

    close: () =>
        @removeAllListeners()
        fs.unwatchFile(@path, @listener)

    listen: (curr, prev) =>
        if curr.dev == 0
            @emit 'delete'
        else
            @emit 'change'

