"""


"""

{React}      = require('smc-webapp/smc-react')
express      = require('express')
misc         = require('smc-util/misc')
{defaults, required} = misc

{react}      = require('./react')
{Landing}    = require('smc-webapp/share/landing')

exports.share_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined

    router = express.Router()

    router.get '/', (req, res) ->
        react(res, <Landing />)
