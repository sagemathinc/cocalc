###
#
# This should be a confirmation-before-leave dialog.  So far, this
# code works in Firefox, Chrome, Safari and maybe IE, but does not seem to
# work in Opera.  So Opera users could loose work...
#
# Also, this does not work on iOS.
#
###

{top_navbar} = require('top_navbar')

window.onbeforeunload = (e) ->
    #
    # TODO: we could instead just save everything at this point and return null
    #
    e.cancelBubble = true  # e.cancelBubble is supported by IE - this will kill the bubbling process.
    mesg = ''#Leave the SageMath cloud?'
    e.returnValue = mesg
    if e.stopPropagation
        e.stopPropagation()
        e.preventDefault()
    return mesg
