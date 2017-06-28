###
An internal copy/paste buffer

MOTIVATION: There is no way to sync with the official operating system copy/paste buffer,
due to security restrictions.  However, for some platforms (iPad, I'm looking at you!),
it's still very useful to have our own internal copy/paste buffer.  This is it.
It stores a string right now.  Who knows, maybe someboday it'll do interesting
richer content too.
###

buffer = ''

exports.get_buffer = ->
    return buffer

exports.set_buffer = (s) ->
    buffer = s ? ''
    try
        # https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
        document.execCommand('copy')
    return
