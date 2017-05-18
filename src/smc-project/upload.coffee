###
Upload form handler
###

formidable  = require('formidable')
misc = require('smc-util/misc')

exports.upload_endpoint = (express, logger) ->
    logger?.debug("upload_endpoint conf")

    router = express.Router()

    router.get '/.smc/upload', (req, res) ->
        logger?.debug("upload GET")
        res.send("hello")

    router.post '/.smc/upload', (req, res) ->
        # See https://github.com/felixge/node-formidable; user uploaded a file
        logger?.debug("upload POST")
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
            if err or not files.file? or not files.file.path? or not files.file.name?
                e = "file upload failed -- #{misc.to_safe_str(err)} -- #{misc.to_safe_str(files)}"
                logger?.debug(e)
                res.status(500).send(e)
            else
                logger?.debug("upload of '#{files.file.name}' to '#{files.file.path}' worked")
                res.send('received upload:\n\n')

    return router
