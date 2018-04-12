misc = require('smc-util/misc')

exports.parse_path = (path) ->
    x = misc.path_split(path)
    dir = x.head
    y = misc.separate_file_extension(x.tail)
    return {directory:x.head, base:y.name, filename:x.tail}
