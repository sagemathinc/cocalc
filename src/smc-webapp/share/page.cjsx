###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../app-framework')

{SITE_NAME, BASE_URL, DNS} = require('smc-util/theme')

{r_join, Space} = require('../r_misc')

misc = require('smc-util/misc')

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
        is_public        : rtypes.func.isRequired

    getDefaultProps: ->
        base_url  : BASE_URL
        site_name : SITE_NAME

    title: ->
        title = "Shared"
        if @props.subtitle
            title += " - #{@props.subtitle}"
        <title>{title}</title>

    cocalc_link: ->
        if @props.viewer == 'embed'
            <div style={right:0, position:'absolute', fontSize: '8pt', border: '1px solid #aaa', padding: '2px'}>
                <a href={"https://cocalc.com"} target={"_blank"} rel={"noopener"}>Powered by CoCalc</a>
            </div>
        else
            <div style={position:'absolute', left:'50%', transform: 'translate(-50%)', fontSize:'12pt', maxHeight: '68px', overflowY: 'hidden', background: 'white', padding: '0 5px',border: '1px solid #aaa'}>
                <a href={"https://cocalc.com/doc/features.html"} target={"_blank"} rel={"noopener"}>
                CoCalc -- Linux, Python, Courses, Jupyter notebooks, LaTeX and much more in your browser!
                Privately collaborate. Changes synchronized in realtime.
                </a>
            </div>

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

    render_cocalc_analytics: ->
        <script async={true} src={"https://#{DNS}/analytics.js"}></script>

    render: ->
        <html lang="en">
            <head>
                {@title()}
                {@cocalc_link()}
                {@notranslate()}
                {### bootstrap CDN ###}
                <link
                    rel         = "stylesheet"
                    href        = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
                    integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
                    crossOrigin = "anonymous" />

                {### codemirror CDN -- https://cdnjs.com/libraries/codemirror ###}
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.40.2/codemirror.min.css"
                    integrity="sha256-I8NyGs4wjbMuBSUE40o55W6k6P7tu/7G28/JGUUYCIs="
                    crossorigin="anonymous" />

                {### Katex CDN ###}
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.10.2/katex.min.css"
                    integrity="sha256-uT5rNa8r/qorzlARiO7fTBE7EWQiX/umLlXsq7zyQP8="
                    crossorigin="anonymous" />

                {@render_favicon()}
                {@render_css()}
                {@render_noindex()}
                {@render_google_analytics()}
                {@render_cocalc_analytics()}
            </head>
            <body>
                <TopBar
                    viewer       = {@props.viewer}
                    path         = {@props.path}
                    project_id   = {@props.project_id}
                    base_url     = {@props.base_url}
                    site_name    = {@props.site_name}
                    is_public    = {@props.is_public}
                />
                {@props.children}
            </body>
        </html>


CoCalcLogo = ({base_url}) ->
    # TODO, obviously
    <img style={height:'21px', width:'21px'} src="#{base_url}/share/cocalc-icon.svg" />

TopBar_propTypes =
    viewer       : rtypes.string
    path         : rtypes.string # The share url. Must have a leading `/`. {base_url}/share{path}
    project_id   : rtypes.string
    base_url     : rtypes.string
    site_name    : rtypes.string
    is_public    : rtypes.func

TopBar = ({viewer, path, project_id, base_url, site_name, is_public}) ->

    if viewer == 'embed'
        return <span></span>
    project_link = undefined
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
        for val, i in v
            segment_path = v.slice(i).reverse().join('/')
            if t and (not project_id or is_public(project_id, segment_path))
                href = "#{t}?viewer=share"
                segments.push(<a key={t} href={href}>{val}</a>)
            else
                segments.push(<span key={t}>{val}</span>)
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
            project_link = <a target="_blank" href={proj_url} className='pull-right' rel='nofollow' style={textDecoration:'none'} >
                Open in {site_name}
            </a>

    <div key='top' style={padding: '5px 5px 0px 5px', height:'50px', background:'#dfdfdf'} translate='no'>
        <span style={marginRight:'10px'}>
            <a href={top} style={textDecoration:'none'}><CoCalcLogo base_url={base_url} /> Shared</a>
        </span>
        <span style={paddingLeft: '15px', borderLeft: '1px solid black', marginLeft: '15px'}>
            {path_component}
        </span>
        {project_link}
    </div>

TopBar.propTypes = TopBar_propTypes