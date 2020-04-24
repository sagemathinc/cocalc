##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2017, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
The Landing Page
###
{rclass, React, ReactDOM, redux, rtypes} = require('./app-framework')
{Alert, Button, ButtonToolbar, Col, Modal, Grid, Row, FormControl, FormGroup, Well, ClearFix, Checkbox} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, ImmutablePureRenderMixin, UNIT, Markdown, COLORS, ExampleBox, Space, Tip} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, Footer} = require('./customize')
{get_browser} = require('./feature')
{Passports} = require('./passports')
{SignUp} = require('./landing-page/sign-up')
{SignIn} = require('./landing-page/sign-in')
{ForgotPassword} = require('./landing-page/forgot-password')
{ResetPassword} = require('./landing-page/reset-password')
{QueryParams} = require('./misc/query-params')
LA_NAME = require('./launch/actions').NAME

DESC_FONT = 'sans-serif'

{ShowSupportLink} = require('./support')
{reset_password_key} = require('./client/password-reset')

misc = require('smc-util/misc')
{APP_TAGLINE, DOC_URL} = require('smc-util/theme')
{APP_ICON, APP_ICON_WHITE, APP_LOGO_NAME, APP_LOGO_NAME_WHITE} = require('./art')
{APP_BASE_URL} = require('./misc_page')
$.get window.app_base_url + "/registration", (obj, status) ->
    if status == 'success'
        redux.getActions('account').setState(token : obj.token)

exports.Connecting = Connecting = () ->
    # See https://github.com/sagemathinc/cocalc/issues/4136 for the second part below, which will get deleted.
    <div style={fontSize : "25px", marginTop: "75px", textAlign: "center", color: COLORS.GRAY}>
        <Icon name="cc-icon-cocalc-ring" spin /> Connecting...
    </div>

