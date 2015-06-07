{defaults} = misc = require('misc')
required = defaults.required

class RethinkDB
    constructor : (opts={}) ->
        opts = defaults opts,
            hosts    : ['localhost']
            db       : undefined
            password : undefined
            cb       : undefined

    
