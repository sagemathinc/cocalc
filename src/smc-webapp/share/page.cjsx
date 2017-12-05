###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

{SITE_NAME, BASE_URL} = require('smc-util/theme')

{r_join, Space} = require('../r_misc')

exports.Page = rclass
    displayName: "Page"

    propTypes :
        site_name        : rtypes.string
        base_url         : rtypes.string.isRequired
        path             : rtypes.string.isRequired   # the path with no base url to the currently displayed file, directory, etc.
        viewer           : rtypes.string.isRequired   # 'share' or 'embed'
        project_id       : rtypes.string              # only defined if we are viewing something in a project
        subtitle         : rtypes.string
        google_analytics : rtypes.string              # optional, and if set just the token
        notranslate      : rtypes.bool

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

    render_google_analytics: ->
        return null if not @props.google_analytics
        ga = """
             window.dataLayer = window.dataLayer || [];
             function gtag(){dataLayer.push(arguments);}
             gtag('js', new Date());
             gtag('config', '#{@props.google_analytics}');
             """
        [
            <script key={0} async={true} src={"https://www.googletagmanager.com/gtag/js?id=#{@props.google_analytics}"}></script>
            <script key={1} dangerouslySetInnerHTML={{__html:ga}} />
        ]

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
                {@render_google_analytics()}
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


CoCalcLogo = ({base_url}) ->
    # TODO, obviously
    <img style={height:'21px', width:'21px'} src="#{base_url}/share/cocalc-icon.svg" />

TopBar_propTypes =
    viewer     : rtypes.string
    path       : rtypes.string
    project_id : rtypes.string
    base_url   : rtypes.string
    site_name  : rtypes.string

TopBar = ({viewer, path, project_id, base_url, site_name}) ->
    if viewer == 'embed'
        return <span></span>
    project = undefined
    if path == '/'
        top = '.'
        path_component = <span/>
    else
        v = path.split('/').slice(2)
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
                if path.slice(-1) == '/'
                    t = '..'
                else
                    t = '.'
            else
                t += '/..'
        segments.reverse()
        path_component = r_join(segments, <span style={margin:'0 5px'}> / </span>)

        if project_id
            i = path.slice(1).indexOf('/')
            proj_url = "#{top}/../projects/#{project_id}/files/#{path.slice(2+i)}?session=share"
            project = <a target="_blank" href={proj_url} className='pull-right' rel='nofollow' style={textDecoration:'none'} >
                Open in {site_name}
            </a>

    <div key='top' style={padding: '5px 5px 0px 5px', background:'#dfdfdf'} translate='no'>
        <span style={marginRight:'10px'}>
            <a href={top} style={textDecoration:'none'}><CoCalcLogo base_url={base_url} /> Shared</a>
        </span>
        <span style={paddingLeft: '15px', borderLeft: '1px solid black', marginLeft: '15px'}>
            {path_component}
        </span>
        {project}
    </div>

TopBar.propTypes = TopBar_propTypes