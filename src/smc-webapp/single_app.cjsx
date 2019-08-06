
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

    render_loading: ->
        <div style={loading_style}>
            <AppLogo size={'200px'} margin={'20px'}/>
            <br/>
            <strong>{SITE_NAME} opening <code>{@props.filename}</code></strong>
            <br/>
            <Loading />
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


