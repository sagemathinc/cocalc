{rclass, React, ReactDOM, redux, rtypes} = require('./smc-react')
{Alert, Button, ButtonToolbar, Col, Modal, Row, Input, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, ImmutablePureRenderMixin, Footer, UNIT, SAGE_LOGO_COLOR, BS_BLUE_BGRND} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, TermsOfService, AccountCreationEmailInstructions} = require('./customize')

#DESC_FONT = "'Roboto Mono','monospace'"
DESC_FONT = 'sans-serif'

misc = require('smc-util/misc')
# {SMC_ICON_URL} = require('./misc_page')
SMC_ICON_URL = require('../static/salvus-icon.svg')

images = [
    require('static/sagepreview/01-worksheet.png'),
    require('static/sagepreview/02-courses.png'),
    require('static/sagepreview/03-latex.png'),
    require('static/sagepreview/05-sky_is_the_limit.png'),
]
# 'static/sagepreview/04-files.png'

$.get window.smc_base_url + "/auth/strategies", (obj, status) ->
    if status == 'success'
        redux.getActions('account').setState(strategies : obj)

$.get window.smc_base_url + "/registration", (obj, status) ->
    if status == 'success'
        redux.getActions('account').setState(token : obj.token)

reset_password_key = () ->
    url_args = window.location.href.split("#")
    if url_args.length == 2 and url_args[1].slice(0, 6) == 'forgot'
        return url_args[1].slice(7, 7+36)
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

    render_strategy : (name) ->
        if name is 'email'
            return
        <a href={"/auth/#{name}"} key={name}>
            <Icon size='2x' name='stack' href={"/auth/#{name}"}>
                {<Icon name='circle' stack='2x' style={color: @styles[name].backgroundColor} /> if name isnt 'github'}
                <Icon name={name} stack='1x' size={'2x' if name is 'github'} style={color: @styles[name].color} />
            </Icon>
        </a>

    render : ->
        <div style={textAlign: 'center'}>
            <h3 style={marginTop: 0}>Connect with</h3>
            <div>
                {@render_strategy(name) for name in @props.strategies}
            </div>
            <hr style={marginTop: 10, marginBottom: 10} />
        </div>

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

    make_account : (e) ->
        e.preventDefault()
        name     = @refs.name.getValue()
        email    = @refs.email.getValue()
        password = @refs.password.getValue()
        token    = @refs.token?.getValue()
        @props.actions.create_account(name, email, password, token)

    display_error : (field)->
        if @props.sign_up_error?[field]?
            <div style={color: "red", fontSize: "90%"}>{@props.sign_up_error[field]}</div>

    display_passports : ->
        if not @props.strategies?
            return <Loading />
        if @props.strategies.length > 1
            return <Passports actions={@props.actions} strategies={@props.strategies} />

    display_token_input : ->
        if @props.token
            <Input ref='token' type='text' placeholder='Enter the secret token' />

    render : ->
        <Well style={marginTop:'10px'}>
            {@display_token_input()}
            {@display_error("token")}
            {@display_passports()}
            <AccountCreationEmailInstructions />
            <form style={marginTop: 20, marginBottom: 20} onSubmit={@make_account}>
                {@display_error("first_name")}
                <Input ref='name' type='text' autoFocus={not @props.has_account} placeholder='First and last Name' />
                {@display_error("email_address")}
                <Input ref='email' type='email' placeholder='Email address' />
                {@display_error("password")}
                <Input ref='password' type='password' placeholder='Choose a password' />
                <TermsOfService style={fontSize: "small", textAlign: "center"} />
                <Button style={marginBottom: UNIT, marginTop: UNIT}
                    disabled={@props.signing_up}
                    bsStyle="success"
                    bsSize='large'
                    type='submit'
                    block>
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
        actions : rtypes.object.isRequired
        sign_in_error : rtypes.string
        signing_in : rtypes.bool
        has_account : rtypes.bool

    sign_in : (e) ->
        e.preventDefault()
        @props.actions.sign_in(@refs.email.getValue(), @refs.password.getValue())

    display_forgot_password : ->
        @props.actions.setState(show_forgot_password : true)

    display_error : ->
        if @props.sign_in_error?
            <ErrorDisplay error={@props.sign_in_error} onClose={=>@props.actions.setState(sign_in_error: undefined)} />

    remove_error : ->
        if @props.sign_in_error
            @props.actions.setState(sign_in_error : undefined)

    render : ->
        <Col sm=5>
            <form onSubmit={@sign_in} className='form-inline' style={marginRight : 0, marginTop : 2 * UNIT}>
                <Row>
                    <Col xs=5 style={paddingRight:'2px'}>
                        <Input style={marginRight: UNIT, width:'100%'} ref='email' type='email' placeholder='Email address' autoFocus={@props.has_account} onChange={@remove_error} />
                    </Col>
                    <Col xs=4 style={paddingLeft:'0px', paddingRight:'0px'}>
                        <Input style={marginRight: UNIT, width:'100%'} ref='password' type='password' placeholder='Password' onChange={@remove_error} />
                    </Col>
                    <Col xs=3 style={paddingLeft:'0px'}>
                        <Button type="submit" disabled={@props.signing_in} bsStyle="primary" className='pull-right'>Sign&nbsp;In</Button>
                    </Col>
                </Row>
            </form>
            <Row>
                <Col xs=7 xsOffset=5>
                    <a onClick={@display_forgot_password} style={cursor: "pointer", fontSize: '10pt', marginLeft: '-15px'} >Forgot Password?</a>
                </Col>
            </Row>
            <Row className='form-inline pull-right' style={clear : "right"}>
                <Col xs=12>
                    {@display_error()}
                </Col>
            </Row>
        </Col>

