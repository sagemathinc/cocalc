###
Watch a file for changes

Watch for changes to the given file.  Returns obj, which
is an event emitter with events:

   - 'change', ctime - when file changes or is created
   - 'delete' - when file is deleted

and a method .close().

The ctime might be undefined, in case it can't be determined.

If debounce is given, only fires after the file
definitely has not had its ctime changed
for at least debounce ms.  Does NOT fire when
the file first has ctime changed.
###

fs     = require('fs')
{EventEmitter} = require('events')

class exports.Watcher extends EventEmitter
    constructor: (path, interval, debounce) ->
        super()
        @path = path
        @interval = interval
        @debounce = debounce

        fs.watchFile(@path, {interval: @interval, persistent:false}, @_listen)

    close: () =>
        @removeAllListeners()
        fs.unwatchFile(@path, @listener)

    _listen: (curr, prev) =>
        if curr.dev == 0
            @emit('delete')
        else
            if @debounce
                @_emit_when_stable(true)
            else
                fs.stat @path, (err, stats) =>
                    if err
                        @emit('change')
                    else
                        @emit('change', stats.ctime)

    _emit_when_stable: (first) =>
        ###
        @_emit_when_stable gets called
        periodically until the last ctime of the file
        is at least @debounce ms in the past, or there
        is an error.
        ###
        if first and @_waiting_for_stable
            return
        @_waiting_for_stable = true
        fs.stat @path, (err, stats) =>
            if err
                # maybe file deleted; give up.
                delete @_waiting_for_stable
                return
            elapsed = new Date() - stats.ctime
            if elapsed < @debounce
                # File keeps changing - try again soon
                setTimeout((=>@_emit_when_stable(false)), Math.max(500, @debounce - elapsed + 100))
            else
                delete @_waiting_for_stable
                @emit('change', stats.ctime)

