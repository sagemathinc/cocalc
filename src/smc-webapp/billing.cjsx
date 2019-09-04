##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

$             = window.$
async         = require('async')
misc          = require('smc-util/misc')
_             = require('underscore')

{redux, rclass, React, ReactDOM, rtypes, Actions, Store}  = require('./app-framework')

# The billing actions and store:
require('./billing/actions')
{STATES, COUNTRIES} = require('./billing/data')
{ FAQ} = require("./billing/faq")
{AddPaymentMethod} = require('./billing/add-payment-method')
{PaymentMethod} = require('./billing/payment-method')
{PaymentMethods} = require('./billing/payment-methods')
{PlanInfo} = require('./billing/plan-info')
{powered_by_stripe} = require("./billing/util")
{ProjectQuotaBoundsTable} = require("./billing/project-quota-bounds-table")
{ProjectQuotaFreeTable} = require("./billing/project-quota-free-table")
{ConfirmPaymentMethod} = require("./billing/confirm-payment-method")
{Subscription} = require("./billing/subscription")
{SubscriptionList} = require("./billing/subscription-list")
{AddSubscription} = require('./billing/add-subscription')
if window.location?
    # things that we won't use when doing backend rendering
    # (this will go away when billing.cjsx is totally typescript'd)
    {InvoiceHistory} = require('./billing/invoice-history')

{Button, ButtonToolbar, FormControl, FormGroup, Row, Col, Accordion, Panel, Well, Alert, ButtonGroup, InputGroup} = require('react-bootstrap')
{ActivityDisplay, CloseX, ErrorDisplay, Icon, Loading, SelectorInput, r_join, SkinnyError, Space, TimeAgo, Tip, Footer} = require('./r_misc')
{HelpEmailLink, SiteName, PolicyPricingPageUrl, PolicyPrivacyPageUrl, PolicyCopyrightPageUrl} = require('./customize')

{PROJECT_UPGRADES} = require('smc-util/schema')

STUDENT_COURSE_PRICE = require('smc-util/upgrade-spec').upgrades.subscription.student_course.price.month4

exports.CouponAdder = CouponAdder = rclass
    displayName : 'CouponAdder'

    propTypes:
        applied_coupons : rtypes.immutable.Map
        coupon_error    : rtypes.string

    getInitialState: ->
        coupon_id : ''

    # Remove typed coupon if it got successfully added to the list
    componentWillReceiveProps: (next_props) ->
        if next_props.applied_coupons.has(@state.coupon_id)
            @setState(coupon_id : '')

    key_down: (e) ->
        if e.keyCode == 13
            @submit()

    submit: (e) ->
        e?.preventDefault()
        @actions('billing').apply_coupon(@state.coupon_id) if @state.coupon_id

    render_well_header: ->
        if @props.applied_coupons?.size > 0
            <h5 style={color:'green'}><Icon name='check' /> Coupon added!</h5>
        else
            <h5 style={color:'#666'}><Icon name='plus' /> Add a coupon?</h5>

    render: ->

        # TODO: (Here or elsewhere) Your final cost is:
        #       $2 for the first month
        #       $7/mo after the first
        if @props.applied_coupons?.size > 0
            placeholder_text = 'Enter another code?'
        else
            placeholder_text = 'Enter your code here...'

        if @state.coupon_id == ''
            bsStyle = undefined
        else
            bsStyle = 'primary'

        <Well>
            {@render_well_header()}
            {<CouponList applied_coupons={@props.applied_coupons} /> if @props.applied_coupons?.size > 0}
            {<FormGroup style={marginTop:'5px'}>
                <InputGroup>
                    <FormControl
                        value       = {@state.coupon_id}
                        ref         = 'coupon_adder'
                        type        = 'text'
                        size        = '7'
                        placeholder = {placeholder_text}
                        onChange    = {(e) => @setState(coupon_id : e.target.value)}
                        onKeyDown   = {@key_down}
                        onBlur      = {@submit}
                    />
                    <InputGroup.Button>
                        <Button onClick={@submit} disabled={@state.coupon_id == ''} bsStyle={bsStyle} >
                            Apply
                        </Button>
                    </InputGroup.Button>
                </InputGroup>
            </FormGroup> if @props.applied_coupons?.size == 0}
            {<SkinnyError error_text={@props.coupon_error} on_close={@actions('billing').clear_coupon_error} /> if @props.coupon_error}
        </Well>

