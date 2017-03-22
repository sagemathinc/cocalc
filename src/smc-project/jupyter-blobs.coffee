

misc_node = require('../smc-util-node/misc_node')


class BlobStore
    constructor: ->
        @_blobs = {}

    # data is a uuencoded image
    # we return the sha1 hash of it, and store it, along with a reference count.
    save: (data) =>
        buf = new Buffer.from(data, 'base64')
        sha1 = misc_node.sha1(buf)
        x = @_blobs[sha1] ?= {ref:0, buf:buf}
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
        return @_blobs[sha1]?.buf

    express_router: (express) =>
        router = express.Router()
        router.get '/foo.txt', (req, res) ->
            res.send('this is a foo')
        router.get '/.smc/jupyter/', (req, res) ->
            res.send('this is a foo')
        router.get '/.smc/jupyter/*', (req, res) ->
            res.send('this is a foo')
        return router

exports.blob_store = new BlobStore()