###
Jupyter in-memory blob store, which hooks into the raw http server.
###

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

# TODO: are these the only base64 encoded types that jupyter kernels return?
BASE64_TYPES = ['image/png', 'image/jpeg']

class BlobStore
    constructor: ->
        @_blobs = {}

    # data is a uuencoded image
    # we return the sha1 hash of it, and store it, along with a reference count.
    save: (data, type) =>
        if type in BASE64_TYPES
            data = new Buffer.from(data, 'base64')
        else
            data = new Buffer.from(data)
        sha1 = misc_node.sha1(data)
        x = @_blobs[sha1] ?= {ref:0, data:data, type:type}
        x.ref += 1
        return sha1

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
        if x.type in ['image/png', 'image/jpeg']
            return x.data.toString('base64')
        else
            return x.data

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


exports.blob_store = new BlobStore()

