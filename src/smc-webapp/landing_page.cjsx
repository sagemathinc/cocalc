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
{ErrorDisplay, Icon, Loading, ImmutablePureRenderMixin, Footer, UNIT, Markdown, COLORS, ExampleBox, Space, Tip} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription} = require('./customize')
{get_browser} = require('./feature')
{Passports} = require('./passports')
{SignUp} = require('./landing-page/sign-up')
{SignIn} = require('./landing-page/sign-in')
{ForgotPassword} = require('./landing-page/forgot-password')
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

ResetPassword = rclass
    propTypes: ->
        reset_key            : rtypes.string.isRequired
        reset_password_error : rtypes.string

    mixins: [ImmutablePureRenderMixin]

    reset_password: (e) ->
        e.preventDefault()
        @actions('account').reset_password(@props.reset_key, ReactDOM.findDOMNode(@refs.password).value)

    hide_reset_password: (e) ->
        e.preventDefault()
        history.pushState("", document.title, window.location.pathname)
        @actions('account').setState(reset_key : '', reset_password_error : '')

    display_error: ->
        if @props.reset_password_error
            <span style={color: "red", fontSize: "90%"}>{@props.reset_password_error}</span>

    render: ->
        <Modal show={true} onHide={=>x=0}>
            <Modal.Body>
                <div>
                    <h1>Reset Password?</h1>
                    Enter your new password
                </div>
                <form onSubmit={@reset_password}>
                    <FormGroup>
                        <FormControl name='password' ref='password' type='password' placeholder='New Password' />
                    </FormGroup>
                    {@display_error()}
                    <hr />
                    Not working? Email us at <HelpEmailLink />
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button
                                type    = "submit"
                                bsStyle = "primary"
                                style   = {marginRight : 10}
                            >
                                Reset Password
                            </Button>
                            <Button onClick={@hide_reset_password}>
                                Cancel
                            </Button>
                        </div>
                    </Row>
                </form>
            </Modal.Body>
        </Modal>

ContentItem = rclass
    displayName: "ContentItem"

    mixins: [ImmutablePureRenderMixin]

    propTypes:
        icon: rtypes.string.isRequired
        heading: rtypes.string.isRequired
        text: rtypes.string.isRequired

    render: ->
        <Row>
            <Col sm={2}>
                <h1 style={textAlign: "center"}><Icon name={@props.icon} /></h1>
            </Col>
            <Col sm={10}>
                <h2 style={fontFamily: DESC_FONT}>{@props.heading}</h2>
                {@props.text}
            </Col>
        </Row>

LANDING_PAGE_CONTENT =
    teaching :
        icon : 'university'
        heading : 'Tools for Teaching'
        text : 'Create projects for your students, hand out assignments, then collect and grade them with ease.'
    collaboration :
        icon : 'weixin'
        heading : 'Collaboration Made Easy'
        text : 'Edit documents with multiple team members in real time.'
    programming :
        icon : 'code'
        heading : 'All-in-one Programming'
        text : 'Write, compile and run code in nearly any programming language.'
    math :
        icon : 'area-chart'
        heading : 'Computational Mathematics'
        text : 'Use SageMath, IPython, the entire scientific Python stack, R, Julia, GAP, Octave and much more.'
    latex :
        icon : 'superscript'
        heading : 'LaTeX Editor'
        text : 'Write beautiful documents using LaTeX.'

LandingPageContent = rclass
    displayName : 'LandingPageContent'

    mixins: [ImmutablePureRenderMixin]

    render: ->
        # temporarily disable -- it's getting old...
        return <div></div>
        <Well style={color:'#666'}>
            {<ContentItem icon={v.icon} heading={v.heading} key={k} text={v.text} /> for k, v of LANDING_PAGE_CONTENT}
        </Well>

example_image_style =
    border       : '1px solid #aaa'
    borderRadius : '3px'
    padding      : '5px'
    background   : 'white'
    height       : '236px'