CouponList = rclass
    displayName : 'CouponList'

    propTypes:
        applied_coupons : rtypes.immutable.Map

    render: ->
        # TODO: Support multiple coupons
        coupon = @props.applied_coupons.first()
        <CouponInfo coupon={coupon}/>

CouponInfo = rclass
    displayName : 'CouponInfo'

    propTypes:
        coupon : rtypes.object

    render: ->
        console.log("coupon = ", @props.coupon)
        <Row>
            <Col md={4}>
                {@props.coupon.id}
            </Col>
            <Col md={8}>
                {@props.coupon.metadata.description}
                <CloseX on_close={=>@actions('billing').remove_coupon(@props.coupon.id)} />
            </Col>
        </Row>


exports.SubscriptionGrid = SubscriptionGrid = rclass
    displayName : 'SubscriptionGrid'

    propTypes :
        period        : rtypes.string.isRequired  # see docs for PlanInfo
        selected_plan : rtypes.string
        is_static     : rtypes.bool    # used for display mode

    getDefaultProps: ->
        is_static : false

    is_selected: (plan, period) ->
        if @props.period?.slice(0, 4) is 'year'
            return @props.selected_plan is "#{plan}-year"
        else if @props.period?.slice(0, 4) is 'week'
            return @props.selected_plan is "#{plan}-week"
        else
            return @props.selected_plan is plan

    render_plan_info: (plan, period) ->
        <PlanInfo
            plan     = {plan}
            period   = {period}
            selected = {@is_selected(plan, period)}
            on_click = {if not @props.is_static then ->set_selected_plan(plan, period)} />

    render_cols: (row, ncols) ->
        width = 12/ncols
        for plan in row
            <Col sm={width} key={plan}>
                {@render_plan_info(plan, @props.period)}
            </Col>

    render_rows: (live_subscriptions, ncols) ->
        for i, row of live_subscriptions
            <Row key={i}>
                {@render_cols(row, ncols)}
            </Row>

    render: ->
        live_subscriptions = []
        periods = misc.split(@props.period)
        for row in PROJECT_UPGRADES.live_subscriptions
            v = []
            for x in row
                price_keys = _.keys(PROJECT_UPGRADES.subscription[x].price)
                if _.intersection(periods, price_keys).length > 0
                    v.push(x)
            if v.length > 0
                live_subscriptions.push(v)
        # Compute the maximum number of columns in any row
        ncols = Math.max((row.length for row in live_subscriptions)...)
        # Round up to nearest divisor of 12
        if ncols == 5
            ncols = 6
        else if ncols >= 7
            ncols = 12
        <div>
            {@render_rows(live_subscriptions, ncols)}
        </div>


