jupyter = require('../jupyter')

DEBUG = !! process.env['DEBUG']
if DEBUG
    console.log "DEBUG =", DEBUG

exports.kernel = (name, path='') ->
    return jupyter.kernel(name: name, verbose: DEBUG, path:path)

exports.output = (v, f) ->
    s = ''
    for x in v
        if x.content?.data?
            return x.content.data
        if x.content?.text?
            s += x.content.text
        if x.content?.ename?
            return x.content
    return s
