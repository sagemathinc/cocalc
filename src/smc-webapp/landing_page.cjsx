{rclass, FluxComponent, React, ReactDOM, flux, rtypes} = require('./r')
{Alert, Button, ButtonToolbar, Col, Modal, Row, Input, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading} = require('./r_misc')

misc = require('smc-util/misc')

UNIT = 15
images = ['static/sagepreview/01-worksheet.png', 'static/sagepreview/02-courses.png', 'static/sagepreview/03-latex.png', 'static/sagepreview/04-files.png']

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

    componentDidMount : ->
        if not @props.strategies?.length
            @props.actions.set_sign_in_strategies()

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
        if not @props.strategies?
            return <Loading />
        <div style={textAlign: 'center'}>
            <h3 style={marginTop: 0}>Connect with</h3>
            <div>
                {@render_strategy(name) for name in @props.strategies}
            </div>
        </div>

SignUp = rclass
    displayName: 'SignUp'

    propTypes :
        strategies : rtypes.array
        actions : rtypes.object.isRequired
        sign_up_error: rtypes.object
        token: rtypes.bool
        style: rtypes.object

    make_account : (e)->
        e.preventDefault()
        name = @refs.name.getValue()
        email = @refs.email.getValue()
        password = @refs.password.getValue()
        token = @refs.token?.getValue()
        @props.actions.sign_this_fool_up(name, email, password, "omnibase")

    display_error : (field)->
        if @props.sign_up_error?[field]?
            <span style={color: "red", fontSize: "90%"}>{@props.sign_up_error[field]}</span>

    display_token_input : ->
        if @props.token
            <Input ref='token' type='text' placeholder='Enter the secret token' />

    render : ->
        <Well>
            {@display_token_input()}
            <Passports actions={@props.actions} strategies={@props.strategies} />
            <hr style={marginTop: 10, marginBottom: 10} />
            <h3 style={marginTop: 0, textAlign: 'center'} >Create an Account</h3>
            {@display_error("token")}
            <form style={marginTop: 20, marginBottom: 20} onSubmit={@make_account}>
                {@display_error("first_name")}
                <Input ref='name' type='text' placeholder='First and Last Name' />
                {@display_error("email_address")}
                <Input ref='email' type='email' placeholder='Email address' />
                {@display_error("password")}
                <Input ref='password' type='password' placeholder='Choose a password' />
                <span style={fontSize: "small", textAlign: "center"}>By clicking Sign up! you agree to our <a href="/policies/terms.html">Terms of Service</a>.</span>
                <Button style={marginBottom: UNIT, marginTop: UNIT} bsStyle="success" bsSize='large' type='submit' block>Sign up!</Button>
            </form>
            <div style={textAlign: "center"}>
                Email <a href="mailto:office@sagemath.com">office@sagemath.com</a> if you need help.
            </div>
        </Well>

SignIn = rclass
    displayName : "SignIn"

    propTypes :
        actions : rtypes.object.isRequired

    sign_in : (e) ->
        e.preventDefault()
        @props.actions.sign_in(@refs.email.getValue(), @refs.password.getValue())

    display_forgot_password : ->
        @props.actions.setTo(show_forgot_password : true)

    render : ->
        <Row>
            <Col xs=5>
                <h1><img src="static/favicon-195.png" style={height : UNIT * 4, borderRadius : "10px", verticalAlign: "center"}/> SageMathCloud </h1>
            </Col>
            <Col xs=7>
                <Row className='form-inline pull-right'>
                    <form onSubmit={@sign_in} className='form-inline pull-right' style={marginRight : -4 * UNIT, marginTop : 20}>
                        <Col xs=4>
                            <Input style={marginRight : UNIT} ref='email' bsSize="small" type='email' placeholder='Email address' />
                        </Col>
                        <Col xs=4>
                            <Input style={marginRight : UNIT} ref='password' bsSize="small" type='password' placeholder='Password' />
                            <Row>
                                <a onClick={@display_forgot_password} style={marginLeft: UNIT + 11, cursor: "pointer", fontSize: 11} >Forgot Password?</a>
                            </Row>
                        </Col>
                        <Col xs=4>
                            <Button type="submit" bsSize="medium" >Sign in</Button>
                        </Col>
                    </form>
                </Row>
            </Col>
        </Row>

ForgotPassword = rclass
    displayName : "ForgotPassword"

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
        @props.actions.setTo(show_forgot_password : false)
        @props.actions.setTo(forgot_password_error : undefined)
        @props.actions.setTo(forgot_password_success : undefined)

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
                    Not working? Email us at <a href="mailto:help@sagemath.com">help@sagemath.com</a>
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button type="submit" bsSize="medium" style={marginRight : 10}>Send email</Button>
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

    reset_password : (e) ->
        e.preventDefault()
        @props.actions.reset_password(@props.reset_key, @refs.password.getValue())

    render : ->
        <Modal show={true} onHide={=>x=0}>
            <Modal.Body>
                <div>
                    <h1>Reset Password?</h1>
                    Enter your new password
                </div>
                <form onSubmit={@reset_password}>
                    <Input ref='password' type='password' placeholder='New Password' />
                    <hr />
                    Not working? Email us at <a href="mailto:help@sagemath.com">help@sagemath.com</a>
                    <Row>
                        <div style={textAlign: "right", paddingRight : 15}>
                            <Button type="submit" bsSize="medium" style={marginRight : 10}>Reset password</Button>
                        </div>
                    </Row>
                </form>
            </Modal.Body>
        </Modal>