exports.ExplainResources = ExplainResources = rclass
    propTypes :
        type : rtypes.string.isRequired    # 'shared', 'dedicated'
        is_static : rtypes.bool

    getDefaultProps: ->
        is_static : false

    render_toc: ->
        return if not @props.is_static
        <React.Fragment>
            <h4>Table of content</h4>
            <ul>
                <li><b><a href="#subscriptions">Personal subscriptions</a></b>:{' '}
                    upgrade your projects
                </li>
                <li><b><a href="#courses">Course packages</a></b>:{' '}
                    upgrade student projects for teaching a course
                </li>
                <li><b><a href="#dedicated">Dedicated VMs</a></b>:{' '}
                    a node in the cluster for large workloads
                </li>
                <li><b><a href="#faq">FAQ</a></b>: frequently asked questions</li>
            </ul>
            <Space/>
        </React.Fragment>

    render_shared: ->
        <div>
            <Row>
                <Col md={8} sm={12}>
                    <h4>Questions</h4>
                    <div style={fontSize:'12pt'}>
                        Please immediately email us at <HelpEmailLink/>,{' '}
                        {if not @props.is_static then <span> click the Help button above or read our <a target='_blank' href="#{PolicyPricingPageUrl}#faq" rel="noopener">pricing FAQ</a> </span>}
                        if anything is unclear to you, or you just have a quick question and do not want to wade through all the text below.
                    </div>
                    <Space/>

                    {@render_toc()}

                    <a name="projects"></a>
                    <h4>Projects</h4>
                    <div>
                    Your work on <SiteName/> happens inside <em>projects</em>.
                    You may create any number of independent projects.
                    They form your personal workspaces,
                    where you privately store your files, computational worksheets, and data.
                    You typically run computations through a web browser,
                    either via a worksheet, notebook, or by executing a program in a terminal
                    (you can also ssh into any project).
                    You can also invite collaborators to work with you inside a project,
                    and you can explicitly make files or directories publicly available
                    to everybody.
                    </div>
                    <Space/>

                    <h4>Shared Resources</h4>
                    <div>
                    Each project runs on a server, where it shares disk space, CPU, and RAM with other projects.
                    Initially, projects run with default quotas on heavily used machines that are rebooted frequently.
                    You can upgrade any quota on any project on which you collaborate, and you can move projects
                    to faster very stable <em>members-only computers</em>,
                    where there is much less competition for resources.
                    </div>
                    <Space/>

                    <h4>Quota upgrades</h4>
                    <div>
                    By purchasing one or more of our subscriptions,
                    you receive a certain amount of <em>quota upgrades</em>.
                    <ul style={paddingLeft:"20px"}>
                    <li>You can upgrade the quotas on any of your projects
                        up to the total amount given by your subscription(s)
                        and the upper limits per project.
                    </li>
                    <li>Project collaborators can collectively contribute to the same project,
                        in order to increase the quotas of their common project
                        &mdash; these contributions add together to benefit all project collaborators equally.</li>
                    <li>You can remove your contributions to any project at any time.</li>
                    <li>You may also purchase multiple plans more than once,
                        in order to increase the total amount of upgrades available to you.</li>
                    </ul>
                    </div>
                    <Space/>

                </Col>
                <Col md={4} sm={12}>
                    <Row>
                        <Col md={12} sm={6}>
                            <ProjectQuotaFreeTable/>
                        </Col>
                        <Col md={12} sm={6}>
                            <ProjectQuotaBoundsTable/>
                        </Col>
                    </Row>
                </Col>
            </Row>
        </div>

    render_dedicated: ->
        <div>
            <h4>Dedicated resources</h4>
            You may also rent dedicated computers.
            Projects on such a machine of your choice get full use of the hard disk, CPU and RAM,
            and do <em>not</em> have to compete with other users for resources.
            We have not fully automated purchase of dedicated computers yet,
            so please contact us at <HelpEmailLink/> if you need a dedicated machine.
        </div>

    render: ->
        switch @props.type
            when 'shared'
                return @render_shared()
            when 'dedicated'
                return @render_dedicated()
            else
                throw Error("unknown type #{@props.type}")