exports.LandingPage = rclass
    displayName: 'LandingPage'

    propTypes:
        strategies              : rtypes.immutable.List
        sign_up_error           : rtypes.immutable.Map
        sign_in_error           : rtypes.string
        signing_in              : rtypes.bool
        signing_up              : rtypes.bool
        forgot_password_error   : rtypes.string
        forgot_password_success : rtypes.string #is this needed?
        show_forgot_password    : rtypes.bool
        token                   : rtypes.bool
        reset_key               : rtypes.string
        reset_password_error    : rtypes.string
        remember_me             : rtypes.bool
        has_remember_me         : rtypes.bool
        has_account             : rtypes.bool

    reduxProps:
        page:
            get_api_key   : rtypes.string
        customize:
            is_commercial        : rtypes.bool
            _is_configured       : rtypes.bool
            logo_square          : rtypes.string
            logo_rectangular     : rtypes.string
            help_email           : rtypes.string
            terms_of_service     : rtypes.string
            terms_of_service_url : rtypes.string
        account:
            sign_in_email_address : rtypes.string
        "#{LA_NAME}":
            type         : rtypes.string
            launch       : rtypes.string

    render_password_reset: ->
        reset_key = reset_password_key()
        if not reset_key
            return
        <ResetPassword
            reset_key            = {reset_key}
            reset_password_error = {@props.reset_password_error}
            help_email           = {@props.help_email}
        />

    render_forgot_password: ->
        if not @props.show_forgot_password
            return
        <ForgotPassword
            initial_email_address = {@props.sign_in_email_address ? ""}
            forgot_password_error   = {@props.forgot_password_error}
            forgot_password_success = {@props.forgot_password_success}
        />

    # this is an info blob on the landing page, clarifying to the user that "free" is a perpetual trial
    render_trial_info: ->
        return # try disabling this -- it's clutter.
        if not @props.is_commercial
            return
        <React.Fragment>
            <Alert bsStyle={'info'} style={marginTop: '15px'}>
                <div>
                    Trial access to CoCalc is free.
                    If you intend to use CoCalc often, then you or your university
                    should pay for it.
                    Existence of CoCalc depends on your subscription dollars!
                </div>
                <Space />
                <div>
                    If you are economically disadvantaged or doing open source math software
                    development,{' '}
                    <a href="mailto:help@cocalc.com" target="_blank">contact us</a>{' '}
                    for special options.
                </div>
            </Alert>
        </React.Fragment>

    render_support: ->
        return if not @props.is_commercial

        <div>
            Questions? Create a <ShowSupportLink />.
        </div>

    render_launch_action: ->
        return if not @props.type?
        <Row>
            <h3>Launch Action: <code>{@props.type}</code> for <code>{@props.launch}</code></h3>
        </Row>

    render_main_page: ->
        if (@props.remember_me or QueryParams.get('auth_token')) and not @props.get_api_key
            # Just assume user will be signing in.
            # CSS of this looks like crap for a moment; worse than nothing. So disabling unless it can be fixed!!
            return <Connecting />

        img_icon = if @props.logo_square?.length > 0 then @props.logo_square else APP_ICON_WHITE
        img_name = if @props.logo_rectangular?.length > 0 then @props.logo_rectangular else APP_LOGO_NAME_WHITE
        customized = @props.logo_square?.length > 0 and @props.logo_rectangular?.length > 0

        topbar =
            img_icon    : img_icon
            img_name    : img_name
            customized  : customized
            img_opacity : 1.0
            color       : if customized then COLORS.GRAY_D   else 'white'
            bg_color    : if customized then COLORS.BLUE_LLL else COLORS.LANDING.LOGIN_BAR_BG
            border      : "5px solid #{COLORS.LANDING.LOGIN_BAR_BG}"

        main_row_style =
            fontSize        : UNIT
            backgroundColor : COLORS.LANDING.LOGIN_BAR_BG
            padding         : 5
            margin          : 0
            borderRadius    : 4

        <div style={margin: UNIT}>
            {@render_launch_action()}
            {@render_password_reset()}
            {@render_forgot_password()}
            <Row
                style     = {main_row_style}
                className = {"visible-xs"}
             >
                    <SignIn
                        get_api_key   = {@props.get_api_key}
                        signing_in    = {@props.signing_in}
                        sign_in_error = {@props.sign_in_error}
                        has_account   = {@props.has_account}
                        xs            = {true}
                        strategies    = {@props.strategies}
                        color         = {topbar.color} />
                    <div style={clear:'both'}></div>
            </Row>
            <Row style={backgroundColor : topbar.bg_color,\
                        border          : topbar.border,\
                        padding         : 5,\
                        margin          : 0,\
                        marginBottom    : 20,\
                        borderRadius    : 5,\
                        position        : 'relative',\
                        whiteSpace      : 'nowrap'}
                 className="hidden-xs">
                  <div style={width    : 490,\
                              zIndex   : 10,\
                              position : "relative",\
                              top      : UNIT,\
                              right    : UNIT,\
                              fontSize : '11pt',\
                              float    : "right"} >
                      <SignIn
                          get_api_key   = {@props.get_api_key}
                          signing_in    = {@props.signing_in}
                          sign_in_error = {@props.sign_in_error}
                          has_account   = {@props.has_account}
                          xs            = {false}
                          strategies    = {@props.strategies}
                          color         = {topbar.color} />
                  </div>
                  {### Had this below, but it looked all wrong, conflicting with the name--  height           : UNIT * 5, width: UNIT * 5, \ ###}
                  {<div style={ display          : 'inline-block', \
                                backgroundImage  : "url('#{topbar.img_icon}')", \
                                backgroundSize   : 'contain', \
                                height           : 75, width: 75, \
                                margin           : 5,\
                                verticalAlign    : 'center',\
                                backgroundRepeat : 'no-repeat'}>
                  </div> if @props._is_configured}

                  {<div className="hidden-sm"
                      style={ display          : 'inline-block',\
                              fontFamily       : DESC_FONT,\
                              fontSize         : "28px",\
                              top              : UNIT,\
                              left             : UNIT * 7,\
                              width            : 300,\
                              height           : 75,\
                              position         : 'absolute',\
                              color            : topbar.color,\
                              opacity          : topbar.img_opacity,\
                              backgroundImage  : "url('#{topbar.img_name}')",\
                              backgroundSize   : 'contain',\
                              backgroundRepeat : 'no-repeat'}>
                  </div> if not topbar.customized}
                  {<img className="hidden-sm"
                      src={topbar.img_name}
                      style={ display          : 'inline-block',\
                              top              : UNIT,\
                              left             : UNIT * 7,\
                              width            : 'auto',\
                              height           : 50,\
                              position         : 'absolute',\
                              color            : topbar.color,\
                              opacity          : topbar.img_opacity}
                  /> if topbar.customized}

                  <div className="hidden-sm">
                      <SiteDescription
                          style={ fontWeight   : "700",\
                              fontSize     : "15px",\
                              fontFamily   : "sans-serif",\
                              bottom       : 10,\
                              left         : UNIT * 7,\
                              display      : 'inline-block',\
                              position     : "absolute",\
                              color        : topbar.color} />
                  </div>
            </Row>
            <Row style={minHeight : '60vh'}>
                <Col sm={6}>
                    <SignUp
                        sign_up_error   = {@props.sign_up_error}
                        strategies      = {@props.strategies}
                        get_api_key     = {@props.get_api_key}
                        token           = {@props.token}
                        has_remember_me = {@props.has_remember_me}
                        signing_up      = {@props.signing_up}
                        has_account     = {@props.has_account}
                        help_email      = {@props.help_email}
                        terms_of_service= {@props.terms_of_service}
                        terms_of_service_url = {@props.terms_of_service_url}
                    />
                </Col>
                <Col sm={6}>
                    <div style={color:"#666", fontSize:'16pt', marginTop:'5px'}>
                        Create a new account to the left or sign in with an existing account above.
                        <br/>
                        {@render_trial_info()}
                        <br/>
                        {@render_support()}
                        <br/>
                        {
                            if not @props.get_api_key
                                <div>
                                    <a href={DOC_URL} target="_blank" rel="noopener">Learn more about CoCalc...</a>
                                </div>
                        }
                    </div>
                </Col>
            </Row>
            <Footer/>
        </div>

    render: ->
        main_page = @render_main_page()
        if not @props.get_api_key
            return main_page
        app = misc.capitalize(@props.get_api_key)
        <div>
            <div style={padding:'15px'}>
                <h1>
                    CoCalc API Key Access for {app}
                </h1>
                <div style={fontSize: '12pt', color: '#444'}>
                    {app} would like your CoCalc API key.
                    <br/>
                    <br/>
                    This grants <b>full access</b> to all of your CoCalc projects to {app}, until you explicitly revoke your API key in Account preferences.
                    <br/>
                    <br/>
                    Please sign in or create an account below.
                </div>
            </div>
            <hr/>
            {main_page}
        </div>