ForgotPassword = rclass
    displayName : "ForgotPassword"

    mixins: [ImmutablePureRenderMixin]

    propTypes :
        actions : rtypes.object.isRequired
        forgot_password_error : rtypes.string
        forgot_password_success : rtypes.string

    forgot_password : (e) ->
        e.preventDefault()
        @props.actions.forgot_password(@refs.email.getValue())

    display_error : ->
        if @props.forgot_password_error?
            <span style={color: "red", fontSize: "90%"}>{@props.forgot_password_error}</span>

    display_success : ->
        if @props.forgot_password_success?
            <span style={color: "green", fontSize: "90%"}>{@props.forgot_password_success}</span>

    hide_forgot_password : ->
        @props.actions.setState(show_forgot_password : false)
        @props.actions.setState(forgot_password_error : undefined)
        @props.actions.setState(forgot_password_success : undefined)

    render : ->
        <Modal show={true} onHide={@hide_forgot_password}>
            <Modal.Body>
                <div>
                    <h1>Forgot Password?</h1>
                    Enter your email address to reset your password
                </div>
                <form onSubmit={@forgot_password}>
                    {@display_error()}
                    {@display_success()}
                    <Input ref='email' type='email' placeholder='Email address' />
                    <hr />
                    Not working? Email us at <HelpEmailLink />
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button type="submit" bsStyle="primary" bsSize="medium" style={marginRight : 10}>Reset Password</Button>
                            <Button onClick={@hide_forgot_password} bsSize="medium">Cancel</Button>
                        </div>
                    </Row>
                </form>
            </Modal.Body>
        </Modal>

ResetPassword = rclass
    propTypes : ->
        actions : rtypes.object.isRequired
        reset_key : rtypes.string.isRequired
        reset_password_error : rtypes.string

    mixins: [ImmutablePureRenderMixin]

    reset_password : (e) ->
        e.preventDefault()
        @props.actions.reset_password(@props.reset_key, @refs.password.getValue())

    hide_reset_password : (e) ->
        e.preventDefault()
        history.pushState("", document.title, window.location.pathname)
        @props.actions.setState(reset_key : '', reset_password_error : '')

    display_error : ->
        if @props.reset_password_error
            <span style={color: "red", fontSize: "90%"}>{@props.reset_password_error}</span>

    render : ->
        <Modal show={true} onHide={=>x=0}>
            <Modal.Body>
                <div>
                    <h1>Reset Password?</h1>
                    Enter your new password
                </div>
                <form onSubmit={@reset_password}>
                    <Input ref='password' type='password' placeholder='New Password' />
                    {@display_error()}
                    <hr />
                    Not working? Email us at <HelpEmailLink />
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button type="submit" bsStyle="primary" bsSize="medium" style={marginRight : 10}>Reset password</Button>
                            <Button onClick={@hide_reset_password} bsSize="medium">Cancel</Button>
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

    render : ->
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
        heading : 'Built-in LaTeX Editor'
        text : 'Write beautiful documents using LaTeX.'

SMC_Commercial = () ->
    <iframe width="560" height="315" src="https://www.youtube.com/embed/AEKOjac9obk" frameBorder="0" allowFullScreen></iframe>
    #<iframe src="https://player.vimeo.com/video/148146653?title=0&byline=0&portrait=0" width="600" height="337" frameBorder="0" allowFullScreen>
    #</iframe>

