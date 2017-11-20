###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

{r_join, Space} = require('../r_misc')

{SITE_NAME, BASE_URL} = require('smc-util/theme')

CoCalcLogo = rclass

    propTypes :
        base_url : rtypes.string.isRequired

    render: ->
        # TODO, obviously
        <img style={height:'36px', width:'36px'} src="#{@props.base_url}/share/cocalc-icon.svg" />


exports.Page = rclass
    displayName: "Page"

    propTypes :
        path       : rtypes.string.isRequired   # the path with no base url to the currently displayed file, directory, etc.
        project_id : rtypes.string              # only defined if we are viewing something in a project
        subtitle   : rtypes.string
        notranslate: rtypes.bool
        base_url   : rtypes.string.isRequired
        viewer     : rtypes.string.isRequired   # 'share' or 'embed'

    render_topbar: ->
        if @props.viewer == 'embed'
            return
        project = undefined
        if @props.path == '/'
            top = '.'
            path = <span/>
        else
            v = @props.path.split('/').slice(2)
            top = ('..' for x in v).join('/')
            if v.length > 0 and v[v.length-1] == ''
                v = v.slice(0, v.length-1)
            segments = []
            t = ''
            v.reverse()
            for s in v
                href = "#{t}?viewer=share"
                if t
                    segments.push(<a key={t} href={href}>{s}</a>)
                else
                    segments.push(<span key={t}>{s}</span>)
                if not t
                    if @props.path.slice(-1) == '/'
                        t = '..'
                    else
                        t = '.'
                else
                    t += '/..'
            segments.reverse()
            path = r_join(segments, <span style={margin:'0 5px'}> / </span>)

            if @props.project_id
                i = @props.path.slice(1).indexOf('/')
                proj_url = "#{top}/../projects/#{@props.project_id}/files/#{@props.path.slice(2+i)}?session=share"
                project = <a target="_blank" href={proj_url} className='pull-right' rel='nofollow'>
                    {SITE_NAME}
                </a>

        <div key='top' style={fontSize:'12pt', padding: '5px', background:'#dfdfdf'} translate='no'>
            <span style={marginRight:'10px'}>
                <a href={top}><CoCalcLogo base_url={@props.base_url} /> Shared</a>
            </span>
            <span style={paddingLeft: '15px', borderLeft: '1px solid black', marginLeft: '15px'}>
                {path}
            </span>
            {project}
        </div>

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

    render: ->
        favicon = "#{@props.base_url}/share/favicon-32x32.png"
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

                <link rel="shortcut icon" href={favicon} type="image/png" />

                {@render_noindex()}
            </head>
            <body>
                <div style={display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden'}>
                    {@render_topbar()}
                    <div key='index' style={display: 'flex', flexDirection: 'column', flex:1}>
                        {@props.children}
                    </div>
                </div>
            </body>
        </html>