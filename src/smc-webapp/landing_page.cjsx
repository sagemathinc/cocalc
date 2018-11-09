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
{ErrorDisplay, Icon, Loading, ImmutablePureRenderMixin, Footer, UNIT, COLORS, ExampleBox, Space, Tip} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription} = require('./customize')
{Passports} = require('./passports')
{SignUp} = require('./sign-up')


DESC_FONT = 'sans-serif'

{ShowSupportLink} = require('./support')
{reset_password_key} = require('./password-reset')

misc = require('smc-util/misc')
{APP_TAGLINE} = require('smc-util/theme')
{APP_ICON, APP_ICON_WHITE, APP_LOGO_NAME, APP_LOGO_NAME_WHITE} = require('./art')
{APP_BASE_URL} = require('./misc_page')
$.get window.app_base_url + "/registration", (obj, status) ->
    if status == 'success'
        redux.getActions('account').setState(token : obj.token)

SignIn = rclass
    displayName : "SignIn"

    propTypes :
        sign_in_error : rtypes.string
        signing_in    : rtypes.bool
        has_account   : rtypes.bool
        xs            : rtypes.bool
        color         : rtypes.string
        strategies    : rtypes.immutable.List
        get_api_key   : rtypes.string

    componentDidMount: ->
        @actions('page').set_sign_in_func(@sign_in)

    componentWillUnmount: ->
        @actions('page').remove_sign_in_func()

    sign_in: (e) ->
        if e?
            e.preventDefault()
        @actions('account').sign_in(ReactDOM.findDOMNode(@refs.email).value, ReactDOM.findDOMNode(@refs.password).value)

    display_forgot_password: ->
        @actions('account').setState(show_forgot_password : true)

    display_error: ->
        if @props.sign_in_error?
            <ErrorDisplay
                style   = {margin:'15px'}
                error   = {@props.sign_in_error}
                onClose = {=>@actions('account').setState(sign_in_error: undefined)}
            />

    render_passports: ->
        <div>
            <Passports
                strategies  = {@props.strategies}
                get_api_key = {@props.get_api_key}
                no_heading  = {true}
            />
        </div>

    remove_error: ->
        if @props.sign_in_error
            @actions('account').setState(sign_in_error : undefined)

    forgot_font_size: ->
        if @props.sign_in_error?
            return '16pt'
        else
            return '12pt'

    render: ->
        if @props.xs
            <Col xs={12}>
                <form onSubmit={@sign_in} className='form-inline'>
                    <Row>
                        <FormGroup>
                            <FormControl ref='email' type='email' placeholder='Email address' autoFocus={@props.has_account} onChange={@remove_error} />
                        </FormGroup>
                    </Row>
                    <Row>
                        <FormGroup>
                            <FormControl style={width:'100%'} ref='password' type='password' placeholder='Password' onChange={@remove_error} />
                        </FormGroup>
                    </Row>
                    <Row>
                        <div style={marginTop: '1ex'}>
                            <a onClick={@display_forgot_password} style={color:@props.color, cursor: "pointer", fontSize:@forgot_font_size()} >Forgot Password?</a>
                        </div>
                    </Row>
                    <Row>
                        <Button
                            type      = "submit"
                            disabled  = {@props.signing_in}
                            bsStyle   = "default" style={height:34}
                            className = 'pull-right'>Sign&nbsp;In
                        </Button>
                    </Row>
                    <Row>
                        {@render_passports()}
                    </Row>
                    <Row className='form-inline pull-right' style={clear : "right"}>
                        {@display_error()}
                    </Row>
                </form>
            </Col>
        else
            <form onSubmit={@sign_in} className='form-inline'>
                <Grid fluid={true} style={padding:0}>
                <Row>
                    <Col xs={5}>
                        <FormGroup>
                            <FormControl style={width:'100%'} ref='email' type='email' placeholder='Email address' autoFocus={true} onChange={@remove_error} />
                        </FormGroup>
                    </Col>
                    <Col xs={4}>
                        <FormGroup>
                            <FormControl style={width:'100%'} ref='password' type='password' placeholder='Password' onChange={@remove_error} />
                        </FormGroup>
                    </Col>
                    <Col xs={3}>
                        <Button
                            type      = "submit"
                            disabled  = {@props.signing_in}
                            bsStyle   = "default"
                            style     = {height:34}
                            className = 'pull-right'>Sign&nbsp;in
                        </Button>
                    </Col>
                </Row>
                <Row>
                    <Col xs={7} xsOffset={5} style={paddingLeft:15}>
                        <div style={marginTop: '1ex'}>
                            <a onClick={@display_forgot_password} style={color:@props.color, cursor: "pointer", fontSize:@forgot_font_size()} >Forgot Password?</a>
                        </div>
                    </Col>
                </Row>
                <Row>
                    <Col xs={12}>
                        {@render_passports()}
                    </Col>
                </Row>
                <Row className='form-inline pull-right' style={clear : "right"}>
                    <Col xs={12}>
                        {@display_error()}
                    </Col>
                </Row>
                </Grid>
            </form>

