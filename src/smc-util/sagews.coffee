###
Some functions for working with Sage worksheets (sagews files) --
###

diffsync  = require('./diffsync')

exports.find_cell_meta = (content, id, start) =>
    i = content.indexOf(diffsync.MARKERS.cell + id, start)
    j = content.indexOf(diffsync.MARKERS.cell, i+1)
    if j == -1
        return undefined
    return {start:i, end:j}

exports.get_cell_flagstring = (content, id) =>
    pos = exports.find_cell_meta(content, id)
    if pos?
        return content.slice(pos.start+37, pos.end)

exports.set_cell_flagstring = (content, id, flags) =>
    pos = exports.find_cell_meta(content, id)
    if pos?
        content = content.slice(0, pos.start+37) + flags + content.slice(pos.end)
    return content

exports.remove_cell_flag = (content, id, flag) =>
    s = exports.get_cell_flagstring(content, id)
    if not s?
        return content
    if flag in s
        content = exports.set_cell_flagstring(content, id, s.replace(new RegExp(flag, "g"), ""))
    return content