ExampleBox = rclass
    displayName : "ExampleBox"

    propTypes :
        title : rtypes.string.isRequired
        index : rtypes.number.isRequired

    render: ->
        images = [
            require('sagepreview/01-worksheet.png'),
            require('sagepreview/02-courses.png'),
            require('sagepreview/03-latex.png'),
            require('sagepreview/05-sky_is_the_limit.png'),
        ]
        <div>
            <h3 style={marginBottom:UNIT} >{@props.title}</h3>
            <div style={marginBottom:'10px'} >
                <img alt={@props.title} className = 'smc-grow-two' src="#{images[@props.index]}" style={example_image_style} />
            </div>
            <div className="lighten">
                {@props.children}
            </div>
        </div>

SagePreview = rclass
    displayName : "SagePreview"

    render: ->
        <div className="hidden-xs">
            <Well>
                <Row>
                    <Col sm={6}>
                        <ExampleBox title="Interactive Worksheets" index={0}>
                            Interactively explore mathematics, science and statistics. <strong>Collaborate with others in real time</strong>. You can see their cursors moving around while they type &mdash; this works for Sage Worksheets and even Jupyter Notebooks!
                        </ExampleBox>
                    </Col>
                    <Col sm={6}>
                        <ExampleBox title="Course Management" index={1}>
                            <SiteName /> helps to you to <strong>conveniently organize a course</strong>: add students, create their projects, see their progress,
                            understand their problems by dropping right into their files from wherever you are.
                            Conveniently handout assignments, collect them, grade them, and finally return them.
                            (<a href="https://doc.cocalc.com/teaching-instructors.html" target="_blank">Instructor Guide for Teaching</a>).
                        </ExampleBox>
                    </Col>
                </Row>
                <br />
                <Row>
                    <Col sm={6}>
                      <ExampleBox title="LaTeX Editor" index={2}>
                            <SiteName /> supports authoring documents written in LaTeX, Markdown or HTML.
                            The <strong>preview</strong> helps you understanding what&#39;s going on.
                            The LaTeX editor also supports <strong>forward and inverse search</strong> to avoid getting lost in large documents.
                            CoCalc also allows you to publish documents online.
                        </ExampleBox>
                    </Col>
                    <Col sm={6}>
                        <ExampleBox title="Jupyter Notebooks and Linux Terminals" index={3}>
                            <SiteName /> does not arbitrarily restrict you.
                            Work with <strong>Jupyter Notebooks</strong>,
                            {' '}<strong>upload</strong> your own files,
                            {' '}<strong>process</strong> data and results online,
                            and work with a <strong>full Linux terminal</strong>.
                        </ExampleBox>
                    </Col>
                </Row>
            </Well>
        </div>

exports.Connecting = Connecting = () ->
    # See https://github.com/sagemathinc/cocalc/issues/4136 for the second part below, which will get deleted.
    <React.Fragment>
        <div style={fontSize : "25px", marginTop: "75px", textAlign: "center", color: COLORS.GRAY}>
            <Icon name="cc-icon-cocalc-ring" spin /> Connecting...
        </div>
        {<div style={textAlign: "center", margin:"auto", width:"50%", fontSize:'13pt', color: COLORS.GRAY}>
            If you are having persistent problems connecting,
            close this browser tab and open a new tab, or use Chrome version at least 77.3865.114.
            There was a <a target='_blank' rel="noopener" href="https://bugs.chromium.org/p/chromium/issues/detail?id=1006243">bug in Chrome v77</a>;{" "}
            opening a new tab works around this bug.
        </div> if window.buggyCh77}
    </React.Fragment>

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
            is_commercial : rtypes.bool
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

        topbar =
            img_icon    : APP_ICON_WHITE
            img_name    : APP_LOGO_NAME_WHITE
            img_opacity : 1.0
            color       : 'white'
            bg_color    : COLORS.LANDING.LOGIN_BAR_BG
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
                  <div style={ display          : 'inline-block', \
                               backgroundImage  : "url('#{topbar.img_icon}')", \
                               backgroundSize   : 'contain', \
                               height           : 75, width: 75, \
                               margin           : 5,\
                               verticalAlign    : 'center',\
                               backgroundRepeat : 'no-repeat'}>
                  </div>
                  <div className="hidden-sm"
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
                  </div>
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


