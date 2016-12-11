##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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
{rclass, React, ReactDOM, redux, rtypes} = require('./smc-react')
{Alert, Button, ButtonToolbar, Col, Modal, Grid, Row, FormControl, FormGroup, Well, ClearFix} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, ImmutablePureRenderMixin, Footer, UNIT, SAGE_LOGO_COLOR, BS_BLUE_BGRND} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, TermsOfService, AccountCreationEmailInstructions} = require('./customize')
{HelpPageUsageSection} = require('./r_help')
#DESC_FONT = "'Roboto Mono','monospace'"
DESC_FONT = 'sans-serif'

misc = require('smc-util/misc')
SMC_ICON_URL = require('salvus-icon.svg')

images = [
    require('sagepreview/01-worksheet.png'),
    require('sagepreview/02-courses.png'),
    require('sagepreview/03-latex.png'),
    require('sagepreview/05-sky_is_the_limit.png'),
]
# 'static/sagepreview/04-files.png'

$.get window.smc_base_url + "/registration", (obj, status) ->
    if status == 'success'
        redux.getActions('account').setState(token : obj.token)

reset_password_key = () ->
    url_args = window.location.href.split("#")
    # toLowerCase is important since some mail transport agents will uppercase the URL -- see https://github.com/sagemathinc/smc/issues/294
    if url_args.length == 2 and url_args[1].slice(0, 6).toLowerCase() == 'forgot'
        return url_args[1].slice(7, 7+36).toLowerCase()
    return undefined

Passports = rclass
    displayName : 'Passports'

    propTypes :
        strategies : rtypes.array
        actions    : rtypes.object.isRequired

    styles :
        facebook :
            backgroundColor : "#395996"
            color           : "white"
        google   :
            backgroundColor : "#DC4839"
            color           : "white"
        twitter  :
            backgroundColor : "#55ACEE"
            color           : "white"
        github   :
            backgroundColor : "black"
            color           : "black"

    render_strategy: (name) ->
        if name is 'email'
            return
        url = "#{window.smc_base_url}/auth/#{name}"
        <a href={url} key={name}>
            <Icon size='2x' name='stack' href={url}>
                {<Icon name='circle' stack='2x' style={color: @styles[name].backgroundColor} /> if name isnt 'github'}
                <Icon name={name} stack='1x' size={'2x' if name is 'github'} style={color: @styles[name].color} />
            </Icon>
        </a>

    render: ->
        <div style={textAlign: 'center'}>
            <h3 style={marginTop: 0}>Connect with</h3>
            <div>
                {@render_strategy(name) for name in @props.strategies}
            </div>
            <hr style={marginTop: 10, marginBottom: 10} />
        </div>

ERROR_STYLE =
    color           : 'white'
    fontSize        : '125%'
    backgroundColor : 'red'
    border          : '1px solid lightgray'
    borderRadius    : '4px'
    padding         : '15px'
    marginTop       : '5px'
    marginBottom    : '5px'