exports.ExplainPlan = ExplainPlan = rclass
    propTypes :
        type : rtypes.string.isRequired    # 'personal', 'course'

    render_personal: ->
        <div style={marginBottom:"10px"}>
            <a name="subscriptions"></a>
            <h3>Personal subscriptions</h3>
            <div>
                We offer several subscriptions that let you upgrade the default free quotas on projects.
                You can distribute these upgrades to your own projects or any projects where you are a collaborator &mdash;
                everyone participating in such a collective project benefits and can easily change their allocations at any time!
                You can get higher-quality hosting on members-only machines and enable access to the internet from projects.
                You can also increase quotas for CPU and RAM, so that you can work on larger problems and
                do more computations simultaneously.
            </div>
            <br/>
            <div>
                For highly intensive workloads you can also get a <a href="#dedicated">Dedicated VM</a>.
            </div>
            <br/>
        </div>

    render_course: ->
        <div style={marginBottom:"10px"}>
            <a name="courses"></a>
            <h3>Course packages</h3>
            <div>
                <p>
                We offer course packages to support teaching using <SiteName/>.
                They start right after purchase and last for the indicated period and do <b>not auto-renew</b>.
                Follow the <a href="https://doc.cocalc.com/teaching-instructors.html" target="_blank" rel="noopener">instructor guide</a> to create a course file for your new course.
                Each time you add a student to your course, a project will be automatically created for that student.
                You can create and distribute assignments,
                students work on assignments inside their project (where you can see their progress
                in realtime and answer their questions),
                and you later collect and grade their assignments, then return them.
                </p>

                <p>
                Payment is required. This will ensure that your students have a better
                experience, network access, and receive priority support.  The cost
                is <b>between $4 and ${STUDENT_COURSE_PRICE} per student</b>, depending on class size and whether
                you or your students pay.  <b>Start right now:</b> <i>you can fully set up your class
                and add students immediately before you pay us anything!</i>

                </p>

                <h4>You or your institution pays</h4>
                You or your institution may pay for one of the course plans.
                You then use your plan to upgrade all projects in the course in the settings tab of the course file.

                <h4>Students pay</h4>
                In the settings tab of your course, you require that all students
                pay a one-time ${STUDENT_COURSE_PRICE} fee to move their
                projects to members only hosts and enable full internet access.

                <br/>

                <h4>Basic or Standard?</h4>
                Our basic plans work well for cases where you are only doing
                small computations or just need internet access and better hosting uptime.

                However, we find that many data science and computational science courses
                run much smoother with the additional RAM and CPU found in the standard plan.

                <h4>Custom Course Plans</h4>
                In addition to the plans listed on this page, we can offer the following on a custom basis:
                    <ul>
                        <li>start on a specified date after payment</li>
                        <li>customized duration</li>
                        <li>customized number of students</li>
                        <li>bundle several courses with different start dates</li>
                        <li>transfer upgrades from purchasing account to course administrator account</li>
                    </ul>
                To learn more about these options, email us at <HelpEmailLink/> with a description
                of your specific requirements.
                <br/>

                <br/>

            </div>
        </div>

    render: ->
        switch @props.type
            when 'personal'
                return @render_personal()
            when 'course'
                return @render_course()
            else
                throw Error("unknown plan type #{@props.type}")


exports.DedicatedVM = DedicatedVM = rclass
    render_intro: ->
        <div style={marginBottom:"10px"}>
            <a name="dedicated"></a>
            <h3>Dedicated VMs<sup><i>beta</i></sup></h3>
            <div style={marginBottom:"10px"}>
                A <b>Dedicated VM</b> is a specific node in the cluster,{' '}
                which solely hosts one or more of your projects.
                This allows you to run much larger workloads with a consistent performance,{' '}
                because no resources are shared with other projects.
                The usual quota limitations do not apply and
                you also get additional disk space attached to individual projects.
            </div>
            <div>
                To get started, please contact us at <HelpEmailLink/>.
                We will work out the actual requirements with you and set everything up.
                It is also possible to deviate from the given options,{' '}
                in order to accommodate exactly for the expected resource usage.
            </div>
        </div>

    render_dedicated_plans: ->
        for i, plan of PROJECT_UPGRADES.dedicated_vms
            <Col key={i} sm={4}>
                <PlanInfo
                    plan = {plan}
                    period = {'month'}
                />
            </Col>

    render_dedicated: ->
        <div style={marginBottom:"10px"}>

            <Row>
                {@render_dedicated_plans()}
            </Row>
        </div>

    render: ->
        <React.Fragment>
            {@render_intro()}
            {@render_dedicated()}
        </React.Fragment>



