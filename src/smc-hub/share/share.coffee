###
The share express server.

###

express      = require('express')

misc         = require('smc-util/misc')
{defaults, required} = misc

exports.share_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined

    router = express.Router()

    router.get '/', (req, res) ->
        res.send("share router")

