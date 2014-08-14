###
#
# This should be a confirmation-before-leave dialog.  So far, this
# code works in Firefox, Chrome, Safari, Opera and IE11
#
# Also, this does not work on iOS.
#
###

{top_navbar} = require('top_navbar')
{unsynced_docs} = require('syncdoc')

window.onbeforeunload = (e) ->
    mesg = undefined
    if not unsynced_docs()
        if require('account').account_settings.settings?.other_settings?.confirm_close
            mesg = "Your data is saved, but you asked for confirmation before leaving SageMathCloud."
        else
            return

    e.cancelBubble = true  # e.cancelBubble is supported by IE - this will kill the bubbling process.
    if not mesg?
        mesg = "Some documents haven't successfully synchronized with the server yet.  Leaving now may result in lost work."
    e.returnValue = mesg
    if e.stopPropagation
        e.stopPropagation()
        e.preventDefault()
    return mesg
