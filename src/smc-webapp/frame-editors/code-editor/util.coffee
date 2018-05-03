###
Simple utility functions used by editors.

DELETE and use frame-tree/util.ts instead!!
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

exports.raw_url = (project_id, path) ->
    return "#{window.app_base_url}/#{project_id}/raw/#{path}"

exports.PRETTIER_SUPPORT = {'js':true, 'jsx':true, 'md':true, 'css':true, 'ts':true, 'tsx':true, 'json':true}
