{isMobile} = require('./feature')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Navbar, Nav, NavItem} = require('react-bootstrap')
{Loading, Icon, Tip} = require('./r_misc')

# SMC Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage} = require('./project_page')
{AccountPage} = require('./account_page') # SMELL: Not used but gets around a webpack error..
{FileUsePage} = require('./file_use')
{Support} = require('./support')

# SMC Libraries
misc = require('smc-util/misc')

{ProjectsNav} = require('./projects_nav')
{ActiveAppContent, CookieWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, NavTab, SMCLogo, VersionWarning} = require('./app_shared')

FileUsePageWrapper = (props) ->
    styles =
        zIndex: '10'
        marginLeft: '0'
        position: 'fixed'
        boxShadow: '0 0 15px #aaa'
        border: '2px solid #ccc'
        top: '43px'
        background: '#fff'
        right: '2em'
        overflowY: 'auto'
        overflowX: 'hidden'
        fontSize: '10pt'
        padding: '4px'
        borderRadius: '5px'
        width: '50%'
        height: '90%'

    <div style={styles}>
        {<FileUsePage redux={redux} />}
    </div>

NotificationBell = rclass
    displayName: 'NotificationBell'

    propTypes :
        count : rtypes.number

    on_click : ->
        @actions('page').toggle_show_file_use()

    notification_count : ->
        count_styles =
            fontSize : '8pt'
            color : 'red'
            position : 'absolute'
            left : '18.5px'
            fontWeight : 700
            background : 'transparent'
        if @props.count > 0
            <span style={count_styles}>{@props.count}</span>

    render : ->
        outer_styles =
            position : 'relative'
            marginRight : '-10px'
            float : 'left'

        inner_styles =
            padding : '10px'
            fontSize : '17pt'
            color : '#666'
            cursor : 'pointer'

        <NavItem
            style={outer_styles}
            onClick={@on_click}
        >
            <div style={inner_styles} >
                <Icon name='bell-o' />
                {@notification_count()}
            </div>
        </NavItem>

Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            open_projects     : rtypes.immutable.List
        page :
            active_top_tab    : rtypes.string    # key of the active tab
            show_connection   : rtypes.bool
            ping              : rtypes.number
            avgping           : rtypes.number
            connection_status : rtypes.string
            new_version       : rtypes.object
            fullscreen        : rtypes.bool
            cookie_warning    : rtypes.bool
            show_file_use     : rtypes.bool
        file_use :
            get_notify_count : rtypes.func
        account :
            get_fullname : rtypes.func
            is_logged_in : rtypes.func
        support :
            show : rtypes.bool

    propTypes :
        redux : rtypes.object

    componentWillUnmount : ->
        @actions('page').clear_all_handlers()

    account_name : ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"
        return name

    render_right_nav : ->
        <Nav id='smc-right-tabs-fixed' style={height:'42px', lineHeight:'20px', margin:'0'}>
            <NavTab
                name='account'
                label={@account_name()}
                icon='cog'
                actions={@actions('page')}
                active_top_tab={@props.active_top_tab}
            />
            <NavTab name='about' label='About' icon='question-circle' actions={@actions('page')} active_top_tab={@props.active_top_tab} />
            <NavItem className='divider-vertical hidden-xs' />
            <NavTab label='Help' icon='medkit' actions={@actions('page')} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)} />
            {<NotificationBell count={@props.get_notify_count()} /> if @props.is_logged_in()}
            <ConnectionIndicator actions={@actions('page')} />
        </Nav>

    render_project_nav_button : ->
        projects_styles =
            whiteSpace: 'nowrap'
            float:'right'
            padding: '11px 7px'

        <Nav style={height:'41px', margin:'0', overflow:'hidden'}>
            <NavTab
                name='projects'
                style={maxHeight:'44px'}
                inner_style={padding:'0px'}
                actions={@actions('page')}
                active_top_tab={@props.active_top_tab}

            >
                {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
                <div style={width:'100%'}>
                    <div style={projects_styles}>
                        Projects
                    </div>
                    <SMCLogo />
                </div>
            </NavTab>
        </Nav>

    render : ->
        # Use this pattern very sparingly.
        # Right now only used to access library generated elements
        # Very fragile.
        page_style ='
            #smc-top-bar>.container>ul>li>a {
                padding:0px;
                -webkit-touch-callout: none; /* iOS Safari */
                -webkit-user-select: none;   /* Chrome/Safari/Opera */
                -khtml-user-select: none;    /* Konqueror */
                -moz-user-select: none;      /* Firefox */
                -ms-user-select: none;       /* Internet Explorer/Edge */
                user-select: none;           /* Non-prefixed version, currently
                                                not supported by any browser */
            }
            #smc-top-bar>.container {
                position:absolute;
                display:flex;
                padding:0px;
                width:100%;
            }
            .input-group {
                z-index:0;
            }'

        style =
            display:'flex'
            flexDirection:'column'
            height:'100vh'
            width:'100vw'
            overflow:'auto'

        use_dropdown_menu = $(window).width() - 550 < @props.open_projects.size * 120

        if use_dropdown_menu
            proj_nav_styles = ProjectsNav.dropdown_nav_page_styles
        else
            proj_nav_styles = ProjectsNav.full_nav_page_styles

        <div ref="page" style={style}>
            <style>{page_style}</style>
            <style>{proj_nav_styles}</style>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
            {<Support actions={@actions('support')} /> if @props.show}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<Navbar id="smc-top-bar" style={display:'flex', marginBottom: 0, width:'100%', minHeight:'42px', position:'fixed', right:'0', zIndex:'100', opacity:'0.8'}>
                {@render_project_nav_button() if @props.is_logged_in()}
                <ProjectsNav dropdown={use_dropdown_menu} />
                {@render_right_nav()}
            </Navbar> if not @props.fullscreen}
            {<div className="smc-sticky-position-hack" style={minHeight:'42px'}> </div>if not @props.fullscreen}
            <FullscreenButton />
            {# Children must define their own padding from navbar and screen borders}
            {# Note that the parent is a flex container}
            <ActiveAppContent active_top_tab={@props.active_top_tab}/>
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container" style="overflow:hidden;position:absolute;top:0px;"></div>')
page = <Redux redux={redux}>
    <Page redux={redux}/>
</Redux>

exports.render = () => ReactDOM.render(page, $(".smc-react-container")[0])