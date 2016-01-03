###
Some functions for working with Sage worksheets (sagews files) --
###

diffsync  = require('./diffsync')

class SageWS
    constructor: (@content) ->

    find_cell_meta: (id, start) =>
        i = @content.indexOf(diffsync.MARKERS.cell + id, start)
        j = @content.indexOf(diffsync.MARKERS.cell, i+1)
        if j == -1
            return undefined
        return {start:i, end:j}

    get_cell_flagstring: (id) =>
        pos = @find_cell_meta(id)
        if pos?
            return @content.slice(pos.start+37, pos.end)

    set_cell_flagstring: (id, flags) =>
        pos = @find_cell_meta(id)
        if pos?
            @content = @content.slice(0, pos.start+37) + flags + @content.slice(pos.end)

    remove_cell_flag: (id, flag) =>
        s = @get_cell_flagstring(id)
        if s? and flag in s
            @content = @set_cell_flagstring(id, s.replace(new RegExp(flag, "g"), ""))

exports.sagews = (content) ->
    return new SageWS(content)