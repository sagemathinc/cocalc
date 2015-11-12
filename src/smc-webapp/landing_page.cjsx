{rclass, FluxComponent, React, ReactDOM, flux, rtypes} = require('./r')
{Button, ButtonToolbar, Col, Row, Input, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading} = require('./r_misc')
misc = require('smc-util/misc')

UNIT = 15

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
        console.log(@props.sign_up_error)
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
        </Well>

SignIn = rclass
    displayName : "SignIn"

    propTypes :
        actions : rtypes.object.isRequired
        style: rtypes.object

    sign_in : (e) ->
        e.preventDefault()
        @props.actions.sign_in(@refs.email.getValue(), @refs.password.getValue())

    render : ->
        <Row style={@props.style}>
            <Col xs=5>
                <img src="http://sagemath.com/images/smc-logo.png" />
            </Col>
            <Col xs=7>
                <form onSubmit={@sign_in} className='form-inline pull-right'>
                    <Input style={marginRight : 20} ref='email' bsSize="small" type='email' placeholder='Email address' />
                    <Input style={marginRight : 20} ref='password' bsSize="small" type='password' placeholder='Password' />
                    <Button type="submit" bsSize="medium" >Sign in</Button>
                </form>
            </Col>
        </Row>

MarketingBla = rclass
    displayName: "MarketingBla"

    propTypes:
        icon: rtypes.object.isRequired
        heading: rtypes.object.isRequired
        text: rtypes.object.isRequired

    render : ->
        <Row>
            <Col sm=2>
                <h1 style={textAlign: "center"}><Icon name={@props.icon} /></h1>
            </Col>
            <Col sm=10>
                <h2>{@props.heading}</h2>
                {@props.text}
            </Col>
        </Row>

LandingPageContent = rclass
    render : ->
        <div style={backgroundColor: "red", color: "white", height: 500}>
        <MarketingBla icon="weixin"
                      heading="Collaboration made easy"
                      text="Why?" />
        <MarketingBla icon="fa-area-chart"
                      heading="Large Scale Computations"
                      text="SageMath, IPython &amp; the entire scientific Python stack, R, Julia, GAP, Octave and much more" />
        <MarketingBla icon="fa-university"
                      heading="Teaching Classes in Courses"
                      text="Manage projects for students, hand out assignment, collect and grade them with ease" />
        <MarketingBla icon="fa-repeat"
                      heading="Snapshots and logging"
                      text="All your work is periodically saved and backed up. Always know what is going on." />
        </div>

LandingPageFold = rclass
    render : ->
        <div style={textAlign: "center", margin: UNIT}>Confused? Use your HID to scroll down, look at the pix and read the text.</div>

LandingPageBottom = rclass
    render : ->
        <Row>
            <Col sm=12>
                <div style={backgroundColor: "green", color:"white"}>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                so cool <br/>
                </div>
            </Col>
        </Row>

LandingPageFooter = rclass
    render: ->
        <div style={textAlign: "center", fontSize: "small", padding: 2*UNIT + "px"}>
        SageMath, Inc. &mdash; address &mdash;
            <a href="mailto:office@sagemath.com">office@sagemath.com</a>
        </div>

NeedHelp = rclass
    render: ->
        <div style={textAlign: "center"}>
            Email <a href="mailto:office@sagemath.com">office@sagemath.com</a> if you need help.
        </div>

LandingPage = rclass
    displayName : "LandingPage"

    propTypes :
        actions : rtypes.object.isRequired
        strategies : rtypes.array
        sign_up_error : rtypes.string
        token: rtypes.bool

    render : ->
        <div>
            <Row>
                <Col xs=12>
                    <SignIn actions={@props.actions} style={marginBottom: 2*UNIT}/>
                </Col>
            </Row>
            <Row>
                <Col sm=7>
                    <LandingPageContent />
                </Col>
                <Col sm=5>
                    <SignUp actions={@props.actions} sign_up_error={@props.sign_up_error} strategies={["google", "facebook", "twitter", "github"]} token={false} />
                    <NeedHelp />
                </Col>
            </Row>
            <LandingPageFold />
            <LandingPageBottom />
            <LandingPageFooter />
        </div>

render = () ->
    actions = flux.getActions('account')
    <FluxComponent flux={flux} connectToStores={'account'}>
        <LandingPage actions={actions} />
    </FluxComponent>

ReactDOM.render(render(), document.getElementById('smc-react-landing'))