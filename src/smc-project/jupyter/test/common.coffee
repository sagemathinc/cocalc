jupyter = require('../jupyter')

exports.kernel = (name) ->
    return jupyter.kernel(name: name, verbose: false)

