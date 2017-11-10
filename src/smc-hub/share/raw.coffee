###
The raw router.
###

os_path      = require('path')

express      = require('express')

misc         = require('smc-util/misc')
{defaults, required} = misc

{public_access_request} = require('./access')

exports.raw_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined

    router = express.Router()

    router.get '/', (req, res) ->
        res.send("raw router")

    router.get '*', (req, res) ->
        project_id = req.path.slice(1,37)
        if not misc.is_valid_uuid_string(project_id)
            res.status(404).end()
            return
        path = req.path.slice(38)
        public_access_request
            database   : opts.database
            project_id : project_id
            path       : path
            cb         : (err, is_public) ->
                if err
                    # TODO
                    res.send("error: ", err)
                else if not is_public
                    res.status(404).end()
                else
                    dir = opts.path.replace('[project_id]', project_id)
                    res.sendFile(os_path.join(dir, path))
