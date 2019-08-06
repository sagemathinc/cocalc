
{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields} = require('./app-framework')

{Navbar, Nav, NavItem} = require('react-bootstrap')
{ErrorBoundary, Loading, Tip}   = require('./r_misc')
{COLORS, SITE_NAME} = require('smc-util/theme')
{AppLogo} = require('./app_shared')


page_style =
  height: "100vh"
  width: "100vw"
  overflow: "auto"
  display: "flex"
  flexDirection: "column"
  background: "white"

loading_style =
    textAlign: 'center'
    margin: '100px auto auto auto'

SinglePage = rclass
    displayName : "SinglePage"

    reduxProps :
        single_page:
            filename: rtypes.string
            error: rtypes.string
            mode: rtypes.string
            project_id: rtypes.string

    render_mode_ipynb: ->
        <div>ipynb mode: {@props.filename}</div>

    render_loading: ->
        if @props.mode
            return @["render_mode_#{@props.mode}"]()

        <div style={loading_style}>
            <AppLogo size={'200px'} margin={'20px'}/>
            <br/>
            {<strong>{SITE_NAME} opening <code>{@props.filename}</code></strong> if @props.filename and not @props.error}
            {"ERROR: #{@props.error}" if @props.error}
            <br/>
            {<Loading /> if not @props.filename and not @props.error}
        </div>

    render: ->
        <div ref="page" style={page_style}>
            {@render_loading()}
        </div>


page =
    <Redux redux={redux}>
        <SinglePage redux={redux}/>
    </Redux>

exports.render = () => ReactDOM.render(page, document.getElementById('smc-react-container'))


