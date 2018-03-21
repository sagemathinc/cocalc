###
Convert a *markdown* file to printable form.
###

{required, defaults, path_split} = require('smc-util/misc')

{Markdown}           = require('../r_misc')
ReactDOMServer       = require('react-dom/server')
{React, Redux, redux} = require('../smc-react')

{open_new_tab}       = require('smc-webapp/misc_page')

exports.print_markdown = (opts) ->
    opts = defaults opts,
        value      : required
        path       : required
        project_id : required
        font_size  : '10pt'

    w = window.open('', '_blank',
                    'menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800')
    if not w?.closed? or w.closed
        return "Popup blocked.  Please unblock popups for this site."

    split = path_split(opts.path)
    props =
        value      : opts.value
        project_id : opts.project_id
        file_path  : split.head

    C = React.createElement(Redux, {redux:redux}, React.createElement(Markdown, props))

    s = ReactDOMServer.renderToStaticMarkup(C)

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
        #{s}
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
