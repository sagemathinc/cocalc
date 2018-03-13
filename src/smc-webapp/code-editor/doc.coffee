###
Codemirror Document store.
###

{cm_options}         = require('./cm-options')
misc                 = require('smc-util/misc')
{defaults, required} = misc

account_store = undefined

cache = {}

exports.get = (opts) ->
    opts = defaults opts,
        path : required
        cm   : required

    doc = cache[opts.path]
    if doc?
        return doc.linkedDoc()
    doc = cache[opts.path] = opts.cm.getDoc()
    return

