###
Various logic depends on filename extensions, so it is good to centralize that to avoid
duplicating code.  What's below may be pretty dumb though (and we should use some
mimetype library)...

###

{file_associations} = require('../file-associations')

set = (v) ->
    x = {}
    for a in v
        x[a] = true
    return x

# see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
exports.image = set(['png', 'jpg', 'gif', 'svg', 'jpeg', 'bmp', 'apng', 'ico'])

# https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video
{VIDEO_EXTS, AUDIO_EXTS} = require('smc-webapp/file-associations')
exports.video = set(VIDEO_EXTS)
exports.audio = set(AUDIO_EXTS)

exports.pdf = set(['pdf'])

exports.html = set(['html', 'htm'])

cm = {}
for ext, info of file_associations
    # TODO: more?
    if info.editor == 'codemirror' or info.editor == 'latex'
        cm[ext] = {mode:{name:info.opts.mode}}

exports.codemirror = cm
