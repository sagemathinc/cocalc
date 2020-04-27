
# AUTHORS:
#   - Christopher Swenson wrote the first version of this at Sage Days 64.25.

# pass in environment variables DROPBOX_API_KEY, DROPBOX_API_SECRET, DROPBOX_USER_TOKEN,
# DROPBOX_LOCAL_DIR, DROPBOX_PATH_PREFIX

cluster = require('cluster')

# ensure that we respawn cleanly if an error occurs
# TODO: consider using forever / start-stop daemon since we have it.
if cluster.isMaster
    cluster.fork()

    cluster.on 'disconnect', (worker) ->
        console.error('restarting!')
        cluster.fork()
    return

async = require('async')
crypto = require('crypto')
dirty = require('dirty') # I really hate this key-value store
Dropbox = require('dropbox')
fs = require('fs')
path = require('path')
readline = require("readline")
mkdirp = require('mkdirp')
gaze = require('gaze')

# random uuid to put in the file cache to store cursor between session
# (this is a hack because we're using a key:value store instead of storing
# this in a file or using sqlite.)
cursorId = '0d32db1a-17f2-4aa8-9060-2a9eb72ec355'


# SECURITY TODO: For security reasons it's necessary to move these secrets to the hub.
# Instead of the project directly communicating with dropbox, all the communication
# would be proxied through the hub.  So we would define messages that correspond
# to each of the API calls below.
apiKey     = process.env.DROPBOX_API_KEY
apiSecret  = process.env.DROPBOX_API_SECRET
userToken  = process.env.DROPBOX_USER_TOKEN
base       = process.env.DROPBOX_LOCAL_DIR
pathPrefix = process.env.DROPBOX_PATH_PREFIX

if base
    if base[0] == '/'
        base = base.substring(1)
if pathPrefix
    if pathPrefix[0] == '/'
        pathPrefix = pathPrefix.substring(1)

hash = (data) ->
    shasum = crypto.createHash('sha1')
    shasum.update(data)
    shasum.digest('hex')

unless fs.existsSync(base)
    fs.mkdirSync(base)

# if .smc-dropbox is messed or deleted, then this daemon will likely crash
# and on next restart will resync from scratch clobbering everything.
unless fs.existsSync(process.env.HOME + '/.smc-dropbox/filecache.db')
    unless fs.existsSync(process.env.HOME + '/.smc-dropbox')
        fs.mkdirSync(process.env.HOME + '/.smc-dropbox')
    fs.writeFileSync(process.env.HOME + '/.smc-dropbox/filecache.db', '')

filecache = dirty(process.env.HOME + '/.smc-dropbox/filecache.db')

params =
    key    : apiKey
    secret : apiSecret
    token  : userToken? && userToken

client = new Dropbox.Client(params)

###
# test code: simple command-line interactive token grabbing thing
unless userToken? && uid?
    simpleDriver =
        authType: -> 'code'
        url: -> ''
        doAuthorize: (authUrl, stateParm, client, callback) ->
            iface = readline.createInterface
                input: process.stdin,
                output: process.stdout
            iface.write('Open the URL below in a browser and paste the ' +
                'provided authentication code.\n' + authUrl + '\n')
            iface.question '> ', (authCode) ->
                iface.close()
                callback
                    code: authCode
    client.authDriver(simpleDriver)
###

# converts dropbox paths to local file paths
localToDropboxPath (path) ->
    return '' unless path
    if path[0] == '/'
        path = path.substring(1)
    if path.indexOf(pathPrefix) == 0
        return path
    if path.indexOf(base) == 0
        return pathPrefix + path.substring(base.length())
    else
        return path

# converts local file paths to dropbox paths
dropboxToLocalPath (path) ->
    return '' unless path
    if path[0] == '/'
        path = path.substring(1)
    if path.indexOf(base) == 0
        return path
    if path.indexOf(pathPrefix) == 0
        return base + path.substring(pathPrefix.length())
    else
        return path


writeFile = (filepath, data, stat, cb) ->
    if stat == null
        stat = {}
    console.log("writing file")
    fs.exists filepath, (exists) ->
        if exists
            console.log("file exists", filepath, "... overwriting")
        fs.writeFile filepath, data, (err) ->
            if err
                throw(err) unless cb?
                cb(err)
            console.log('file written')
            # the filecache wants a sha1sum of the file
            stat.hash = hash(data)
            filecache.set(filepath, stat)
            cb() if cb?