LandingPageContent = rclass
    displayName : 'LandingPageContent'

    mixins: [ImmutablePureRenderMixin]

    render : ->
        <Well style={color:'#666'}>
            {<ContentItem icon={v.icon} heading={v.heading} key={k} text={v.text} /> for k, v of LANDING_PAGE_CONTENT}
        </Well>

SagePreview = rclass
    displayName : "SagePreview"

    render : ->
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
                        </ExampleBox>
                    </Col>
                    <Col sm=6>
                        <ExampleBox title="The Sky is the Limit" index={3}>
                            <SiteName /> does not arbitrarily restrict you. <strong>Upload</strong> your
                            own files, <strong>generate</strong> data and results online,
                            then download or <strong>publish</strong> your results.
                            Besides Sage Worksheets and Jupyter Notebooks,
                            you can work with a <strong>full Linux terminal</strong> and edit text with multiple cursors.
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
        title   : rtypes.string.isRequired
        index   : rtypes.number.isRequired

    render : ->
        <div>
            <h3 style={marginBottom:UNIT, fontFamily: DESC_FONT} >{@props.title}</h3>
            <div style={marginBottom:'5px'} >
                <img alt={@props.title} className = 'smc-grow-two' src="#{images[@props.index]}" style={example_image_style} />
            </div>
            <div>
                {@props.children}
            </div>
        </div>

LogoWide = rclass
    displayName: "LogoWide"
    render : ->
        <div style={fontSize: 3*UNIT,\
                    whiteSpace: 'nowrap',\
                    backgroundColor: SAGE_LOGO_COLOR,\
                    borderRadius : 4,\
                    display: 'inline-block',\
                    padding: 1,\
                    margin: UNIT + 'px 0',\
                    lineHeight: 0}>
          <span style={display: 'inline-block', \
                       backgroundImage: "url('#{SMC_ICON_URL}')", \
                       backgroundSize: 'contain', \
                       height : UNIT * 4, width: UNIT * 4, \
                       borderRadius : 10, \
                       verticalAlign: 'center'}>
          </span>
          <div className="hidden-sm"
              style={display:'inline-block',\
                      fontFamily: DESC_FONT,\
                      top: -1 * UNIT,\
                      position: 'relative',\
                      color: 'white',\
                      paddingRight: UNIT}><SiteName /></div>
        </div>

RememberMe = () ->
    <div style={fontSize : "35px", marginTop: "125px", textAlign: "center", color: "#888"}>
        <Icon name="spinner" spin /> Signing you in...
    </div>


exports.LandingPage = rclass
    propTypes:
        actions : rtypes.object.isRequired
        strategies : rtypes.array
        sign_up_error : rtypes.object
        sign_in_error : rtypes.string
        signing_in : rtypes.bool
        signing_up : rtypes.bool
        forgot_password_error : rtypes.string
        forgot_password_success : rtypes.string #is this needed?
        show_forgot_password : rtypes.bool
        token : rtypes.bool
        reset_key : rtypes.string
        reset_password_error : rtypes.string
        remember_me : rtypes.bool
        has_account : rtypes.bool

    render : ->
        if not @props.remember_me
            reset_key = reset_password_key()
            <div style={marginLeft: 20, marginRight: 20}>
                {<ResetPassword reset_key={reset_key}
                                reset_password_error={@props.reset_password_error}
                                actions={@props.actions} /> if reset_key}
                {<ForgotPassword actions={@props.actions}
                                 forgot_password_error={@props.forgot_password_error}
                                 forgot_password_success={@props.forgot_password_success} /> if @props.show_forgot_password}
                <Row>
                    <Col sm=12>
                        <Row>
                            <Col sm=7 className="hidden-xs">
                                <LogoWide />
                            </Col>
                            <SignIn actions={@props.actions}
                                     signing_in={@props.signing_in}
                                     sign_in_error={@props.sign_in_error}
                                     has_account={@props.has_account} />
                        </Row>
                        <Row className="hidden-xs">
                            <Col sm=12>
                                <SiteDescription />
                            </Col>
                        </Row>
                    </Col>
                </Row>
                <Row>
                    <Col sm=7 className="hidden-xs" style=marginTop:'10px'>
                        <SMC_Commercial />
                    </Col>
                    <Col sm=5>
                        <SignUp actions={@props.actions}
                                 sign_up_error={@props.sign_up_error}
                                 strategies={@props.strategies}
                                 token={@props.token}
                                 signing_up={@props.signing_up}
                                 has_account={@props.has_account} />
                    </Col>
                </Row>
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
