###
Convert a file on the backend to PDF..
###

immutable            = require('immutable')

misc                 = require('smc-util/misc')
{required, defaults} = misc

{CodeMirrorStatic}   = require('../jupyter/codemirror-static')
ReactDOMServer       = require('react-dom/server')
{React}              = require('../smc-react')
{open_new_tab}       = require('smc-webapp/misc_page')

exports.print = (opts) ->
    opts = defaults opts,
        value      : required
        options    : required
        path       : required

    w = window.open('', misc.uuid(),
                    'menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800')
    if not w?.closed? or w.closed
        return "Popup blocked.  Please unblock popups for this site."

    options = immutable.fromJS(opts.options)
    options = options.delete('lineNumbers')   # doesn't work yet

    # We add a trailing whitespace, since some printers grey the last line (e.g., chrome, but not firefox)
    value = opts.value + '\n'
    C = React.createElement(CodeMirrorStatic, {value:value, options:options})
    s = ReactDOMServer.renderToStaticMarkup(C)

    # Hardcoded CDN version below: see https://cdnjs.com/libraries/codemirror
    t = """
<html lang="en">
    <head>
        <title>#{misc.path_split(opts.path).tail}</title>
        <meta name="google" content="notranslate"/>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.35.0/codemirror.min.css">
    </head>
    <body>
        #{s}
    </body>
</html>
"""
    w.document.write(t)
    w.document.close()
    if w.window.print?
        f = ->
            w.window.print()
            w.window.close()
        # Wait until the render is done, then display print dialog.
        w.window.setTimeout(f, 0)
    return