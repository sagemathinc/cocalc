###
Jupyter in-memory blob store, which hooks into the raw http server.
###

fs = require('fs')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

# TODO: are these the only base64 encoded types that jupyter kernels return?
BASE64_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'base64']

class BlobStore
    constructor: ->
        @_blobs = {}

    # data could, e.g., be a uuencoded image
    # We return the sha1 hash of it, and store it, along with a reference count.
    # ipynb = optional some original data that is also stored and will be
    #         returned when get_ipynb is called
    save: (data, type, ipynb) =>
        if type in BASE64_TYPES
            data = new Buffer.from(data, 'base64')
        else
            data = new Buffer.from(data)
        sha1 = misc_node.sha1(data)
        x = @_blobs[sha1] ?= {ref:0, data:data, type:type}
        x.ref += 1
        x.ipynb = ipynb
        if x.ref == 1
            @_save_to_db(data, sha1)
        return sha1

    readFile: (path, type, cb) =>
        fs.readFile path, (err, data) =>
            if err
                cb(err)
            else
                sha1 = misc_node.sha1(data)
                ext = misc.filename_extension(path)?.toLowerCase()
                x = @_blobs[sha1] ?= {ref:0, data:data, type:type}
                x.ref += 1
                if x.ref == 1
                    @_save_to_db(data, sha1)
                cb(undefined, sha1)

    free: (sha1) =>
        x = @_blobs[sha1]
        if x?
            x.ref -= 1
            if x.ref <= 0
                delete @_blobs[sha1]
        return

    get: (sha1) =>
        return @_blobs[sha1]?.data

    get_ipynb: (sha1) =>
        x = @_blobs[sha1]
        if not x?
            return
        if x.ipynb?
            return x.ipynb
        if x.type in BASE64_TYPES
            return x.data.toString('base64')
        else
            return x.data.toString()

    keys: =>
        return misc.keys(@_blobs)

    express_router: (base, express) =>
        router = express.Router()
        base += 'blobs/'

        router.get base, (req, res) =>
            sha1s = misc.to_json(@keys())
            res.send(sha1s)
        router.get base + '*', (req, res) =>
            filename = req.path.slice(base.length)
            sha1 = req.query.sha1
            res.type(filename)
            res.send(@get(sha1))
        return router

    # Save the given data to the central blob store (not in project)
    _save_to_db: (data, sha1) =>

    # Try to load data with given sha1 hash from the central blob store (not in project).
    # Data gets loaded into @_blobs, so can be got using the @get and @get_ipynb commands.
    # Does nothing if already loaded locally
    _get_from_db: (sha1, cb) =>
        if @_blobs[sha1]?
            cb?()
            return
        # TODO
        cb?()

exports.blob_store = new BlobStore()