exports.PayCourseFee = PayCourseFee = rclass
    reduxProps :
        billing :
            applied_coupons : rtypes.immutable.Map
            coupon_error    : rtypes.string

    propTypes :
        project_id : rtypes.string.isRequired
        redux      : rtypes.object.isRequired

    getInitialState: ->
        confirm : false

    buy_subscription: ->
        if @props.redux.getStore('billing').get('course_pay').has(@props.project_id)
            # already buying.
            return
        actions = @props.redux.getActions('billing')
        # Set semething in billing store that says currently doing
        actions.set_is_paying_for_course(this.props.project_id, true)
        # Purchase 1 course subscription
        try
            await actions.create_subscription('student_course')
        catch err
            actions.set_is_paying_for_course(this.props.project_id, false)
            return
        # Wait until a members-only upgrade and network upgrade are available, due to buying it
        @setState(confirm:false)
        @props.redux.getStore('account').wait
            until   : (store) =>
                upgrades = store.get_total_upgrades()
                # NOTE! If you make one available due to changing what is allocated it won't cause this function
                # we're in here to update, since we *ONLY* listen to changes on the account store.
                applied = @props.redux.getStore('projects').get_total_upgrades_you_have_applied()
                return (upgrades.member_host ? 0) - (applied?.member_host ? 0) > 0 and (upgrades.network ? 0) - (applied?.network ? 0) > 0
            timeout : 30  # wait up to 30 seconds
            cb      : (err) =>
                if err
                    actions.setState(error:"Error purchasing course subscription: #{err}")
                else
                    # Upgrades now available -- apply a network and members only upgrades to the course project.
                    upgrades = {member_host: 1, network: 1}
                    @props.redux.getActions('projects').apply_upgrades_to_project(@props.project_id, upgrades)
                # Set in billing that done
                actions.set_is_paying_for_course(this.props.project_id, false);

    render_buy_button: ->
        if @props.redux.getStore('billing').get('course_pay').has(@props.project_id)
            <Button bsStyle='primary' disabled={true}>
                <Icon name="cc-icon-cocalc-ring" spin /> Currently paying the one-time ${STUDENT_COURSE_PRICE} fee for this course...
            </Button>
        else
            <Button onClick={=>@setState(confirm:true)} disabled={@state.confirm} bsStyle='primary'>
                Pay the one-time ${STUDENT_COURSE_PRICE} fee for this course...
            </Button>

    render_confirm_button: ->
        if @state.confirm
            if @props.redux.getStore('account').get_total_upgrades().network > 0
                network = " and full internet access enabled"
            <Well style={marginTop:'1em'}>
                You will be charged a one-time ${STUDENT_COURSE_PRICE} fee to move your project to a
                members-only server and enable full internet access.
                <br/><br/>
                <ButtonToolbar>
                    <Button onClick={@buy_subscription} bsStyle='primary'>
                        Pay ${STUDENT_COURSE_PRICE} Fee
                    </Button>
                    <Button onClick={=>@setState(confirm:false)}>Cancel</Button>
                </ButtonToolbar>
            </Well>

    render: ->
        <span>
            <Row>
                <Col sm={5}>
                    <CouponAdder applied_coupons={@props.applied_coupons} coupon_error={@props.coupon_error} />
                </Col>
            </Row>
            {@render_buy_button()}
            {@render_confirm_button()}
        </span>

MoveCourse = rclass
    propTypes :
        project_id : rtypes.string.isRequired
        redux      : rtypes.object.isRequired

    getInitialState: ->
        confirm : false

    upgrade: ->
        available = @props.redux.getStore('account').get_total_upgrades()
        upgrades = {member_host: 1}
        if available.network > 0
            upgrades.network = 1
        @props.redux.getActions('projects').apply_upgrades_to_project(@props.project_id, upgrades)
        @setState(confirm:false)

    render_move_button: ->
        <Button onClick={=>@setState(confirm:true)} bsStyle='primary' disabled={@state.confirm}>
            Move this project to a members only server...
        </Button>

    render_confirm_button: ->
        if @state.confirm
            if @props.redux.getStore('account').get_total_upgrades().network > 0
                network = " and full internet access enabled"
            <Well style={marginTop:'1em'}>
                Your project will be moved to a members only server{network} using
                upgrades included in your current subscription (no additional charge).
                <br/><br/>
                <ButtonToolbar>
                    <Button onClick={@upgrade} bsStyle='primary'>
                        Move Project
                    </Button>
                    <Button onClick={=>@setState(confirm:false)}>Cancel</Button>
                </ButtonToolbar>
            </Well>

    render: ->
        <span>
            {@render_move_button()}
            {@render_confirm_button()}
        </span>

