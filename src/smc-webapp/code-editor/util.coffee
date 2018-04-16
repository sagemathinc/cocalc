###
Simple utility functions used by editors.
###

misc = require('smc-util/misc')

exports.aux_file = (path, ext) ->
    s = misc.path_split(path)
    if ext?
        s.tail += '.' + ext
    if s.head
        return s.head + '/.' + s.tail
    else
        return '.' + s.tail


exports.PRETTIER_SUPPORT = {'js':true, 'jsx':true, 'md':true, 'css':true, 'ts':true, 'tsx':true, 'json':true}