SignUp = rclass
    displayName: 'SignUp'

    propTypes :
        strategies    : rtypes.array
        actions       : rtypes.object.isRequired
        sign_up_error : rtypes.object
        token         : rtypes.bool
        has_account   : rtypes.bool
        signing_up    : rtypes.bool
        style         : rtypes.object

    make_account: (e) ->
        e.preventDefault()
        name     = ReactDOM.findDOMNode(@refs.name).value
        email    = ReactDOM.findDOMNode(@refs.email).value
        password = ReactDOM.findDOMNode(@refs.password).value
        token    = ReactDOM.findDOMNode(@refs.token)?.value
        @props.actions.create_account(name, email, password, token)

    display_error: (field)->
        if @props.sign_up_error?[field]?
            <div style={ERROR_STYLE}>{@props.sign_up_error[field]}</div>

    display_passports: ->
        if not @props.strategies?
            return <Loading />
        if @props.strategies.length > 1
            return <Passports actions={@props.actions} strategies={@props.strategies} />

    display_token_input: ->
        if @props.token
            <FormGroup>
                <FormControl ref='token' type='text' placeholder='Enter the secret token' />
            </FormGroup>

    render: ->
        <Well style={marginTop:'10px'}>
            {@display_token_input()}
            {@display_error("token")}
            {@display_error("account_creation_failed")}   {# a generic error}
            {@display_passports()}
            <AccountCreationEmailInstructions />
            <form style={marginTop: 20, marginBottom: 20} onSubmit={@make_account}>
                <FormGroup>
                    {@display_error("first_name")}
                    <FormControl ref='name' type='text' autoFocus={false} placeholder='First and last Name' />
                </FormGroup>
                <FormGroup>
                    {@display_error("email_address")}
                    <FormControl ref='email' type='email' placeholder='Email address' />
                </FormGroup>
                <FormGroup>
                    {@display_error("password")}
                    <FormControl ref='password' type='password' placeholder='Choose a password' />
                </FormGroup>
                <TermsOfService style={fontSize: "small", textAlign: "center"} />
                <Button
                    style    = {marginBottom: UNIT, marginTop: UNIT}
                    disabled = {@props.signing_up}
                    bsStyle  = "success"
                    bsSize   = 'large'
                    type     = 'submit'
                    block >
                        {<Icon name="spinner" spin /> if @props.signing_up} Sign up!
                </Button>
            </form>
            <div style={textAlign: "center"}>
                Email <HelpEmailLink /> if you need help.
            </div>
        </Well>

SignIn = rclass
    displayName : "SignIn"

    propTypes :
        actions       : rtypes.object.isRequired
        sign_in_error : rtypes.string
        signing_in    : rtypes.bool
        has_account   : rtypes.bool
        xs            : rtypes.bool

    componentDidMount: ->
        @actions('page').set_sign_in_func(@sign_in)

    componentWillUnmount: ->
        @actions('page').remove_sign_in_func()

    sign_in: (e) ->
        if e?
            e.preventDefault()
        @props.actions.sign_in(ReactDOM.findDOMNode(@refs.email).value, ReactDOM.findDOMNode(@refs.password).value)

    display_forgot_password: ->
        @props.actions.setState(show_forgot_password : true)

    display_error: ->
        if @props.sign_in_error?
            <ErrorDisplay
                style   = {margin:'15px'}
                error   = {@props.sign_in_error}
                onClose = {=>@props.actions.setState(sign_in_error: undefined)}
            />

    remove_error: ->
        if @props.sign_in_error
            @props.actions.setState(sign_in_error : undefined)

    render: ->
        if @props.xs
            <Col xs=12>
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
                            <a onClick={@display_forgot_password} style={color: "#FFF", cursor: "pointer"} >Forgot Password?</a>
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
                    <Row className='form-inline pull-right' style={clear : "right"}>
                        {@display_error()}
                    </Row>
                </form>
            </Col>
        else
            <form onSubmit={@sign_in} className='form-inline'>
                <Grid fluid=true style={padding:0}>
                <Row>
                    <Col xs=5>
                        <FormGroup>
                            <FormControl ref='email' type='email' placeholder='Email address' autoFocus={true} onChange={@remove_error} />
                        </FormGroup>
                    </Col>
                    <Col xs=4>
                        <FormGroup>
                            <FormControl ref='password' type='password' placeholder='Password' onChange={@remove_error} />
                        </FormGroup>
                    </Col>
                    <Col xs=3>
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
                    <Col xs=7 xsOffset=5 style={paddingLeft:15}>
                        <div style={marginTop: '1ex'}>
                            <a onClick={@display_forgot_password} style={cursor: "pointer"} >Forgot Password?</a>
                        </div>
                    </Col>
                </Row>
                <Row className='form-inline pull-right' style={clear : "right"}>
                    <Col xs=12>
                        {@display_error()}
                    </Col>
                </Row>
                </Grid>
            </form>

ForgotPassword = rclass
    displayName : "ForgotPassword"

    propTypes :
        actions                 : rtypes.object.isRequired
        forgot_password_error   : rtypes.string
        forgot_password_success : rtypes.string

    getInitialState: ->
        email_address  : ''
        is_email_valid : false

    forgot_password: (e) ->
        e.preventDefault()
        value = @state.email_address
        if misc.is_valid_email_address(value)
            @props.actions.forgot_password(value)

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
        @props.actions.setState(show_forgot_password    : false)
        @props.actions.setState(forgot_password_error   : undefined)
        @props.actions.setState(forgot_password_success : undefined)

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
        actions              : rtypes.object.isRequired
        reset_key            : rtypes.string.isRequired
        reset_password_error : rtypes.string

    mixins: [ImmutablePureRenderMixin]

    reset_password: (e) ->
        e.preventDefault()
        @props.actions.reset_password(@props.reset_key, ReactDOM.findDOMNode(@refs.password).value)

    hide_reset_password: (e) ->
        e.preventDefault()
        history.pushState("", document.title, window.location.pathname)
        @props.actions.setState(reset_key : '', reset_password_error : '')

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
                                Reset password
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
            <Col sm=2>
                <h1 style={textAlign: "center"}><Icon name={@props.icon} /></h1>
            </Col>
            <Col sm=10>
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

SMC_Commercial = ->
    <iframe
        width       = "504"
        height      = "284"
        src         = "https://www.youtube.com/embed/AEKOjac9obk"
        frameBorder = "0"
        allowFullScreen>
    </iframe>

SMC_Quote = ->
    <div style={marginTop:'15px'}>
        <a href="https://www.youtube.com/watch?v=ZcxUNemJfZw" target="_blank"  style={'width':'104px','height':'104px','float':'right'} title="Will Conley heads UCLA's massive use of SageMathCloud in the Mathematics for Life Scientists">
            <img className='img-rounded' src={require('will_conley.jpg')} style={'height':'102px'} />
        </a>
        <p className='lighten'>"SageMathCloud provides a user-friendly interface. Students don’t need to install any software at all.
        They just open up a web browser and go to cloud.sagemath.com and that’s it. They just type code directly
        in, hit shift+enter and it runs, and they can see if it works. It provides immediate feedback. The course
        management features work really well."</p>
        <p><a href="https://github.com/sagemathinc/smc/wiki/Quotes" target="_blank">Other quotes…</a></p>
    </div>

LandingPageContent = rclass
    displayName : 'LandingPageContent'

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <Well style={color:'#666'}>
            {<ContentItem icon={v.icon} heading={v.heading} key={k} text={v.text} /> for k, v of LANDING_PAGE_CONTENT}
        </Well>

SagePreview = rclass
    displayName : "SagePreview"

    render: ->
        <div className="hidden-xs">
            <Well>
                <Row>
                    <Col sm=6>
                        <ExampleBox title="Interactive Worksheets" index={0}>
                            Interactively explore mathematics, science and statistics. <strong>Collaborate with others in real time</strong>. You can see their cursors moving around while they type &mdash; this works for Sage Worksheets and even Jupyter Notebooks!
                        </ExampleBox>
                    </Col>
                    <Col sm=6>
                        <ExampleBox title="Course Management" index={1}>
                            <SiteName /> helps to you to <strong>conveniently organize a course</strong>: add students, create their projects, see their progress,
                            understand their problems by dropping right into their files from wherever you are.
                            Conveniently handout assignments, collect them, grade them, and finally return them.
                            (<a href="https://github.com/sagemathinc/smc/wiki/Teaching" target="_blank">SMC used for Teaching</a> and <a href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/" target="_blank">learn more about courses</a>).
                        </ExampleBox>
                    </Col>
                </Row>
                <br />
                <Row>
                    <Col sm=6>
                      <ExampleBox title="LaTeX Editor" index={2}>
                            <SiteName /> supports authoring documents written in LaTeX, Markdown or HTML.
                            The <strong>preview</strong> helps you understanding what&#39;s going on.
                            The LaTeX editor also supports <strong>forward and inverse search</strong> to avoid getting lost in large documents.
                            SageMathCloud also allows you to publish documents online.
                        </ExampleBox>
                    </Col>
                    <Col sm=6>
                        <ExampleBox title="Jupyter Notebook, Linux Terminal, ..." index={3}>
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
        <div>
            <h3 style={marginBottom:UNIT, fontFamily: DESC_FONT} >{@props.title}</h3>
            <div style={marginBottom:'5px'} >
                <img alt={@props.title} className = 'smc-grow-two' src="#{images[@props.index]}" style={example_image_style} />
            </div>
            <div>
                {@props.children}
            </div>
        </div>

RememberMe = () ->
    <div style={fontSize : "35px", marginTop: "125px", textAlign: "center", color: "#888"}>
        <Icon name="spinner" spin /> Signing you in...
    </div>


exports.LandingPage = rclass
    propTypes:
        actions                 : rtypes.object.isRequired
        strategies              : rtypes.array
        sign_up_error           : rtypes.object
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
        has_account             : rtypes.bool

    render: ->
        if not @props.remember_me
            reset_key = reset_password_key()
            <div style={margin: UNIT}>
                    {<ResetPassword reset_key={reset_key}
                                    reset_password_error={@props.reset_password_error}
                                    actions={@props.actions} /> if reset_key}
                    {<ForgotPassword actions={@props.actions}
                                     forgot_password_error={@props.forgot_password_error}
                                     forgot_password_success={@props.forgot_password_success} /> if @props.show_forgot_password}
                <Row style={fontSize: UNIT,\
                            backgroundColor: SAGE_LOGO_COLOR,\
                            padding: 5, margin: 0, borderRadius:4}
                     className="visible-xs">
                        <SignIn
                            actions       = {@props.actions}
                            signing_in    = {@props.signing_in}
                            sign_in_error = {@props.sign_in_error}
                            has_account   = {@props.has_account}
                            xs            = {true} />
                        <div style={clear:'both'}></div>
                </Row>
                <Row style={fontSize        : 3*UNIT,\
                            backgroundColor : SAGE_LOGO_COLOR,\
                            padding         : 5,\
                            margin          : 0,\
                            borderRadius    : 4,\
                            whiteSpace      : 'nowrap'}
                     className="hidden-xs">
                      <div style={width    : 490,\
                                  zIndex   : 10,\
                                  position : "relative",\
                                  top      : 12,\
                                  right    : 12,\
                                  float    : "right"}
                           className="smc-sign-in-form">
                          <SignIn
                              actions       = {@props.actions}
                              signing_in    = {@props.signing_in}
                              sign_in_error = {@props.sign_in_error}
                              has_account   = {@props.has_account}
                              xs            = {false} />
                      </div>
                      <span style={display         : 'inline-block', \
                                   backgroundImage : "url('#{SMC_ICON_URL}')", \
                                   backgroundSize  : 'contain', \
                                   height          : UNIT * 4, width: UNIT * 4, \
                                   borderRadius    : 10, \
                                   verticalAlign   : 'center'}>
                      </span>
                      <div className="hidden-sm"
                          style={display       : 'inline-block',\
                                  fontFamily   : DESC_FONT,\
                                  fontSize     : "28px",\
                                  top          : -1 * UNIT,\
                                  position     : 'relative',\
                                  color        : 'white',\
                                  lineHeight   : 0,\
                                  paddingRight : UNIT}><SiteName /></div>
                      <div style={fontWeight   : "700",\
                                  fontSize     : "15px",\
                                  lineHeight   : "1.3",\
                                  fontFamily   : "sans-serif",\
                                  top          : 1,\
                                  display      : 'inline-block',\
                                  position     : "relative",\
                                  color        : "white",\
                                  paddingRight : UNIT}>Collaborative<br/>Computational<br/>Mathematics</div>
                </Row>
                <Row>
                    <div className="hidden-xs" style={padding: "#{UNIT}px"}>
                        <SiteDescription style={color:'#666', fontSize:"#{UNIT}px"} />
                    </div>
                </Row>
                <Row>
                    <Col sm=7 className="hidden-xs" style=marginTop:'10px'>
                        <Well style={'textAlign': 'center', 'float':'right'}>
                            <SMC_Commercial />
                            <br />
                            <SMC_Quote />
                        </Well>
                    </Col>
                    <Col sm=5>
                        <SignUp
                            actions       = {@props.actions}
                            sign_up_error = {@props.sign_up_error}
                            strategies    = {@props.strategies}
                            token         = {@props.token}
                            signing_up    = {@props.signing_up}
                            has_account   = {@props.has_account} />
                    </Col>
                </Row>
                <Well>
                    <Row>
                        <Col sm=12 className='hidden-xs'>
                            <HelpPageUsageSection />
                        </Col>
                    </Row>
                </Well>
                <Row>
                    <Col sm=12 className='hidden-xs'>
                        <LandingPageContent />
                    </Col>
                </Row>
                <SagePreview />
                <Footer/>
            </div>
        else
            <RememberMe />
