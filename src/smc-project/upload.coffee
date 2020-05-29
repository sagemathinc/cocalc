#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Upload form handler
###

# This is a limit on the size of each *chunk* that the frontend sends,
# not the total size of the file...
MAX_FILE_SIZE_MB = 10000

fs         = require('fs')
async      = require('async')
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
                fs.mkdir(options.uploadDir, {recursive: true}, cb)
            (cb) ->
                form.parse req, (err, fields, files) ->
                    if err or not files.file? or not files.file.path? or not files.file.name?
                        dbg("upload of '#{files.file.name}' to '#{files.file.path}' FAILED ", err)
                        cb(err)
                        return
                    dbg("upload of '#{files.file.name}' to '#{files.file.path}' worked; #{JSON.stringify(fields)}")
                    dest = process.env.HOME + '/' + (req.query.dest_dir ? '') + '/' + files.file.name
                    if not fields.dzchunkindex?
                        # old client that doesn't use chunking...
                        dbg("now move '#{files.file.path}' to '#{dest}'")
                        fs.rename files.file.path, dest, (err) ->
                            if err
                                dbg("error moving -- #{err}")
                                cb(err)
                            else
                                cb()
                    else
                        dbg("append the next chunk onto the destination file...")
                        handle_chunk_data(parseInt(fields.dzchunkindex), parseInt(fields.dztotalchunkcount), files.file.path, dest, cb)
        ], (err) ->
            if err
                res.status(500).send("upload failed -- #{err}")
            else
                res.send('received upload:\n\n')
        )

    return router


handle_chunk_data = (index, total, chunk, dest, cb) ->
    temp = dest + '.partial-upload'
    async.series([
        (cb) ->
            if index == 0
                # move chunk to the temp file
                fs.rename(chunk, temp, cb)
            else
                # append chunk to the temp file
                fs.readFile chunk, (err, data) ->
                    if err
                        cb(err)
                    else
                        fs.appendFile temp, data, (err) ->
                            if err
                                cb(err)
                            else
                                fs.unlink(chunk, cb)
        (cb) ->
            # if it's the last chunk, move temp to actual file.
            if index == total - 1
                fs.rename(temp, dest, cb)
            else
                cb()
    ], cb)

