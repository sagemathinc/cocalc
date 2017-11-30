###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

{SITE_NAME, BASE_URL} = require('smc-util/theme')

{TopBar} = require('./top-bar')

exports.Page = rclass
    displayName: "Page"

    propTypes :
        site_name  : rtypes.string
        base_url   : rtypes.string.isRequired
        path       : rtypes.string.isRequired   # the path with no base url to the currently displayed file, directory, etc.
        viewer     : rtypes.string.isRequired   # 'share' or 'embed'
        project_id : rtypes.string              # only defined if we are viewing something in a project
        subtitle   : rtypes.string
        notranslate: rtypes.bool

    getDefaultProps: ->
        base_url  : BASE_URL
        site_name : SITE_NAME

    title: ->
        title = "Shared"
        if @props.subtitle
            title += " - #{@props.subtitle}"
        <title>{title}</title>

    notranslate: ->
        # don't translate the index pages
        return null if not @props.notranslate
        <meta name="google" content="notranslate" />

    render_noindex: ->
        if @props.viewer == 'share'  # we want share to be indexed
            return

    render_css: ->
        css     = "#{@props.base_url}/share/share.css"
        <link rel="stylesheet" href={css} />

    render_favicon: ->
        favicon = "#{@props.base_url}/share/favicon-32x32.png"
        <link rel="shortcut icon" href={favicon} type="image/png" />

    render: ->
        <html lang="en">
            <head>
                {@title()}
                {@notranslate()}
                {# bootstrap CDN #}
                <link
                    rel         = "stylesheet"
                    href        = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
                    integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
                    crossOrigin = "anonymous" />

                {# codemirror CDN -- https://cdnjs.com/libraries/codemirror #}
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.31.0/codemirror.min.css" />

                {@render_favicon()}

                {@render_css()}

                {@render_noindex()}
            </head>
            <body>
                <div style={display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'auto'}>
                    <TopBar
                        viewer     = @props.viewer
                        path       = @props.path
                        project_id = @props.project_id
                        base_url   = @props.base_url
                        site_name  = @props.site_name
                    />
                    <div key='index' style={display: 'flex', flexDirection: 'column', flex:1}>
                        {@props.children}
                    </div>
                </div>
            </body>
        </html>