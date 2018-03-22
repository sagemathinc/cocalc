###
Convert an *HTML* file to printable form.

TODO: refactor with markdown print (?).
###

{required, defaults, path_split} = require('smc-util/misc')

{HTML}               = require('../r_misc')
ReactDOMServer       = require('react-dom/server')
{React, Redux, redux} = require('../smc-react')

{open_new_tab}       = require('smc-webapp/misc_page')

BLOCKED = undefined

exports.print_html = (opts) ->
    opts = defaults opts,
        value      : undefined   # one of value or html must be given; html is best!
        html       : undefined
        path       : required
        project_id : required
        font_size  : '10pt'

    w = window.open('', '_blank',
                    'menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800')

    if not w?.closed? or w.closed
        if BLOCKED or not BLOCKED?    # no history or definitely blocks
            BLOCKED = true
            return "Popup blocked.  Please unblock popups for this site."
        else
            # definitely doesn't block -- this happens when window already opened and printing.
            return "If you have a window already opened printing a document, close it first."
    BLOCKED = false

    split = path_split(opts.path)

    if not opts.html?
        props =
            value      : opts.value
            project_id : opts.project_id
            file_path  : split.head

        C = React.createElement(Redux, {redux:redux}, React.createElement(HTML, props))
        html = ReactDOMServer.renderToStaticMarkup(C)
    else
        html = opts.html

    t = """
<html lang="en">
    <head>
        <title>#{split.tail}</title>
        <meta name="google" content="notranslate"/>
        <link
            rel         = "stylesheet"
            href        = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
            integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
            crossOrigin = "anonymous" />

        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.35.0/codemirror.min.css" />

        <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.9.0/katex.min.css"
            integrity="sha384-TEMocfGvRuD1rIAacqrknm5BQZ7W7uWitoih+jMNFXQIbNl16bO8OZmylH/Vi/Ei"
            crossorigin="anonymous" />

    </head>
    <body style='font-size:#{opts.font_size}; margin:7%'>
        #{html}
    </body>
</html>
"""
    w.document.write(t)
    w.document.close()
    if w.window.print?
        f = ->
            w.window.print()
        # Wait until the render is (probably) done, then display print dialog.
        w.window.setTimeout(f, 100)
    return
