jupyter = require('../jupyter')

DEBUG = !! process.env['DEBUG']
console.log "DEBUG =", DEBUG 

exports.kernel = (name) ->
    return jupyter.kernel(name: name, verbose: DEBUG)