ContentItem = rclass
    displayName: "ContentItem"

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
                <h2 style={marginBottom : "-5px"}>{@props.heading}</h2>
                {@props.text}
            </Col>
        </Row>

LANDING_PAGE_CONTENT =
    teaching :
        icon : 'university'
        heading : 'Tools for teaching'
        text : 'Manage projects for students, hand out assignments, collect and grade them with ease'
    collaboration :
        icon : 'weixin'
        heading : 'Collaboration made easy'
        text : 'Edit projects and documents with multiple team members in real time'
    programming :
        icon : 'code'
        heading : 'All-in-one programming'
        text : 'Write, compile and run code in nearly any programming language'
    math :
        icon : 'area-chart'
        heading : 'Computational mathematics'
        text : 'Use SageMath, IPython and the entire scientific Python stack, R, Julia, GAP, Octave and much more'
    latex :
        icon : 'superscript'
        heading : 'Built-in LaTeX editor'
        text : 'Write beautiful documents using LaTeX'

LandingPageContent = rclass
    displayName : 'LandingPageContent'

    render : ->
        <div style={backgroundColor: "white", color: "rgb(51, 102, 153)"}>
            {<ContentItem icon={v.icon} heading={v.heading} text={v.text} /> for k, v of LANDING_PAGE_CONTENT}
        </div>

SagePreview = rclass
    displayName : "SagePreview"

    propTypes :
        actions : rtypes.object.isRequired
        openImage : rtypes.number

    render : ->
        <div>
            <Well>
                <Row>
                    <Col sm=6>
                        <ExampleBox actions={@props.actions} title="Interactive Worksheets" index={0}>
                            Interactively explore mathematics, science and statistics. <strong>Collaborate with others in real-time</strong>. You can see their cursors moving around while they type &mdash; this even works for Sage Worksheets and even&nbsp;Jupyter Notebooks!
                        </ExampleBox>
                    </Col>
                    <Col sm=6>
                        <ExampleBox actions={@props.actions} title="Course Management" index={1}>
                            SageMathCloud helps to you to <strong>conveniently organize a course</strong>: add students, create their projects, see their progress, understand their problems by dropping right into their files from wherever you are, handout assignments, collect their worksheets and grade them. <a href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/">Read more here</a>
                        </ExampleBox>
                    </Col>
                </Row>
                <br />
                <Row>
                    <Col sm=6>
                      <ExampleBox actions={@props.actions} title="LaTeX Editor" index={2}>
                            SageMathCloud supports authoring documents written in LaTeX, Markdown or HTML.  The <strong>real-time preview</strong> helps you understanding what&#39;s going on. The LaTeX editor also supports <strong>forward/inverse searches</strong> to avoid getting lost in large documents.
                        </ExampleBox>
                    </Col>
                    <Col sm=6>
                        <ExampleBox actions={@props.actions} title="The sky is the limit" index={3}>
                            SageMathCloud does not restrict you in any way. <strong>Upload</strong> your own files, process them or <strong>generate</strong> data and results online. Then download or <strong>publish</strong> the generated documents. Besides SageWorksheets and Jupyter Notebooks, you can work with a <strong>full Linux terminal</strong> or a text editor.
                        </ExampleBox>
                    </Col>
                </Row>
            </Well>
        </div>

ExampleBox = rclass
    displayName : "ExampleBox"

    propTypes :
        actions : rtypes.object.isRequired
        title : rtypes.string.isRequired
        index : rtypes.number.isRequired

    render : ->
        <div>
            <h3>{@props.title}</h3>
            <div>
                <img alt={@props.title} src="#{images[@props.index]}" style={height: "236px"} />
            </div>
            <br />
            {@props.children}
        </div>

LandingPageFooter = rclass
    displayName : "LandingPageFooter"

    render: ->
        console.log("rendering")
        <div style={textAlign: "center", fontSize: "small", padding: 2*UNIT + "px"}>
        SageMath, Inc. &mdash; address &mdash;
            <a href="mailto:office@sagemath.com">office@sagemath.com</a>
        </div>

LandingPage = ({actions, strategies, sign_up_error, forgot_password_error, forgot_password_success, show_forgot_password, token, reset_key}) ->
    <div style={marginLeft: 20, marginRight: 20}>
        {<ForgotPassword actions={actions} forgot_password_error={forgot_password_error} forgot_password_success={forgot_password_success} /> if show_forgot_password}
        <Row>
            <Col xs=12>
                <SignIn actions={actions} />
            </Col>
        </Row>
        <Row>
            <Col sm=7>
                <LandingPageContent />
            </Col>
            <Col sm=5>
                <SignUp actions={actions} sign_up_error={sign_up_error} strategies={["google", "facebook", "twitter", "github"]} token={false} />
            </Col>
        </Row>
        <br />
        <SagePreview actions={actions} />
        <LandingPageFooter />
    </div>

LandingPageFlux = rclass
    render : ->
        actions = flux.getActions('account')
        reset_key = reset_password_key()
        <FluxComponent flux={flux} connectToStores={'account'}>
            <LandingPage actions={actions} reset_key={reset_key} />
        </FluxComponent>

is_mounted = false
exports.mount = ->
    if not is_mounted
        ReactDOM.render(<LandingPageFlux />, document.getElementById('smc-react-landing'))
        is_mounted = true

exports.unmount = ->
    if is_mounted
        ReactDOM.unmountComponentAtNode(document.getElementById('smc-react-landing'))
        is_mounted = false