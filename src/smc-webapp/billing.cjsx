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

exports.PayCourseFee = require('./billing/pay-course-fee').PayCourseFee

exports.BillingPage = BillingPage = require('./billing/billing-page').BillingPage

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