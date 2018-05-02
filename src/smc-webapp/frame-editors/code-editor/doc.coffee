###
Manage codemirror documents.  For each path, there's one of these.
###

{cm_options}         = require('./cm-options')
misc                 = require('smc-util/misc')
{defaults, required} = misc

account_store = undefined

cache = {}

key = (opts) ->
    return "#{opts.project_id}-#{opts.path}"

exports.get_linked_doc = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        cm         : required
    k = key(opts)
    doc = cache[k]
    if doc?
        return doc.linkedDoc()
    doc = cache[k] = opts.cm.getDoc()
    return

exports.get_doc = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
    return cache[key(opts)]

# Forget about given doc
exports.close = (opts) ->
    opts = defaults opts,
        project_id : required
        path : required
    delete cache[key(opts)]