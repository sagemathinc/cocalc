###
Process internal links in HTML documents that we render
###

misc = require('smc-util/misc')

# Define the jquery plugin:
$.fn.process_internal_links = (opts={}) ->
    @each ->
        e = $(this)
        a = e.find('a')
        for x in a
            y = $(x)
            href = y.attr('href')
            if href?
                if href[0] == '#'
                    # CASE: internal link on same document - do not touch (e.g., sections in jupyter/sagews)
                    continue
                href_lower = href.toLowerCase()
                if misc.startswith(href_lower, 'mailto:')
                    continue
                if misc.startswith(href_lower, 'http://') or misc.startswith(href_lower, 'https://')
                    # for now at least, just leave all such links alone, except make them
                    # open in a new tab (rather than replacing this)
                    y.attr("target","_blank")
                    continue
                if opts.href_transform?
                    # an internal link
                    # special option; used, e.g., for Jupyter's attachment: url';  also used by share server
                    href = opts.href_transform(href)
                    y.attr('href', href)
        return e

exports.process_internal_links = (html, viewer) ->
    #console.log "before '#{html}'"
    elt = $("<div>")
    elt.html(html)
    elt.process_internal_links
        href_transform : (href) ->    # here we maintain the viewer option.
            href += "?viewer=#{viewer}"
            return href
    html = elt.html()
    #console.log "after '#{html}'"
    return html
