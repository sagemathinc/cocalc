###
Simple utility functions used by editors.
###

misc = require('smc-util/misc')

exports.aux_file = (path, ext) ->
    s = misc.path_split(path)
    if ext?
        orig_ext = misc.filename_extension(s.tail)
        if not orig_ext
            s.tail += '.' + ext
        else
            s.tail = s.tail.slice(0, s.tail.length - orig_ext.length) + ext
    if s.head
        return s.head + '/.' + s.tail
    else
        return '.' + s.tail