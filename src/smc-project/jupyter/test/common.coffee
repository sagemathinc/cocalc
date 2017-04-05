jupyter = require('../jupyter')

DEBUG = !! process.env['DEBUG']
console.log "DEBUG =", DEBUG

exports.kernel = (name, directory='') ->
    return jupyter.kernel(name: name, verbose: DEBUG, directory:directory)

