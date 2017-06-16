###
Efficient backend processing of iframe srcdoc's.

MOTIVATION: Sage jmol.
###

misc = require('smc-util/misc')

exports.is_likely_iframe = (content) ->
    if not content
        return
    content = content.slice(0,50).trim().toLowerCase()
    return misc.startswith(content, '<iframe srcdoc="')

exports.process = (content, blob_store) ->
    content_lower = content.toLowerCase()
    i = content_lower.indexOf('<html>')
    j = content_lower.lastIndexOf('</html>')
    src = unescape(content.slice(i, j+'</html>'.length))
    return blob_store.save(src, 'text/html', content)

entity_map =
    '&': '&amp;'
    '<': '&lt;'
    '>': '&gt;'
    '"': '&quot;'
    "'": '&#39;'
    '/': '&#x2F;'
    '`': '&#x60;'
    '=': '&#x3D;'

unescape = (s) ->
    for k, v of entity_map
        s = misc.replace_all(s, v, k)
    return s