BillingPage = rclass
    displayName : 'BillingPage'

    reduxProps :
        billing :
            customer        : rtypes.object
            invoices        : rtypes.object
            error           : rtypes.oneOfType([rtypes.string, rtypes.object])
            action          : rtypes.string
            loaded          : rtypes.bool
            no_stripe       : rtypes.bool     # if true, stripe definitely isn't configured on the server
            selected_plan   : rtypes.string
            applied_coupons : rtypes.immutable.Map
            coupon_error    : rtypes.string
            continue_first_purchase: rtypes.bool
        projects :
            project_map : rtypes.immutable # used, e.g., for course project payments; also computing available upgrades
        account :
            stripe_customer : rtypes.immutable  # to get total upgrades user has available

    propTypes :
        redux         : rtypes.object
        is_simplified : rtypes.bool
        for_course    : rtypes.bool

    render_action: ->
        if @props.action
            <ActivityDisplay style={position:'fixed', right:'45px', top:'85px'} activity ={[@props.action]} on_clear={=>@props.redux.getActions('billing').clear_action()} />

    render_error: ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                onClose = {=>@props.redux.getActions('billing').clear_error()} />

    # the space in "Contact us" below is a Unicode no-break space, UTF-8: C2 A0. "&nbsp;" didn't work there [hal]
    render_help_suggestion: ->
        <span>
            <Space/> If you have any questions at all, read the{' '}
            <a
                href={"https://doc.cocalc.com/billing.html"}
                target={"_blank"}
                rel={"noopener"}
            >Billing{"/"}Upgrades FAQ</a> or {' '}
            email <HelpEmailLink /> immediately.
            <b>
                <Space/>
                <HelpEmailLink text={"Contact us"} />{' '}
                if you are considering purchasing a course subscription and need a short trial
                to test things out first.
                <Space/>
            </b>
            <b>
                <Space/> Customized course plans are available.<Space/>
            </b>
            If you do not see a plan that fits your needs,
            email <HelpEmailLink/> with a description of your specific requirements.
        </span>

    render_suggested_next_step: ->
        cards    = @props.customer?.sources?.total_count ? 0
        subs     = @props.customer?.subscriptions?.total_count ? 0
        invoices = @props.invoices?.data?.length ? 0
        help     = @render_help_suggestion()

        if cards == 0
            if subs == 0
                # no payment sources yet; no subscriptions either: a new user (probably)
                <span>
                    If you are {' '}
                    <a
                      href={"https://doc.cocalc.com/teaching-instructors.html"}
                      target={"_blank"}
                      rel={"noopener"}
                    >teaching a course</a>, choose one of the course packages.
                    If you need to upgrade your personal projects, choose a recurring subscription.
                    You will <b>not be charged</b> until you explicitly click
                    "Add Subscription or Course Package".
                    {help}
                </span>
            else
                # subscriptions but they deleted their card.
                <span>
                    Click "Add Payment Method..." to add a credit card so you can
                    purchase or renew your subscriptions.  Without a credit card
                    any current subscriptions will run to completion, but will not renew.
                    If you have any questions about subscriptions or billing (e.g., about
                    using PayPal or wire transfers for non-recurring subscriptions above $50,
                    please email <HelpEmailLink /> immediately.
                </span>

        else if subs == 0
            # have a payment source, but no subscriptions
            <span>
                Click "Add Subscription or Course Package...".
                If you are{' '}
                <a
                  href={"https://doc.cocalc.com/teaching-instructors.html"}
                  target={"_blank"}
                  rel={"noopener"}
                >teaching a course</a>, choose one of the course packages.
                If you need to upgrade your personal projects, choose a recurring subscription.
                You will be charged only after you select a specific subscription and click
                "Add Subscription or Course Package".
                {help}
            </span>
        else if invoices == 0
            # have payment source, subscription, but no invoices yet
            <span>
                Sign up for the same subscription package more than
                once to increase the number of upgrades that you can use.
                {help}
            </span>
        else
            # have payment source, subscription, and at least one invoice
            <span>
                You may sign up for the same subscription package more than
                once to increase the number of upgrades that you can use.
                Past invoices and receipts are available below.
                {help}
            </span>

    render_info_link: ->
        <div style={marginTop:'1em', marginBottom:'1em', color:"#666"}>
            We offer many <a href={PolicyPricingPageUrl} target='_blank' rel="noopener"> pricing and subscription options</a>.
            <Space/>
            {@render_suggested_next_step()}
        </div>

    get_panel_header: (icon, header) ->
        <div style={cursor:'pointer'} >
            <Icon name={icon} fixedWidth /> {header}
        </div>

    render_subscriptions: ->
        <SubscriptionList
            customer = {@props.customer}
            applied_coupons = {@props.applied_coupons}
            coupon_error    = {@props.coupon_error}
            selected_plan   = {@props.selected_plan}
            redux           = {@props.redux} />

    finish_first_subscription: ->
        set_selected_plan('')
        @actions('billing').remove_all_coupons();
        @actions('billing').setState({continue_first_purchase: false})

    render_page: ->
        cards    = @props.customer?.sources?.total_count ? 0
        subs     = @props.customer?.subscriptions?.total_count ? 0
        if not @props.loaded
            # nothing loaded yet from backend
            <Loading />
        else if not @props.customer? and @props.for_course
            # user not initialized yet -- only thing to do is add a card.
            <div>
                <PaymentMethods sources={data:[]} default='' />
            </div>
        else if not @props.for_course and (not @props.customer? or @props.continue_first_purchase)
            <div>
                <AddSubscription
                    on_close        = {@finish_first_subscription}
                    selected_plan   = {@props.selected_plan}
                    applied_coupons = {@props.applied_coupons}
                    coupon_error    = {@props.coupon_error}
                    customer        = {@props.customer} />
            </div>
        else
            # data loaded and customer exists
            if @props.is_simplified and subs > 0
                <div>
                    <PaymentMethods sources={@props.customer.sources} default={@props.customer.default_source} />
                    {<Panel header={@get_panel_header('list-alt', 'Subscriptions and Course Packages')} eventKey='2'>
                        {@render_subscriptions()}
                    </Panel> if not @props.for_course}
                </div>
            else if @props.is_simplified
                <div>
                    <PaymentMethods sources={@props.customer.sources} default={@props.customer.default_source} />
                    {@render_subscriptions() if not @props.for_course}
                </div>
            else
                <div>
                    <PaymentMethods sources={@props.customer.sources} default={@props.customer.default_source} />
                    {@render_subscriptions() if not @props.for_course}
                    <InvoiceHistory invoices={@props.invoices} />
                </div>

    render: ->
        <div>
            <div>
                {@render_info_link() if not @props.for_course}
                {@render_action() if not @props.no_stripe}
                {@render_error()}
                {@render_page() if not @props.no_stripe}
            </div>
            {<Footer/> if not @props.is_simplified}
        </div>

exports.BillingPageRedux = rclass
    displayName : 'BillingPage-redux'

    render: ->
        <BillingPage is_simplified={false} redux={redux} />

exports.BillingPageSimplifiedRedux = rclass
    displayName : 'BillingPage-redux'

    render: ->
        <BillingPage is_simplified={true} redux={redux} />

exports.BillingPageForCourseRedux = rclass
    displayName : 'BillingPage-redux'

    render: ->
        <BillingPage is_simplified={true} for_course={true} redux={redux} />

render_amount = (amount, currency) ->
    <div style={float:'right'}>{misc.stripe_amount(amount, currency)}</div>

brand_to_icon = (brand) ->
    return if brand in ['discover', 'mastercard', 'visa'] then "fab fa-cc-#{brand}" else "fa-credit-card"


set_selected_plan = (plan, period) ->
    redux.getActions('billing').set_selected_plan(plan, period)

exports.render_static_pricing_page = () ->
    <div>
        <ExplainResources type='shared' is_static={true}/>
        <hr/>
        <ExplainPlan type='personal'/>
        <SubscriptionGrid period='month year' is_static={true}/>
        <hr/>
        <ExplainPlan type='course'/>
        <SubscriptionGrid period='week month4 year1' is_static={true}/>
        <hr/>
        <DedicatedVM />
        <hr/>
        <FAQ/>
    </div>

exports.visit_billing_page = ->
    require('./history').load_target('settings/billing')

exports.BillingPageLink = (opts) ->
    {text} = opts
    if not text
        text = "billing page"
    return <a onClick={exports.visit_billing_page} style={cursor:'pointer'}>{text}</a>

plan_interval = (plan) ->
    n = plan.interval_count
    return "#{plan.interval_count} #{misc.plural(n, plan.interval)}"