# handle dropbox changes
# TODO: big files are not handled by this, but will require different API calls.
onDropboxChanges = (db, delta, cb) ->
    onDropboxChange = (change, cb) ->
        console.log("Dropbox announced change for", change.path)
        # check cache for tag
        #console.log(change)
        if change.wasRemoved
            console.log("nuking file from dropbox change")
            filepath = dropboxToLocalPath(change.path)
            fs.exists filepath, (exists) ->
                if exists
                    fs.stat filepath, (error, stats) ->
                        throw(error) if error
                        if stats.isFile()
                            console.log("removing file")
                            filecache.rm(filepath)
                            fs.unlink(filepath, cb)
                        else if stats.isDirectory()
                            console.log("removing directory")
                            filecache.rm(filepath)
                            fs.rmdir(filepath, cb)
                        else
                            console.log("Non-file non-directory is ignored")
                            cb()
                else
                    filecache.rm(filepath)
                    cb()
            return

        # created / modified
        console.log("change.stat.path", change.stat.path)
        filepath = dropboxToLocalPath(change.stat.path)
        cache = filecache.get(filepath)
        if cache?.versionTag == change.stat.versionTag
            console.log('ignoring because same version')
            cb()
            return
        if change.stat.isFolder
            console.log('adding folder')
            mkdirp(filepath, cb)
            return

        db.readFile change.path, { buffer: true, rev: change.stat.versionTag }, (error, data, stat, rangeInfo) ->
            if error
                console.log(error)
                process.exit(1)
            if rangeInfo
                console.log("RangeInfo not supported")
                process.exit(1)
            console.log("Read", filepath, data)

            fs.exists path.dirname(filepath), (exists) ->
                console.log(path.dirname(filepath), "exists")
                if exists
                    writeFile(filepath, data, stat, cb)
                else
                    mkdirp path.dirname(filepath), (error) ->
                        console.log("mkdir error", error)
                        writeFile(filepath, data, stat, cb)
    # TODO: when the Dropbox.Client supports it, pass this in the /delta endpoint.
    changes = delta.changes.filter (change) ->
        i = change.path.indexOf(pathPrefix)
        (i == 0) || (i == 1)

    async.each changes, onDropboxChange, (error) ->
        if error
            if cb?
                cb(error)
            else
                throw(error)
        console.log("Writing cursor", delta.cursor())
        filecache.set(cursorId, delta.cursor())
        cb() if cb?


# executed when a local file has changed
onLocalFileChange = (db, event, filename) ->
    console.log("Event", event, "on", filename)
    filepath = base + '/' + filename
    # todo: handle permission
    if event == 'deleted'
        if filecache.get(filepath)?
            console.log("nuking", filepath, "from dropbox")
            db.delete localToDropboxPath(filename), (error) ->
                throw(error) if error?
                filecache.rm(filepath)
        else
            console.log("file already deleted")
    else if event == 'changed' || event == 'added'
        fs.stat filepath, (error, stats) ->
            throw(error) if error
            cache = filecache.get(filepath)
            if stats.isDirectory()
                unless cache?.isFolder
                    db.mkdir localToDropboxPath(filename), (error) ->
                        throw(error) if error
            else
                fs.readFile localToDropboxPath(filepath), (error, data) ->
                    if error
                        console.log("Error", error)
                        process.exit(1)
                    cache = filecache.get(base + '/' + filename)
                    datahash = hash(data)
                    if cache?.hash != datahash
                        console.log("Stale cache. Triggering Dropbox update", cache?.hash, datahash)
                        db.writeFile filename, data, (error, stat) ->
                            throw(error) if error
                            console.log("file written to dropbox")
                            stat.hash = datahash
                            filecache.set(filepath, stat)
                    else
                        console.log("File up-to-date!")

# wait for the filecache to load, then authenticate and start polling for changes
filecache.on 'load', ->
    client.authenticate (error, client) ->
        # grab deltas from Dropbox API, and process them with onDropboxChanges
        grabChanges = (cursor, cb) ->
            client.pullChanges cursor, (error, delta) ->
                if error
                    console.log(error)
                    process.exit(1)
                onDropboxChanges(client, delta, cb)
        if error
            console.log(error)
            process.exit(1)
        poll = ->
            callback = (wait) ->
                (error) ->
                    if error
                        console.log("Error:", error)
                    console.log("will poll in", wait, "ms")
                    setTimeout(poll, wait)

            cursor = filecache.get(cursorId)
            cursor = null unless cursor?
            if cursor?
                # take up to 60 seconds for dropbox to tell us something changed, or loop
                client.pollForChanges cursor, (error, result) ->
                    console.log('poll for changes returned')
                    throw(error) if error
                    console.log(result)
                    wait = result.retryAfter * 1000
                    if result.hasChanges
                        grabChanges(cursor, callback(wait))
                    else
                        callback(wait)()
            else
                # first sync, just call pullChanges
                grabChanges(null, callback(0))

        cwd = process.cwd()
        # BUG: gaze won't detect local directory deletions. It throws an exception instead sometimes.
        console.log("gaze starting")
        # gaze is an improved version of fs.watch
        gaze base + '/**/*', (error, watcher) ->
            throw error if error
            watcher.on 'all', (event, filepath) ->
                filepath = filepath.substring(cwd.length + 1 + base.length + 1)
                onLocalFileChange(client, event, filepath)

        console.log("polling")
        poll()
