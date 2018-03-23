###
Jupyter in-memory blob store, which hooks into the raw http server.
###

fs = require('fs')

winston = require('winston')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')
Database  = require('better-sqlite3')

DB_FILE   = "#{process.env.SMC_LOCAL_HUB_HOME ? process.env.HOME}/.jupyter-blobs-v0.db"

# TODO: are these the only base64 encoded types that jupyter kernels return?
BASE64_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'base64']

class BlobStore
    constructor: ->
        winston.debug("jupyter BlobStore: constructor")
        try
            @_init()
            winston.debug("jupyter BlobStore: #{DB_FILE} opened fine")
        catch err
            winston.debug("jupyter BlobStore: #{DB_FILE} open error - #{err}")
            # File may be corrupt/broken/etc. -- in this case, remove and try again.
            # This database is only an image *cache*, so this is fine.
            # See https://github.com/sagemathinc/cocalc/issues/2766
            # Using sync is also fine, since this only happens once
            # during initialization.
            winston.debug("jupyter BlobStore: resetting database cache")
            try
                fs.unlinkSync(DB_FILE)
            catch err
                winston.debug("Error trying to delete #{DB_FILE}... ignoring: ", err)
            @_init()

    _init: =>
        @_db = new Database(DB_FILE)
        @_db.prepare('CREATE TABLE IF NOT EXISTS blobs (sha1 TEXT, data BLOB, type TEXT, ipynb TEXT, time INTEGER)').run()
        @_clean()  # do this once on start

    _clean: =>
        # Delete anything old...
        # The main point of this blob store being in the db is to ensure that when the
        # project restarts, then user saves an ipynb,
        # that they do not loose any work.  So a few weeks should be way more than enough.
        # Note that TimeTravel may rely on these old blobs, so images in TimeTravel may
        # stop working after this long.  That's a tradeoff.
        @_db.prepare("DELETE FROM blobs WHERE time <= ?").run(misc.months_ago(1) - 0)

    # data could, e.g., be a uuencoded image
    # We return the sha1 hash of it, and store it, along with a reference count.
    # ipynb = (optional) text that is also stored and will be
    #         returned when get_ipynb is called
    #         This is used for some iframe support code.
    save: (data, type, ipynb) =>
        if type in BASE64_TYPES
            data = new Buffer.from(data, 'base64')
        else
            data = new Buffer.from(data)
        sha1 = misc_node.sha1(data)
        row = @_db.prepare('SELECT * FROM blobs where sha1=?').get(sha1)
        if not row?
            @_db.prepare('INSERT INTO blobs VALUES(?, ?, ?, ?, ?)').run([sha1, data, type, ipynb, new Date() - 0])
        else
            @_db.prepare('UPDATE blobs SET time=? WHERE sha1=?').run([new Date() - 0, sha1])
        return sha1

    readFile: (path, type, cb) =>
        fs.readFile path, (err, data) =>
            if err
                cb(err)
            else
                cb(undefined, @save(data, type))

    free: (sha1) =>
        # no op -- stuff gets freed 2 weeks after last save.

    get: (sha1) =>
        return @_db.prepare('SELECT data FROM blobs where sha1=?').get(sha1)?.data

    get_ipynb: (sha1) =>
        row = @_db.prepare('SELECT ipynb, type, data FROM blobs where sha1=?').get(sha1)
        if not row?
            return
        if row.ipynb?
            return row.ipynb
        if row.type in BASE64_TYPES
            return row.data.toString('base64')
        else
            return row.data.toString()

    keys: (cb) =>
        return (x.sha1 for x in @_db.prepare('SELECT sha1 FROM blobs').all())

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

