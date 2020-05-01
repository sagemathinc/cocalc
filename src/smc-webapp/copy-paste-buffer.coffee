#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
An internal copy/paste buffer

MOTIVATION: There is no way to sync with the official operating system copy/paste buffer,
due to security restrictions.  However, for some platforms (iPad, I'm looking at you!),
it's still very useful to have our own internal copy/paste buffer.  This is it.
It stores a string right now.  Who knows, maybe someboday it'll do interesting
richer content too.
###

buffer = ''

# TODO: get_buffer could be done via a permission request, though that is a potential security issue.
# See https://alligator.io/js/async-clipboard-api/
exports.get_buffer = ->
    return buffer

exports.set_buffer = (s) ->
    buffer = s ? ''
    if navigator.clipboard?
        navigator.clipboard.writeText(buffer);  # this is async -- requires at least chrome 66.
        return
    try
        # https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
        # NOTE: there is probably no context in CoCalc where this will actually work...
        document.execCommand('copy')

    return
