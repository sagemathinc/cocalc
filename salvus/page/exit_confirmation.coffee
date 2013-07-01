###
#
# This should be a confirmation-before-leave dialog.  So far, this
# code works in Firefox, Chrome, Safari and maybe IE, but does not seem to
# work in Opera.  So Opera users could loose work...
#
# Also, this does not work on i OS.
#
###

{top_navbar} = require('top_navbar')
{unsynced_docs} = require('syncdoc')

window.onbeforeunload = (e) ->
    if not unsynced_docs()
        return

    # TODO: we could instead just save everything at this point and return null
    #
    e.cancelBubble = true  # e.cancelBubble is supported by IE - this will kill the bubbling process.
    mesg = "Some documents haven't successfully synchronized with the server yet.  Leaving now may result in lost work."
    e.returnValue = mesg
    if e.stopPropagation
        e.stopPropagation()
        e.preventDefault()
    return mesg