ForgotPassword = rclass
    displayName : "ForgotPassword"

    propTypes:
        forgot_password_error   : rtypes.string
        forgot_password_success : rtypes.string

    getInitialState: ->
        email_address  : ''
        is_email_valid : false

    forgot_password: (e) ->
        e.preventDefault()
        value = @state.email_address
        if misc.is_valid_email_address(value)
            @actions('account').forgot_password(value)

    set_email: (evt) ->
        email = evt.target.value
        @setState
            email_address  : email
            is_email_valid : misc.is_valid_email_address(email)

    display_error: ->
        if @props.forgot_password_error?
            <span style={color: "red"}>{@props.forgot_password_error}</span>

    display_success: ->
        if @props.forgot_password_success?
            s = @props.forgot_password_success.split("check your spam folder")
            <span>
                {s[0]}
                <span style={color: "red", fontWeight: "bold"}>
                    check your spam folder
                </span>
                {s[1]}
            </span>

    hide_forgot_password: ->
        @actions('account').setState(show_forgot_password    : false)
        @actions('account').setState(forgot_password_error   : undefined)
        @actions('account').setState(forgot_password_success : undefined)

    render: ->
        <Modal show={true} onHide={@hide_forgot_password}>
            <Modal.Body>
                <div>
                    <h4>Forgot Password?</h4>
                    Enter your email address to reset your password
                </div>
                <form onSubmit={@forgot_password} style={marginTop:'1em'}>
                    <FormGroup>
                        <FormControl ref='email' type='email' placeholder='Email address' autoFocus={true} onChange={@set_email} />
                    </FormGroup>
                    {if @props.forgot_password_error then @display_error() else @display_success()}
                    <hr />
                    Not working? Email us at <HelpEmailLink />
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button
                                disabled = {not @state.is_email_valid}
                                type     = "submit"
                                bsStyle  = "primary"
                                style    = {marginRight : 10}
                            >
                                Reset Password
                            </Button>
                            <Button onClick={@hide_forgot_password}>
                                Close
                            </Button>
                        </div>
                    </Row>
                </form>
            </Modal.Body>
        </Modal>

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
                        <FormControl ref='password' type='password' placeholder='New Password' />
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
                            (<a href="https://tutorial.cocalc.com/" target="_blank"><SiteName /> used for Teaching</a>).
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

Connecting = () ->
    <div style={fontSize : "35px", marginTop: "125px", textAlign: "center", color: "#888"}>
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
            is_commercial : rtypes.bool

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
            forgot_password_error   = {@props.forgot_password_error}
            forgot_password_success = {@props.forgot_password_success}
        />

    # this is an info blob on the landing page, clarifying to the user that "free" is a perpetual trial
    render_trial_info: ->
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
                    <a href="mailto:help@sagemath.com" target="_blank">contact us</a>{' '}
                    for special options.
                </div>
            </Alert>
            <div>
                If you have any questions or comments, create a <ShowSupportLink />.
            </div>
        </React.Fragment>

    render_main_page: ->
        if @props.remember_me and not @props.get_api_key
            # Just assume user will be signing in.
            # CSS of this looks like crap for a moment; worse than nothing. So disabling unless it can be fixed!!
            #return <Connecting />
            return <span/>

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
            {@render_password_reset()}
            {@render_forgot_password()}
            <Row
                style     = {main_row_style}
                className = {"visible-xs"}
             >
                    <SignIn
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
                          strategies    = {@props.strategies}
                          get_api_key   = {@props.get_api_key}
                          signing_in    = {@props.signing_in}
                          sign_in_error = {@props.sign_in_error}
                          has_account   = {@props.has_account}
                          xs            = {false}
                          color         = {topbar.color} />
                  </div>
                  {### Had this below, but it looked all wrong, conflicting with the name--  height           : UNIT * 5, width: UNIT * 5, \ ###}
                  <div style={ display          : 'inline-block', \
                               backgroundImage  : "url('#{topbar.img_icon}')", \
                               backgroundSize   : 'contain', \
                               height           : 55, width: 55, \
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
                              width            : 250,\
                              height           : 55,\
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
                    <div style={color:"#333", fontSize:'12pt', marginTop:'5px'}>
                        Create a new account here or sign in with an existing account above.
                        <br/>
                        {@render_trial_info()}
                        <br/>
                        {
                            if not @props.get_api_key
                                <div>
                                    <a href={APP_BASE_URL + "/"}>Learn more about CoCalc...</a>
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


