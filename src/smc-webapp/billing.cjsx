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
{FAQ} = require("./billing/faq")
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


SubscriptionGrid = require("./billing/subscription-grid")

ExplainResources = require('./billing/explain-resources')

ExplainPlan = require('./billing/explain-plan')

DedicatedVM = require('./billing/dedicated-vm')

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
                <PaymentMethods sources={@props.customer?.sources} default={@props.customer?.default_source}  />
                <AddSubscription
                    hide_cancel_button = {true}
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
        <SubscriptionGrid periods={['month', 'year']} is_static={true}/>
        <hr/>
        <ExplainPlan type='course'/>
        <SubscriptionGrid periods={['week','month4','year1']} is_static={true}/>
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