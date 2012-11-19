###
#
# This should be a confirmation-before-leave dialog.  So far, this
# code works in Firefox, Chrome, Safari and maybe IE, but does not seem to
# work in Opera.  So Opera users could loose work...
#
# Also, this does not work on iOS.
# 
###

window.onbeforeunload = (e=window.event) ->
    if top_navbar.have_unsaved_changes()
        #
        # TODO: we could instead just save everything at this point and return null
        # 
        e.cancelBubble = true  # e.cancelBubble is supported by IE - this will kill the bubbling process.
        e.returnValue = 'Are you sure you want to leave this page?'
        if e.stopPropagation
            e.stopPropagation()
            e.preventDefault()
        return "You have unsaved changes."
