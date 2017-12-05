{React} = require('../smc-react')
{r_join, Space} = require('../r_misc')

CoCalcLogo = ({base_url}) ->
    # TODO, obviously
    <img style={height:'21px', width:'21px'} src="#{base_url}/share/cocalc-icon.svg" />


exports.TopBar = ({viewer, path, project_id, base_url, site_name}) ->
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
                {site_name}
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
