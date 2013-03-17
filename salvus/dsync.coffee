###################################################################
#
# Class to support simultaneous multiple editing
# sessions by different clients of a single object.  This uses
# the Differential Synchronization algorithm of Neil Fraser,
# which is the same thing that Google Docs uses.
#
#   * "Differential Synchronization" (by Neil Fraser).
#   * http://neil.fraser.name/writing/sync/
#   * http://www.youtube.com/watch?v=S2Hp_1jqpY8
#   * http://code.google.com/p/google-diff-match-patch/
#
###################################################################


# coffee  -o node_modules -c dsync.coffee && echo "require('dsync').test1()" | coffee

misc = require('misc')
{defaults, required} = misc

diff_match_patch = require('googlediff')  # TODO: this greatly increases the size of browserify output (unless we compress it)

dmp = new diff_match_patch()

class DSync
    constructor: (opts) ->
        opts = defaults opts,
            id   : undefined
            text : required
        if not opts.id?
            @id = misc.uuid()
        else
            @id = opts.id
        @text = opts.text
        @shadow = @text

    status: () =>
        return {'id':@id, 'text':@text, 'shadow':@shadow}

    connect: (server) =>
        @server = server

    diff: (cb) =>
        #console.log("about to make patches: shadow='#{@shadow}', text='#{@text}'")
        edits = dmp.patch_make(@shadow, @text)
        #console.log("edits = ", edits, edits.length?)
        if edits.length == 0
            console.log("diff: nothing to send")
            cb?()
            return
        @shadow = @text
        #console.log("Sending edits")
        @server.patch(edits, cb)

    patch: (edits, cb) =>
        #console.log("patch using edits=", edits)
        r = dmp.patch_apply(edits, @shadow)
        @shadow = r[0]
        r = dmp.patch_apply(edits, @text)
        @text = r[0]
        cb?()


exports.test1 = () ->
    client = new DSync(text:"cat", id:"client")
    server = new DSync(text:"cat", id:"server")
    client.connect(server)
    server.connect(client)

    client.text = "cats"
    server.text = "my\ncat"
    status = () ->
        console.log(misc.to_json(client.status()))
        console.log(misc.to_json(server.status()))

    status()
    client.diff()
    status()
    #server.diff()
    #status()

exports.DSync = DSync