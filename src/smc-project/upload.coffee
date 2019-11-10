###
Upload form handler
###

# Make sure this is consistent with src/smc-webapp/smc-dropzone.cjsx
MAX_FILE_SIZE_MB = 10000

fs         = require('fs')
async      = require('async')
mkdirp     = require('mkdirp')
formidable = require('formidable')
misc       = require('smc-util/misc')

exports.upload_endpoint = (express, logger) ->
    logger?.debug("upload_endpoint conf")

    router = express.Router()

    router.get '/.smc/upload', (req, res) ->
        logger?.debug("upload GET")
        res.send("hello")

    router.post '/.smc/upload', (req, res) ->
        dbg = (m...) -> logger?.debug("upload POST ", m...)
        # See https://github.com/felixge/node-formidable; user uploaded a file
        dbg()

        # See http://stackoverflow.com/questions/14022353/how-to-change-upload-path-when-use-formidable-with-express-in-node-js
        options =
            uploadDir      : process.env.HOME + '/' + req.query.dest_dir
            keepExtensions : true
        form = new formidable.IncomingForm(options)
        # Important to set this, since the default is a measly 2MB!
        # See https://stackoverflow.com/questions/13374238/how-to-limit-upload-file-size-in-express-js
        form.maxFileSize = MAX_FILE_SIZE_MB * 1024*1024;
        async.series([
            (cb) ->
                # ensure target path exists
                mkdirp(options.uploadDir, cb)
            (cb) ->
                form.parse req, (err, fields, files) ->
                    if err or not files.file? or not files.file.path? or not files.file.name?
                        dbg("upload of '#{files.file.name}' to '#{files.file.path}' FAILED ", err)
                        cb(err)
                        return
                    dbg("upload of '#{files.file.name}' to '#{files.file.path}' worked")
                    dest = process.env.HOME + '/' + (req.query.dest_dir ? '') + '/' + files.file.name
                    dbg("now move '#{files.file.path}' to '#{dest}'")
                    fs.rename files.file.path, dest, (err) ->
                        if err
                            dbg("error moving -- #{err}")
                            cb(err)
                        else
                            cb()
        ], (err) ->
            if err
                res.status(500).send("upload failed -- #{err}")
            else
                res.send('received upload:\n\n')
        )

    return router
