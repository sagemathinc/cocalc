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

{Button, ButtonToolbar, FormControl, FormGroup, Row, Col, Accordion, Panel, Well, Alert, ButtonGroup, InputGroup} = require('react-bootstrap')
{ActivityDisplay, CloseX, ErrorDisplay, Icon, Loading, SelectorInput, r_join, SkinnyError, Space, TimeAgo, Tip, Footer} = require('./r_misc')
{HelpEmailLink, SiteName, PolicyPricingPageUrl, PolicyPrivacyPageUrl, PolicyCopyrightPageUrl} = require('./customize')

{PROJECT_UPGRADES} = require('smc-util/schema')

STUDENT_COURSE_PRICE = require('smc-util/upgrade-spec').upgrades.subscription.student_course.price.month4

load_stripe = (cb) ->
    if Stripe?
        cb()
    else
        $.getScript("https://js.stripe.com/v2/").done(->cb()).fail(->cb('Unable to load Stripe support; make sure your browser is not blocking stripe.com.'))

last_subscription_attempt = null

actions = store = undefined
# Create the billing actions
class BillingActions extends Actions
    clear_error: =>
        @setState(error:'')

    update_customer: (cb) =>
        if @_update_customer_lock
            return
        @_update_customer_lock=true
        @setState(action:"Updating billing information")
        customer_is_defined = false
        {webapp_client} = require('./webapp_client')   # do not put at top level, since some code runs on server
        async.series([
            (cb) =>
                webapp_client.stripe_get_customer
                    cb : (err, resp) =>
                        @_update_customer_lock = false
                        if not err and not resp?.stripe_publishable_key?
                            err = "WARNING: Stripe is not configured -- billing not available"
                            @setState(no_stripe:true)
                        if not err
                            @setState
                                customer               : resp.customer
                                loaded                 : true
                                stripe_publishable_key : resp.stripe_publishable_key
                            customer_is_defined = resp.customer?
                        cb(err)
            (cb) =>
                if not customer_is_defined
                    cb()
                else
                    # only call get_invoices if the customer already exists in the system!
                    webapp_client.stripe_get_invoices
                        limit : 100  # FUTURE: -- this will change when we use webhooks and our own database of info.
                        cb: (err, invoices) =>
                            if not err
                                @setState(invoices: invoices)
                            cb(err)
        ], (err) =>
            @setState(error:err, action:'')
            cb?(err)
        )

    _action: (action, desc, opts) =>
        @setState(action: desc)
        cb = opts.cb
        opts.cb = (err, value) =>
            @setState(action:'')
            if action == 'get_coupon'
                cb(err, value)
            else if err
                @setState(error:JSON.stringify(err))
                cb?(err)
            else
                @update_customer(cb)
        {webapp_client} = require('./webapp_client')   # do not put at top level, since some code runs on server
        webapp_client["stripe_#{action}"](opts)

    clear_action: =>
        @setState(action:"", error:"")

    delete_payment_method: (id, cb) =>
        @_action('delete_source', 'Deleting a payment method', {card_id:id, cb:cb})

    set_as_default_payment_method: (id, cb) =>
        @_action('set_default_source', 'Setting payment method as default', {card_id:id, cb:cb})

    submit_payment_method: (info, cb) =>
        response = undefined
        async.series([
            (cb) =>
                if not store.get("stripe_publishable_key")?
                    @update_customer(cb)  # this defines stripe_publishable_key, or fails
                else
                    cb()
            (cb) =>
                load_stripe(cb)
            (cb) =>  # see https://stripe.com/docs/stripe.js#createToken
                @setState(action:"Creating a new payment method -- get token from Stripe")
                Stripe.setPublishableKey(store.get("stripe_publishable_key"))
                Stripe.card.createToken info, (status, _response) =>
                    if status != 200
                        cb(_response.error.message)
                    else
                        response = _response
                        cb()
            (cb) =>
                @_action('create_source', 'Creating a new payment method (sending token)', {token:response.id, cb:cb})
        ], (err) =>
            @setState(action:'', error:err)
            cb?(err)
        )

    cancel_subscription: (id, cb) =>
        @_action('cancel_subscription', 'Cancel a subscription', {subscription_id : id, cb : cb})

    create_subscription: (plan='standard') =>
        lsa = last_subscription_attempt
        if lsa? and lsa.plan == plan and lsa.timestamp > misc.server_minutes_ago(2)
            @setState(action:'', error: 'Too many subscription attempts in the last minute.  Please **REFRESH YOUR BROWSER** THEN  DOUBLE CHECK YOUR SUBSCRIPTION LIST!')
        else
            @setState(error: '')
            # TODO: Support multiple coupons.
            if store.get('applied_coupons').size > 0
                coupon = store.get('applied_coupons').first()
            opts =
                plan      : plan
                coupon_id : coupon?.id
            @_action('create_subscription', 'Create a subscription', opts)
            last_subscription_attempt = {timestamp:misc.server_time(), plan:plan}
            @track_subscription(plan)

    apply_coupon: (id) =>
        cb = (err, coupon) =>
            if err
                @setState(coupon_error: JSON.stringify(err))
            else
                applied_coupons = store.get('applied_coupons').set(coupon.id, coupon)
                @setState(applied_coupons : applied_coupons, coupon_error:'')

        opts =
            coupon_id : id
            cb        : cb
        @_action('get_coupon', "Applying coupon: #{id}", opts)

    clear_coupon_error: =>
        @setState(coupon_error : '')

    remove_all_coupons: =>
        @setState(applied_coupons : {}, coupon_error : '')

    remove_coupon: (id) =>
        @setState(applied_coupons : store.get('applied_coupons').delete(id))

    # conversion tracking (commercial only)
    track_subscription: (plan) =>
        usd = 7.00 # TODO derive this from the plan
        {track_conversion} = require('./misc_page')
        track_conversion('subscription', usd)

    # Cancel all subscriptions, remove credit cards, etc. -- this is not a normal action, and is used
    # only when deleting an account.  We allow it a callback.
    cancel_everything: (cb) =>
        async.series([
            (cb) =>
                # update info about this customer
                @update_customer(cb)
            (cb) =>
                # delete stuff
                async.parallel([
                    (cb) =>
                        # delete payment methods
                        ids = (x.id for x in redux.getStore('billing').getIn(['customer', 'sources', 'data'])?.toJS() ? [])
                        async.map(ids, @delete_payment_method, cb)
                    (cb) =>
                        # cancel subscriptions
                        ids = (x.id for x in redux.getStore('billing').getIn(['customer', 'subscriptions', 'data'])?.toJS() ? []   when not x.canceled_at)
                        async.map(ids, @cancel_subscription, cb)
                ], cb)
        ], cb)


store   = redux.createStore('billing', Store, {applied_coupons:{}})
actions = redux.createActions('billing', BillingActions)

validate =
    valid   : {border:'1px solid green'}
    invalid : {border:'1px solid red'}

powered_by_stripe = ->
    <span>
        Powered by <a href="https://stripe.com/" target="_blank" style={top: '7px', position: 'relative', fontSize: '23pt'}><Icon name='cc-stripe'/></a>
    </span>


AddPaymentMethod = rclass
    displayName : "AddPaymentMethod"

    propTypes :
        redux    : rtypes.object.isRequired
        on_close : rtypes.func.isRequired  # called when this should be closed

    getInitialState: ->
        new_payment_info :
            name            : @props.redux.getStore('account').get_fullname()
            number          : ""
            address_state   : ""
            address_country : ""
        submitting : false
        error      : ''
        cvc_help   : false

    submit_payment_method: ->
        @setState(error: false, submitting:true)
        if not redux.getStore('billing').get('customer')?
            @props.redux.getActions('billing').setState({continue_first_purchase: true})
        @props.redux.getActions('billing').submit_payment_method @state.new_payment_info, (err) =>
            @setState(error: err, submitting:false)
            if not err
                @props.on_close()

    render_payment_method_field: (field, control) ->
        if field == 'State' and @state.new_payment_info.address_country != "United States"
            return
        <Row key={field}>
            <Col sm={4}>
                {field}
            </Col>
            <Col sm={8}>
                {control}
            </Col>
        </Row>

    set_input_info: (field, ref, value) ->
        x = misc.copy(@state.new_payment_info)
        x[field] = value ? ReactDOM.findDOMNode(@refs[ref]).value
        @setState(new_payment_info: x)

    render_input_card_number: ->
        icon = brand_to_icon($.payment.cardType(@state.new_payment_info.number))
        value = if @valid('number') then $.payment.formatCardNumber(@state.new_payment_info.number) else @state.new_payment_info.number
        <FormGroup>
            <InputGroup>
                <FormControl
                    autoFocus
                    ref         = 'input_card_number'
                    style       = {@style('number')}
                    type        = 'text'
                    size        = '20'
                    placeholder = '1234 5678 9012 3456'
                    value       = {value}
                    onChange    = {=>@set_input_info('number','input_card_number')}
                    disabled    = {@state.submitting}
                />
                <InputGroup.Addon>
                    <Icon name={icon} />
                </InputGroup.Addon>
            </InputGroup>
        </FormGroup>

    render_input_cvc_input: ->
        <FormGroup>
            <FormControl
                ref         = 'input_cvc'
                style       = {misc.merge({width:'5em'}, @style('cvc'))}
                type        = 'text'
                size        = '4'
                placeholder = '···'
                onChange    = {=>@set_input_info('cvc', 'input_cvc')}
                disabled    = {@state.submitting}
            />
        </FormGroup>

    render_input_cvc_help: ->
        if @state.cvc_help
            <div>The <a href='https://en.wikipedia.org/wiki/Card_security_code' target='_blank'>security code</a> is
            located on the back of credit or debit cards and is a separate group of 3 (or 4) digits to the right of
            the signature strip. <a href='' onClick={(e)=>e.preventDefault();@setState(cvc_help:false)}>(hide)</a></div>
        else
            <a href='' onClick={(e)=>e.preventDefault();@setState(cvc_help:true)}>(what is the security code?)</a>

    render_input_cvc: ->
        <Row>
            <Col md={3}>{@render_input_cvc_input()}</Col>
            <Col md={9}>{@render_input_cvc_help()}</Col>
        </Row>

    valid: (name) ->
        info = @state.new_payment_info

        if not name?
            # check validity of all fields
            for name in ['number','exp_month','exp_year','cvc','name', 'address_country']
                if not @valid(name)
                    return false
            if info.address_country == 'United States'
                if not @valid('address_state') or not @valid('address_zip')
                    return false
            return true

        x = info[name]
        if not x
            return
        switch name
            when 'number'
                return $.payment.validateCardNumber(x)
            when 'exp_month'
                if x.length == 0
                    return
                month = parseInt(x)
                return month >= 1 and month <= 12
            when 'exp_year'
                if x.length == 0
                    return
                year = parseInt(x)
                return year >= 15 and year <= 50
            when 'cvc'
                return $.payment.validateCardCVC(x)
            when 'name'
                return x.length > 0
            when 'address_country'
                return x.length > 0
            when 'address_state'
                return x.length > 0
            when 'address_zip'
                return misc.is_valid_zipcode(x)

    style: (name) ->
        a = @valid(name)
        if not a?
            return {}
        else if a == true
            return validate.valid
        else
            return validate.invalid

    render_input_expiration: ->
        <div style={marginBottom:'15px', display:'flex'}>
            <FormGroup>
                <FormControl
                    readOnly    = {@state.submitting}
                    className   = 'form-control'
                    style       = {misc.merge({width:'5em'}, @style('exp_month'))}
                    placeholder = 'MM'
                    type        = 'text'
                    size        = '2'
                    onChange    = {(e)=>@set_input_info('exp_month', undefined, e.target.value)}
                />
            </FormGroup>
            <span style={fontSize:'22px', margin: '1px 5px'}> / </span>
            <FormGroup>
                <FormControl
                    readOnly    = {@state.submitting}
                    className   = 'form-control'
                    style       = {misc.merge({width:'5em'}, @style('exp_year'))}
                    placeholder = 'YY'
                    type        = 'text'
                    size        = '2'
                    onChange    = {(e)=>@set_input_info('exp_year', undefined, e.target.value)}
                />
            </FormGroup>
        </div>

    render_input_name: ->
        <FormGroup>
            <FormControl
                ref         = 'input_name'
                type        = 'text'
                placeholder = 'Name on Card'
                onChange    = {=>@set_input_info('name', 'input_name')}
                style       = {@style('name')}
                value       = {@state.new_payment_info.name}
                disabled    = {@state.submitting}
            />
        </FormGroup>

    render_input_country: ->
        <SelectorInput
            options   = {COUNTRIES}
            on_change = {(country)=>@set_input_info('address_country', '', country)}
            disabled  = {@state.submitting}
        />

    render_input_zip: ->
        <FormGroup>
            <FormControl
                ref         = 'input_address_zip'
                style       = {@style('address_zip')}
                placeholder = 'Zip Code'
                type        = 'text'
                size        = '5'
                pattern     = '\d{5,5}(-\d{4,4})?'
                onChange    = {=>@set_input_info('address_zip', 'input_address_zip')}
                disabled    = {@state.submitting}
            />
        </FormGroup>

    render_tax_notice: ->
        <Row>
            <Col sm={12}>
                <Alert bsStyle='info'>
                    <h4><Icon name='exclamation-triangle' /> Notice </h4>
                    <p>Sales tax is applied in the state of Washington</p>
                </Alert>
            </Col>
        </Row>

    render_input_state_zip: ->
        <div>
            <Row>
                <Col sm={7}>
                    <SelectorInput
                        options   = {STATES}
                        on_change = {(state)=>@set_input_info('address_state', '', state)}
                        disabled  = {@state.submitting}
                    />
                </Col>
                <Col sm={5}>
                    {@render_input_zip()}
                </Col>
            </Row>
            {@render_tax_notice() if @state.new_payment_info.address_state is 'WA'}
        </div>


    render_payment_method_fields: ->
        PAYMENT_METHOD_FORM =
            'Card Number'         : @render_input_card_number
            'Security Code (CVC)' : @render_input_cvc
            'Expiration (MM/YY)'  : @render_input_expiration
            'Name on Card'        : @render_input_name
            'Country'             : @render_input_country
            'State'               : @render_input_state_zip

        for field, control of PAYMENT_METHOD_FORM
            @render_payment_method_field(field, control())

    render_payment_method_buttons: ->
        <div>
            <Row>
                <Col sm={4}>
                    {powered_by_stripe()}
                </Col>
                <Col sm={8}>
                    <ButtonToolbar className='pull-right'>
                        <Button
                            onClick  = {@submit_payment_method}
                            bsStyle  = 'primary'
                            disabled = {not @valid() or @state.submitting}
                        >
                            Add Credit Card
                        </Button>
                        <Button onClick={@props.on_close}>Cancel</Button>
                    </ButtonToolbar>
                </Col>
            </Row>
            <div style={color:"#666", marginTop:'15px'}>
                (PayPal or wire transfers for non-recurring subscriptions above $50 are also possible. Please email <HelpEmailLink/>.)
            </div>
        </div>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render: ->
        <Row>
            <Col sm={6} smOffset={3}>
                <Well style={boxShadow:'5px 5px 5px lightgray', zIndex:2}>
                    {@render_error()}
                    {@render_payment_method_fields()}
                    {@render_payment_method_buttons()}
                </Well>
            </Col>
        </Row>


#address_city: nulladdress_country: "United States"address_line1: nulladdress_line1_check: nulladdress_line2: nulladdress_state: "WA"address_zip: "98122"address_zip_check: "pass"brand: "Diners Club"country: nullcustomer: "cus_6TzOs3X3oawJxr"cvc_check: "pass"dynamic_last4: nullexp_month: 2exp_year: 2020fingerprint: "ukp9e1Ie0rPtwrXy"funding: "credit"id: "card_16MMxEGbwvoRbeYxoQoOUyno"last4: "5904"metadata: Object__proto__: Objectname: "William Stein"object: "card"tokenization_method: null__proto__: Object1: Objectlength: 2__proto__: Array[0]has_more: falseobject: "list"total_count: 2url: "/v1/customers/cus_6TzOs3X3oawJxr/sources"__proto__: Objectsubscriptions: Object__proto__: Object__proto__: Object


PaymentMethod = rclass
    displayName : "PaymentMethod"

    propTypes :
        source         : rtypes.object.isRequired
        default        : rtypes.bool  # required for set_as_default
        set_as_default : rtypes.func  # called when this card should be set to default
        delete_method  : rtypes.func  # called when this card should be deleted

    getInitialState: ->
        confirm_default : false
        confirm_delete  : false

    icon_name: ->
        return brand_to_icon(@props.source.brand?.toLowerCase())

    render_confirm_default: ->
        <Alert bsStyle='warning'>
            <Row>
                <Col md={5} mdOffset={2}>
                    <p>Are you sure you want to set this payment card to be the default?</p>
                    <p>All future payments will be made with the card that is the default <b>at the time of renewal</b>.
                    Changing your default card right before a subscription renewal will cause the <Space/>
                    new default to be charged instead of the previous one.</p>
                </Col>
                <Col md={5}>
                    <ButtonToolbar>
                        <Button onClick={=>@setState(confirm_default:false)}>Cancel</Button>
                        <Button onClick={=>@setState(confirm_default:false);@props.set_as_default()} bsStyle='warning'>
                            <Icon name='trash'/> Set to Default
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </Alert>

    render_confirm_delete: ->
        <Alert bsStyle='danger'>
            <Row>
                <Col md={5} mdOffset={2}>
                    Are you sure you want to delete this payment method?
                </Col>
                <Col md={5}>
                    <ButtonToolbar>
                        <Button onClick={=>@setState(confirm_delete:false)}>Cancel</Button>
                        <Button bsStyle='danger' onClick={=>@setState(confirm_delete:false);@props.delete_method()}>
                            <Icon name='trash'/> Delete Payment Method
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </Alert>

    render_card: ->
        <Row>
            <Col md={2}>
                <Icon name={@icon_name()} /> {@props.source.brand}
            </Col>
            <Col md={1}>
                <em>····</em>{@props.source.last4}
            </Col>
            <Col md={1}>
                {@props.source.exp_month}/{@props.source.exp_year}
            </Col>
            <Col md={2}>
                {@props.source.name}
            </Col>
            <Col md={1}>
                {@props.source.country}
            </Col>
            <Col md={2}>
                {@props.source.address_state}
                <Space/><Space/>
                {@props.source.address_zip}
            </Col>
            {@render_action_buttons() if @props.set_as_default? or @props.delete_method?}
        </Row>

    render_action_buttons: ->
        <Col md={3}>
            <ButtonToolbar style={float: "right"}>
                {<Button
                    onClick  = {=>@setState(confirm_default:true)}
                    disabled = {@props.default}
                    bsStyle  = {if @props.default then 'primary' else 'default'}
                >
                    Default{<span>... </span> if not @props.default}
                </Button> if @props.set_as_default? }

                {<Button onClick={=>@setState(confirm_delete:true)}>
                    <Icon name="trash" /> Delete
                </Button> if @props.delete_method? }
            </ButtonToolbar>
        </Col>

    render: ->
        <div style={borderBottom:'1px solid #999',  paddingTop: '5px', paddingBottom: '5px'}>
            {@render_card()}
            {@render_confirm_default() if @state.confirm_default}
            {@render_confirm_delete()  if @state.confirm_delete}
        </div>

PaymentMethods = rclass
    displayName : 'PaymentMethods'

    propTypes :
        redux   : rtypes.object.isRequired
        sources : rtypes.object.isRequired
        default : rtypes.string

    getInitialState: ->
        state : 'view'   #  'delete' <--> 'view' <--> 'add_new'
        error : ''

    add_payment_method: ->
        @setState(state:'add_new')

    render_add_payment_method: ->
        if @state.state == 'add_new'
            <AddPaymentMethod redux={@props.redux} on_close={=>@setState(state:'view')} />

    render_add_payment_method_button: ->
        <Button disabled={@state.state != 'view'} onClick={@add_payment_method} bsStyle='primary' className='pull-right'>
            <Icon name='plus-circle' /> Add Payment Method...
        </Button>

    render_header: ->
        <Row>
            <Col sm={6}>
                <Icon name='credit-card' /> Payment methods
            </Col>
            <Col sm={6}>
                {@render_add_payment_method_button()}
            </Col>
        </Row>

    set_as_default: (id) ->
        @props.redux.getActions('billing').set_as_default_payment_method(id)

    delete_method: (id) ->
        @props.redux.getActions('billing').delete_payment_method(id)

    render_payment_method: (source) ->
        <PaymentMethod
            key            = {source.id}
            source         = {source}
            default        = {source.id==@props.default}
            set_as_default = {=>@set_as_default(source.id)}
            delete_method  = {=>@delete_method(source.id)}
        />

    render_payment_methods: ->
        for source in @props.sources.data
            @render_payment_method(source)

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render: ->
        <Panel header={@render_header()}>
            {@render_error()}
            {@render_add_payment_method() if @state.state in ['add_new']}
            {@render_payment_methods()}
        </Panel>

exports.PaymentMethods = PaymentMethods

exports.ProjectQuotaBoundsTable = ProjectQuotaBoundsTable = rclass
    render_project_quota: (name, value) ->
        data = PROJECT_UPGRADES.params[name]
        amount = value * data.pricing_factor
        unit = data.pricing_unit
        if unit == "day" and amount < 2
            amount = 24 * amount
            unit = "hour"
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#666'}>
                    {misc.round1(amount)} {misc.plural(amount, unit)}
                </span><Space/>
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render: ->
        max = PROJECT_UPGRADES.max_per_project
        <Panel
            header = {<span>Maximum possible quotas <strong>per project</strong></span>}
        >
            {@render_project_quota(name, max[name]) for name in PROJECT_UPGRADES.field_order when max[name]}
        </Panel>

exports.ProjectQuotaFreeTable = ProjectQuotaFreeTable = rclass
    render_project_quota: (name, value) ->
        # SMELL: is this a code dup from above?
        data = PROJECT_UPGRADES.params[name]
        amount = value * data.pricing_factor
        unit = data.pricing_unit
        if unit == "day" and amount < 2
            amount = 24 * amount
            unit = "hour"
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#666'}>
                    {misc.round1(amount)} {misc.plural(amount, unit)}
                </span> <Space/>
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render_header: ->
        <div style={paddingLeft:"10px"}>
            <Icon name='battery-empty' />{' '}
            <span style={fontWeight:'bold'}>Free plan</span>
        </div>

    render: ->
        free = require('smc-util/schema').DEFAULT_QUOTAS
        <Panel
            header  = {@render_header()}
            bsStyle = 'info'
        >
            <Space/>
            <div style={marginBottom:'5px', marginLeft:'10px'}>
                <Tip title="Free servers" tip="Many free projects are cramped together inside weaker compute machines, competing for CPU, RAM and I/O.">
                    <span style={fontWeight:'bold',color:'#666'}>low-grade</span><Space/>
                    <span style={color:'#999'}>Server hosting</span>
                </Tip>
            </div>
            <div style={marginBottom:'5px', marginLeft:'10px'}>
                <Tip title="Internet access" tip="Despite working inside a web-browser, free projects are not allowed to directly access the internet due to security/abuse reasons.">
                    <span style={fontWeight:'bold',color:'#666'}>no</span><Space/>
                    <span style={color:'#999'}>Internet access</span>
                </Tip>
            </div>
            {@render_project_quota(name, free[name]) for name in PROJECT_UPGRADES.field_order when free[name]}
            <Space/>
            <div style={textAlign : 'center', marginTop:'10px'}>
                <h3 style={textAlign:'left'}>
                    <span style={fontSize:'16px', verticalAlign:'super'}>$</span><Space/>
                    <span style={fontSize:'30px'}>0</span>
                </h3>
            </div>
        </Panel>

PlanInfo = rclass
    displayName : 'PlanInfo'

    propTypes :
        plan     : rtypes.string.isRequired
        period   : rtypes.string.isRequired  # 'week', 'month', 'year', or 'month year'
        selected : rtypes.bool
        on_click : rtypes.func

    getDefaultProps: ->
        selected : false

    render_plan_info_line: (name, value, data) ->
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#444'}>
                    {value * data.pricing_factor} {misc.plural(value * data.pricing_factor, data.pricing_unit)}
                </span>
                <Space/>
                <span style={color:'#666'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render_cost: (price, period) ->
        period = PROJECT_UPGRADES.period_names[period] ? period
        <span key={period} style={whiteSpace:'nowrap'}>
            <span style={fontSize:'16px', verticalAlign:'super'}>$</span><Space/>
            <span style={fontSize:'30px'}>{price}</span>
            <span style={fontSize:'14px'}> / {period}</span>
        </span>

    render_price: (prices, periods) ->
        if @props.on_click?
            # note: in non-static, there is always just *one* price (several only on "static" pages)
            for i in [0...prices.length]
                <Button key={i} bsStyle={if @props.selected then 'primary'}>
                    {@render_cost(prices[i], periods[i])}
                </Button>
        else
            <h3 style={textAlign:'left'}>
                {r_join((@render_cost(prices[i], periods[i]) for i in [0...prices.length]), <br/>)}
            </h3>

    render_plan_name: (plan_data) ->
        if plan_data.desc?
            name = plan_data.desc
            if name.indexOf('\n') != -1
                v = name.split('\n')
                name = <span>{v[0].trim()}<br/>{v[1].trim()}</span>
        else
            name = misc.capitalize(@props.plan).replace(/_/g,' ') + ' plan'
        <div style={paddingLeft:"10px"}>
            <Icon name={plan_data.icon} /> <span style={fontWeight:'bold'}>{name}</span>
        </div>

    render: ->
        plan_data = PROJECT_UPGRADES.subscription[@props.plan]
        if not plan_data?
            return <div>Unknown plan type: {@props.plan}</div>

        params   = PROJECT_UPGRADES.params
        periods  = misc.split(@props.period)
        prices   = (plan_data.price[period] for period in periods)
        benefits = plan_data.benefits

        style =
            cursor : if @props.on_click? then 'pointer'

        <Panel
            style     = {style}
            header    = {@render_plan_name(plan_data)}
            bsStyle   = {if @props.selected then 'primary' else 'info'}
            onClick   = {=>@props.on_click?()}
        >
            <Space/>
            {@render_plan_info_line(name, benefits[name] ? 0, params[name]) for name in PROJECT_UPGRADES.field_order when benefits[name]}
            <Space/>

            <div style={textAlign : 'center', marginTop:'10px'}>
                {@render_price(prices, periods)}
            </div>

        </Panel>

AddSubscription = rclass
    displayName : 'AddSubscription'

    propTypes :
        on_close        : rtypes.func.isRequired
        selected_plan   : rtypes.string
        actions         : rtypes.object.isRequired
        applied_coupons : rtypes.immutable.Map
        coupon_error    : rtypes.string

    getDefaultProps: ->
        selected_plan : ''

    getInitialState: ->
        selected_button : 'month'

    is_recurring: ->
        not PROJECT_UPGRADES.subscription[@props.selected_plan.split('-')[0]].cancel_at_period_end

    submit_create_subscription: ->
        plan = @props.selected_plan
        @props.actions.create_subscription(plan)

    set_button_and_deselect_plans: (button) ->
        if @state.selected_button isnt button
            set_selected_plan('')
            @setState(selected_button : button)

    render_period_selection_buttons: ->
        <div>
            <ButtonGroup bsSize='large' style={marginBottom:'20px', display:'flex'}>
                <Button
                    bsStyle = {if @state.selected_button is 'month' then 'primary'}
                    onClick = {=>@set_button_and_deselect_plans('month')}
                >
                    Monthly Subscriptions
                </Button>
                <Button
                    bsStyle = {if @state.selected_button is 'year' then 'primary'}
                    onClick = {=>@set_button_and_deselect_plans('year')}
                >
                    Yearly Subscriptions
                </Button>
                <Button
                    bsStyle = {if @state.selected_button is 'week' then 'primary'}
                    onClick = {=>@set_button_and_deselect_plans('week')}
                >
                    1-Week Workshops
                </Button>
                <Button
                    bsStyle = {if @state.selected_button is 'month4' then 'primary'}
                    onClick = {=>@set_button_and_deselect_plans('month4')}
                >
                    4-Month Courses
                </Button>
                <Button
                    bsStyle = {if @state.selected_button is 'year1' then 'primary'}
                    onClick = {=>@set_button_and_deselect_plans('year1')}
                >
                    Yearly Courses
                </Button>
            </ButtonGroup>
        </div>

    render_renewal_info: ->
        if @props.selected_plan
            renews = not PROJECT_UPGRADES.subscription[@props.selected_plan.split('-')[0]].cancel_at_period_end
            length = PROJECT_UPGRADES.period_names[@state.selected_button]
            <p style={marginBottom:'1ex', marginTop:'1ex'}>
                {<span>This subscription will <b>automatically renew</b> every {length}.  You can cancel automatic renewal at any time.</span> if renews}
                {<span>You will be <b>charged only once</b> for the course package, which lasts {if length == 'year' then 'a '}{length}.  It does <b>not automatically renew</b>.</span> if not renews}
            </p>

    render_subscription_grid: ->
        <SubscriptionGrid period={@state.selected_button} selected_plan={@props.selected_plan} />

    render_dedicated_resources: ->
        <div style={marginBottom:'15px'}>
            <ExplainResources type='dedicated'/>
        </div>

    render_create_subscription_options: ->
        # <h3><Icon name='list-alt'/> Sign up for a Subscription</h3>
        <div>
            <div style={textAlign:'center'}>
                {@render_period_selection_buttons()}
            </div>
            {@render_subscription_grid()}
        </div>
        ###
            if @state.selected_button is 'month' or @state.selected_button is 'year'}
            {@render_dedicated_resources() if @state.selected_button is 'dedicated_resources'}
        ###

    render_create_subscription_confirm: (plan_data) ->
        if @is_recurring()
            subscription = " and you will be signed up for a recurring subscription"
        name = plan_data.desc ? misc.capitalize(@props.selected_plan).replace(/_/g,' ') + ' plan'
        <Alert>
            <h4><Icon name='check' /> Confirm your selection </h4>
            <p>You have selected a <span style={fontWeight:'bold'}>{name} subscription</span>.</p>
            {@render_renewal_info()}
            <p>By clicking 'Add Subscription or Course Package' below, your payment card will be immediately charged{subscription}.</p>
        </Alert>

    render_create_subscription_buttons: ->
        <Row>
            <Col sm={4}>
                {powered_by_stripe()}
            </Col>
            <Col sm={8}>
                <ButtonToolbar className='pull-right'>
                    <Button
                        bsStyle  = 'primary'
                        bsSize   = 'large'
                        onClick  = {=>(@submit_create_subscription();@props.on_close())}
                        disabled = {@props.selected_plan is ''} >
                        <Icon name='check' /> Add Subscription or Course Package
                    </Button>
                    <Button
                        onClick  = {@props.on_close}
                        bsSize   = 'large'
                        >
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render: ->
        plan_data = PROJECT_UPGRADES.subscription[@props.selected_plan.split('-')[0]]
        <Row>
            <Col sm={10} smOffset={1}>
                <Well style={boxShadow:'5px 5px 5px lightgray', zIndex:1}>
                    {@render_create_subscription_options()}
                    {@render_create_subscription_confirm(plan_data) if @props.selected_plan isnt ''}
                    {<ConfirmPaymentMethod
                        is_recurring = {@is_recurring()}
                    /> if @props.selected_plan isnt ''}
                    <Row>
                        <Col sm={5} smOffset={7}>
                            <CouponAdder applied_coupons={@props.applied_coupons} coupon_error={@props.coupon_error} />
                        </Col>
                    </Row>
                    {@render_create_subscription_buttons()}
                </Well>
                <ExplainResources type='shared'/>
            </Col>
        </Row>

ConfirmPaymentMethod = rclass
    reduxProps :
        billing :
            customer : rtypes.object

    propTypes :
        is_recurring : rtypes.bool

    render_single_payment_confirmation: ->
        <span>
            <p>Payment will be processed with the card below.</p>
            <p>To change payment methods, please change your default card above.</p>
        </span>


    render_recurring_payment_confirmation: ->
        <span>
            <p>The initial payment will be processed with the card below.
            Future payments will be made with whichever card you have set as your default<Space/>
            <b>at the time of renewal</b>.</p>
        </span>

    render: ->
        if not @props.customer
            return <AddPaymentMethod redux={redux} />
        for card_data in @props.customer.sources.data
            if card_data.id == @props.customer.default_source
                default_card = card_data

        <Alert>
            <h4><Icon name='check' /> Confirm your payment card</h4>
            {@render_single_payment_confirmation() if not @props.is_recurring}
            {@render_recurring_payment_confirmation() if @props.is_recurring}
            <Well>
                <PaymentMethod
                    source = {default_card}
                />
            </Well>
        </Alert>

CouponAdder = rclass
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

    render_shared: ->
        <div>
            <Row>
                <Col md={8} sm={12}>
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

                    <div style={fontWeight:"bold"}>
                        Please immediately email us at <HelpEmailLink/> {" "}
                        {if not @props.is_static then <span> or read our <a target='_blank' href="#{PolicyPricingPageUrl}#faq">pricing FAQ</a> </span>}
                        if anything is unclear to you.
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
            <h3>Personal subscriptions</h3>
            <div>
                We offer several subscriptions that let you upgrade the default free quotas on projects.
                You can distribute these upgrades to your own projects or any projects where you are a collaborator &mdash;
                everyone participating in such a collective project benefits and can easily change their allocations at any time!
                You can get higher-quality hosting on members-only machines and enable access to the internet from projects.
                You can also increase quotas for CPU and RAM, so that you can work on larger problems and
                do more computations simultaneously.
            </div>
        </div>

    render_course: ->
        <div style={marginBottom:"10px"}>
            <h3>Course packages</h3>
            <div>
                <p>
                We offer course packages to support teaching using <SiteName/>.
                They start right after purchase and last for the indicated period and do <b>not auto-renew</b>.
                Following <a href="https://tutorial.cocalc.com/" target="_blank">this guide</a>, create a course file.
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
                you or your students pay.  <b>Start right now:</b> <i>you can fully setup your class
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

# ~~~ FAQ START

# some variables used in the text below
faq_course_120 = 2 * PROJECT_UPGRADES.subscription.medium_course.benefits.member_host
faq_academic_students =  PROJECT_UPGRADES.subscription.small_course.benefits.member_host
faq_academic_nb_standard = Math.ceil(faq_academic_students / PROJECT_UPGRADES.subscription.standard.benefits.member_host)
faq_academic_full = faq_academic_nb_standard * 4 * PROJECT_UPGRADES.subscription.standard.price.month
faq_idle_time_free_h = require('smc-util/schema').DEFAULT_QUOTAS.mintime / 60 / 60

# the structured react.js FAQ text
FAQS =
    differences:
        q: <span>What is the difference between <b>free and paid plans</b>?</span>
        a: <span>The main differences are increased quotas and the quality of hosting; we also
           prioritize supporting paying users.
           We very strongly encourage you to make an account and explore our product for free!
           There is no difference in functionality between the free and for-pay versions of
           <SiteName/>; everything is still private by default for free users, and you can
           make as many projects as you want.  You can even fully start teaching a course
           in <SiteName/> completely for free, then upgrade at any point later so that your students
           have a <b>much</b> better quality experience (for a small fraction of the cost of
           their textbook).
           </span>
    member_hosting:
        q: <span>What does <b>"member hosting"</b> mean?</span>
        a: <span>
            There are two types of projects: "free projects" and "member projects".
            Free projects run on heavily loaded computers.
            Quite often, these computers will house over 150 simultaneously running projects!
            Member-hosted projects are moved to much less loaded machine,
            which are reserved only for paying customers.<br/>
            Working in member-hosted projects feels much smoother because commands execute
            more quickly with lower latency,
            and CPU, memory and I/O heavy operations run more quickly.
            Additionally, members only projects are always "ready to start".
            Free projects that are not used for a few weeks are moved to "cold storage",
            and it can take a while to move them back onto a free machine when you
            later start them.
           </span>
    network_access:
        q: <span>What exactly does the quota <b>"internet access"</b> mean?</span>
        a: <span>
            Despite the fact that you are accessing <SiteName/> through the internet,
            you are actually working in a highly restricted environment.
            Processes running <em>inside</em> a free project are not allowed to directly
            access the internet.  (We do not allow such access for free users, since when we did,
            malicious users launched attacks on other computers from <SiteName/>.)
            Enable internet access by adding the "internet access" quota.
           </span>
    idle_timeout:
        q: <span>What exactly does the quota <b>"idle timeout"</b> mean?</span>
        a: <span>
            By default, free projects stop running after {faq_idle_time_free_h} hour of idle time.
            This makes doing an overnight research computation &mdash;
            e.g., searching for special prime numbers &mdash; impossible.
            With an increased idle timeout, projects are allowed to run longer unattended.
            Processes might still stop if they use too much memory, crash due to an exception, or if the server they are
            running on is rebooted.
            (NOTE: Projects do not normally stop if you are continuously using them, and there are no
            daily or monthly caps on how much you may use a <SiteName/> project, even a free one.)
           </span>
    cpu_shares:
        q: <span>What are <b>"CPU shares"</b> and <b>"CPU cores"</b>?</span>
        a: <span>
            All projects on a single server share the underlying resources.
            These quotas determine how CPU resources are shared between projects.
            Increasing them increases the priority of a project compared to others on the same host computer.<br/>
            In particular, "shares" determines the amount of relative CPU time you get.
           </span>
    course120:
        q: <span>
            I have a <b>course of {faq_course_120 - 20} students</b>.
            Which plan should I purchase?
           </span>
        a: <span>
            You can combine and add up course subscriptions!
            By ordering two times the 'medium course plan',
            you will get {faq_course_120} upgrades covering all your students.
            </span>
    academic:
        q: <span>Do you offer <b>academic discounts</b>?</span>
        a: <span>
            Our course subscriptions are for academic use, and are already significantly discounted from the standard plans.
            Please compare our monthly plans with the 4 month course plans.
            For example, giving {faq_academic_students} students better member hosting and internet access
            would require subscribing to {faq_academic_nb_standard} "standard plans" for 4 months
            amounting to ${faq_academic_full}.
            </span>
    academic_quotas:
        q: <span>There are no CPU/RAM upgrades for courses. Is this enough?</span>
        a: <span>
            From our experience, we have found that for the type of computations used in most courses,
            the free quotas for memory and disk space are plenty.
            We do strongly suggest the classes upgrade all projects to "members-only" hosting,
            since this provides much better computers with higher availability.
           </span>
    invoice:
        q: <span>How do I get an <b>invoice</b> with a specific information?</span>
        a: <span>
            After purchasing, please email us at <HelpEmailLink />, reference what you bought,
            and tell us the payer{"'"}s name, contact information and any other specific
            instructions.   We will then respond with a custom invoice for your purchase that
            satisfies your unique requirements.
           </span>
    course_required_plan:
        q: <span>Am I <strong>required to pay</strong> for conducting a course?</span>
        a: <span>
            <strong>No.</strong> You can use all course related functionalities under a free plan.
           </span>
    student_files:
        q: <span>What happens with the <strong>files of my students</strong> after the course finishes?</span>
        a: <span>
            Students will <strong>continue to have access</strong> to their files after the course,
            regardless of running the course under a paid plan or for free.
            Their projects remain accessible,
            they can (optionally) upgrade their projects with their own subscriptions,
            and they can also download all files to their local computer.
           </span>
    close_browser:
        q: <span>Can I <b>close my web-browser</b> while I{"'"}m working?</span>
        a: <span>
            <b>Yes!</b> When you close your web-browser, all your processes and running sessions continue running.
            You can start a computation, shut down your computer, go somewhere else,  sign in
            on another computer, and continue working where you left off.
            (Note that output from Jupyter notebook computations will be lost, though Sage worksheet output is
            properly captured.)
            <br/>
            The only reasons why a project or process stops are
            that it hits its <em>idle timeout</em>, has used too much memory,
            crashed due to an exception, or the server had to reboot.
           </span>
    private:
        q: <span>Which plan offers <b>"private" file storage</b>?</span>
        a: <span>All our plans (free and paid) host your files privately by default.
            Please read our <a target="_blank" href={PolicyPrivacyPageUrl}>Privacy Policy</a> and {" "}
            <a target="_blank" href={PolicyCopyrightPageUrl}>Copyright Notice</a>.
           </span>
    git:
        q: <span>Can I work with <b>Git</b> &mdash; including GitHub, Bitbucket, GitLab, etc.?</span>
        a: <span>
            Git and various other source control tools are installed and ready to use via the "Terminal".
            But, in order to also interoperate with sites hosting Git repositories,
            you have to purchase a plan giving you "internet upgrades" and then applying this upgrade to your project.
           </span>
    backups:
        q: <span>Are my files backed up?</span>
        a: <span>
            All files in every project are snapshotted every 5 minutes.  You can browse your snapshots by
            clicking the <b>"Backups"</b> link to the right of the file listing.   Also, <SiteName/> records
            the history of all edits you or your collaborators make to most files, and you can browse
            that history with a slider by clicking on the "History" button (next to save) in files.
            We care about your data, and also make offsite backups periodically to encrypted USB
            drives that are not physically connected to the internet.
           </span>
    download_everything:
        q: <span>How can I <strong>download my project files</strong>?</span>
        a: <ol>
             <li>
                 You can download each file individually via the "Files" interface.
                 Select the file and click the "Download" button.
             </li>
             <li>
                 It is also possible to create an archive for a directory or all files.
                 For that, create a "Terminal"-file and issue one of these commands:
                 <ul>
                  <li>
                      ZIP archive (Windows): <code>zip -r9 "[filename].zip" [directory-name...]</code>
                  </li>
                  <li>
                      Tarball (Unix-like): <code>tar cjvf "[filename].tar.bz2" [directory-name...]</code>
                  </li>
                 </ul>
                 (Replace <code>[filename]</code> with the actual filename and <code>[directory-name]</code> by one or more filenames or directory names.)
                 Afterwards, download the archive as explained above.
             </li>
           </ol>


FAQ = exports.FAQ = rclass
    displayName : 'FAQ'

    faq: ->
        for qid, qa of FAQS
            <li key={qid} style={marginBottom:"10px"}>
                <em style={fontSize:"120%"}>{qa.q}</em>
                <br/>
                <span>{qa.a}</span>
            </li>

    render: ->
        <div>
            <a name="faq"></a>
            <h2>Frequently asked questions</h2>
            <ul>
                {@faq()}
            </ul>
        </div>

# ~~~ FAQ END


Subscription = rclass
    displayName : 'Subscription'

    propTypes :
        redux        : rtypes.object.isRequired
        subscription : rtypes.object.isRequired

    getInitialState: ->
        confirm_cancel : false

    cancel_subscription: ->
        @props.redux.getActions('billing').cancel_subscription(@props.subscription.id)

    quantity: ->
        q = @props.subscription.quantity
        if q > 1
            return "#{q} × "

    render_cancel_at_end: ->
        if @props.subscription.cancel_at_period_end
            <span style={marginLeft:'15px'}>Will cancel at period end.</span>

    render_info: ->
        sub = @props.subscription
        cancellable = not (sub.cancel_at_period_end or @state.cancelling or @state.confirm_cancel)
        <Row style={paddingBottom: '5px', paddingTop:'5px'}>
            <Col md={4}>
                {@quantity()} {sub.plan.name} ({misc.stripe_amount(sub.plan.amount, sub.plan.currency)} for {plan_interval(sub.plan)})
            </Col>
            <Col md={2}>
                {misc.capitalize(sub.status)}
            </Col>
            <Col md={4} style={color:'#666'}>
                {misc.stripe_date(sub.current_period_start)} – {misc.stripe_date(sub.current_period_end)} (start: {misc.stripe_date(sub.start)})
                {@render_cancel_at_end()}
            </Col>
            <Col md={2}>
                {<Button style={float:'right'} onClick={=>@setState(confirm_cancel:true)}>Cancel...</Button> if cancellable}
            </Col>
        </Row>

    render_confirm: ->
        if not @state.confirm_cancel
            return
        ###
        TODO: these buttons do not seem consistent with other button language, but makes sense because of the use of "Cancel" a subscription
        ###
        <Alert bsStyle='warning'>
            <Row style={borderBottom:'1px solid #999', paddingBottom:'15px', paddingTop:'15px'}>
                <Col md={6}>
                    Are you sure you want to cancel this subscription?  If you cancel your subscription, it will run to the end of the subscription period, but will not be renewed when the current (already paid for) period ends; any upgrades provided by this subscription will be disabled.    If you need further clarification or need a refund, please email  <HelpEmailLink/>.
                </Col>
                <Col md={6}>
                    <Button onClick={=>@setState(confirm_cancel:false)}>Make No Change</Button>
                    <div style={float:'right'}>
                        <Button bsStyle='danger' onClick={=>@setState(confirm_cancel:false);@cancel_subscription()}>Yes, please cancel and do not auto-renew my subscription</Button>
                    </div>
                </Col>
            </Row>
        </Alert>


    render: ->
        <div style={borderBottom:'1px solid #999',  paddingTop: '5px', paddingBottom: '5px'}>
            {@render_info()}
            {@render_confirm() if @state.confirm_cancel}
        </div>

Subscriptions = rclass
    displayName : 'Subscriptions'

    propTypes :
        subscriptions   : rtypes.object
        sources         : rtypes.object.isRequired
        selected_plan   : rtypes.string
        redux           : rtypes.object.isRequired
        applied_coupons : rtypes.immutable.Map
        coupon_error    : rtypes.string

    getInitialState: ->
        state : 'view'    # view -> add_new ->         # FUTURE: ??

    close_add_subscription: ->
        @setState(state : 'view')
        set_selected_plan('')
        @actions('billing').remove_all_coupons()

    render_add_subscription_button: ->
        <Button
            bsStyle   = 'primary'
            disabled  = {@state.state isnt 'view' or @props.sources.total_count is 0}
            onClick   = {=>@setState(state : 'add_new')}
            className = 'pull-right' >
            <Icon name='plus-circle' /> Add Subscription or Course Package...
        </Button>

    render_add_subscription: ->
        <AddSubscription
            on_close        = {@close_add_subscription}
            selected_plan   = {@props.selected_plan}
            actions         = {@props.redux.getActions('billing')}
            applied_coupons = {@props.applied_coupons}
            coupon_error    = {@props.coupon_error} />

    render_header: ->
        <Row>
            <Col sm={6}>
                <Icon name='list-alt' /> Subscriptions and Course Packages
            </Col>
            <Col sm={6}>
                {@render_add_subscription_button()}
            </Col>
        </Row>

    render_subscriptions: ->
        for sub in @props.subscriptions.data
            <Subscription key={sub.id} subscription={sub} redux={@props.redux} />

    render: ->
        <Panel header={@render_header()}>
            {@render_add_subscription() if @state.state is 'add_new'}
            {@render_subscriptions()}
        </Panel>

Invoice = rclass
    displayName : "Invoice"

    propTypes :
        invoice : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    getInitialState: ->
        hide_line_items : true

    download_invoice: (e) ->
        e.preventDefault()
        invoice = @props.invoice
        username = @props.redux.getStore('account').get_username()
        misc_page = require('./misc_page')  # do NOT require at top level, since code in billing.cjsx may be used on backend
        misc_page.download_file("#{window.app_base_url}/invoice/sagemathcloud-#{username}-receipt-#{new Date(invoice.date*1000).toISOString().slice(0,10)}-#{invoice.id}.pdf")

    render_paid_status: ->
        if @props.invoice.paid
            return <span>PAID</span>
        else
            return <span style={color:'red'}>UNPAID</span>

    render_description: ->
        if @props.invoice.description
            return <span>{@props.invoice.description}</span>

    render_line_description: (line) ->
        v = []
        if line.quantity > 1
            v.push("#{line.quantity} × ")
        if line.description?
            v.push(line.description)
        if line.plan?
            v.push(line.plan.name)
            v.push(" (start: #{misc.stripe_date(line.period.start)})")
        return v

    render_line_item: (line, n) ->
        <Row key={line.id} style={borderBottom:'1px solid #aaa'}>
            <Col sm={1}>
                {n}.
            </Col>
            <Col sm={9}>
                {@render_line_description(line)}
            </Col>
            <Col sm={2}>
                {render_amount(line.amount, @props.invoice.currency)}
            </Col>
        </Row>

    render_tax: ->
        <Row key='tax' style={borderBottom:'1px solid #aaa'}>
            <Col sm={1}>
            </Col>
            <Col sm={9}>
                WA State Sales Tax ({@props.invoice.tax_percent}%)
            </Col>
            <Col sm={2}>
                {render_amount(@props.invoice.tax, @props.invoice.currency)}
            </Col>
        </Row>

    render_line_items: ->
        if @props.invoice.lines
            if @state.hide_line_items
                <a href='' onClick={(e)=>e.preventDefault();@setState(hide_line_items:false)}>(details)</a>
            else
                v = []
                v.push <a key='hide' href='' onClick={(e)=>e.preventDefault();@setState(hide_line_items:true)}>(hide details)</a>
                n = 1
                for line in @props.invoice.lines.data
                    v.push @render_line_item(line, n)
                    n += 1
                if @props.invoice.tax
                    v.push @render_tax()
                return v

    render: ->
        <Row style={borderBottom:'1px solid #999'}>
            <Col md={1}>
                {render_amount(@props.invoice.amount_due, @props.invoice.currency)}
            </Col>
            <Col md={1}>
                {@render_paid_status()}
            </Col>
            <Col md={3}>
                {misc.stripe_date(@props.invoice.date)}
            </Col>
            <Col md={6}>
                {@render_description()}
                {@render_line_items()}
            </Col>
            <Col md={1}>
                <a onClick={@download_invoice} href=""><Icon name="cloud-download" /></a>
            </Col>
        </Row>

InvoiceHistory = rclass
    displayName : "InvoiceHistory"

    propTypes :
        redux    : rtypes.object.isRequired
        invoices : rtypes.object

    render_header: ->
        <span>
            <Icon name="list-alt" /> Invoices and receipts
        </span>

    render_invoices: ->
        if not @props.invoices?
            return
        for invoice in @props.invoices.data
            <Invoice key={invoice.id} invoice={invoice} redux={@props.redux} />

    render: ->
        <Panel header={@render_header()}>
            {@render_invoices()}
        </Panel>

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

    key: ->
        return "course-pay-#{@props.project_id}"

    buy_subscription: ->
        actions = @props.redux.getActions('billing')
        # Set semething in billing store that says currently doing
        actions.setState("#{@key()}": true)
        # Purchase 1 course subscription
        actions.create_subscription('student_course')
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
                actions.setState("#{@key()}": undefined)

    render_buy_button: ->
        if @props.redux.getStore('billing').get(@key())
            <Button bsStyle='primary' disabled={true}>
                <Icon name="cc-icon-cocalc-ring" spin /> Paying the one-time ${STUDENT_COURSE_PRICE} fee for this course...
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
                    <Button onClick={=>@buy_subscription()} bsStyle='primary'>
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

    render_help_suggestion: ->
        <span>
            <Space/> If you have any questions at all, email <HelpEmailLink /> immediately.
            <i>
                <Space/> Contact us if you are purchasing a course subscription, but need a short trial
                to test things out first.<Space/>
            </i>
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
                    Click "Add Payment Method..." to add your credit card, then
                    click "Add Subscription or Course Package..." and
                    choose from either a monthly, yearly or semester-long plan.
                    You will <b>not be charged</b> until you select a specific subscription then click
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
                Click "Add Subscription or Course Package...", then
                choose from either a monthly, yearly or semester-long plan (you may sign up for the
                same subscription more than once to increase the number of upgrades).
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
                Past invoices and receipts are also available below.
                {help}
            </span>

    render_info_link: ->
        <div style={marginTop:'1em', marginBottom:'1em', color:"#666"}>
            We offer many <a href={PolicyPricingPageUrl} target='_blank'> pricing and subscription options</a>.
            <Space/>
            {@render_suggested_next_step()}
        </div>

    get_panel_header: (icon, header) ->
        <div style={cursor:'pointer'} >
            <Icon name={icon} fixedWidth /> {header}
        </div>

    render_subscriptions: ->
        <Subscriptions
            subscriptions   = {@props.customer.subscriptions}
            applied_coupons = {@props.applied_coupons}
            coupon_error    = {@props.coupon_error}
            sources         = {@props.customer.sources}
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
                <PaymentMethods redux={@props.redux} sources={data:[]} default='' />
            </div>
        else if not @props.for_course and (not @props.customer? or @props.continue_first_purchase)
            <div>
                <AddSubscription
                    on_close        = {@finish_first_subscription}
                    selected_plan   = {@props.selected_plan}
                    actions         = {@props.redux.getActions('billing')}
                    applied_coupons = {@props.applied_coupons}
                    coupon_error    = {@props.coupon_error} />
            </div>
        else
            # data loaded and customer exists
            if @props.is_simplified and subs > 0
                <div>
                    <PaymentMethods redux={@props.redux} sources={@props.customer.sources} default={@props.customer.default_source} />
                    {<Panel header={@get_panel_header('list-alt', 'Subscriptions and Course Packages')} eventKey='2'>
                        {@render_subscriptions()}
                    </Panel> if not @props.for_course}
                </div>
            else if @props.is_simplified
                <div>
                    <PaymentMethods redux={@props.redux} sources={@props.customer.sources} default={@props.customer.default_source} />
                    {@render_subscriptions() if not @props.for_course}
                </div>
            else
                <div>
                    <PaymentMethods redux={@props.redux} sources={@props.customer.sources} default={@props.customer.default_source} />
                    {@render_subscriptions() if not @props.for_course}
                    <InvoiceHistory invoices={@props.invoices} redux={@props.redux} />
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
    displayName : 'BillingPageRedux-redux'

    render: ->
        <BillingPage is_simplified={false} redux={redux} />

exports.BillingPageSimplifiedRedux = rclass
    displayName : 'BillingPageSimplifiedRedux-redux'

    render: ->
        <BillingPage is_simplified={true} redux={redux} />

exports.BillingPageForCourseRedux = rclass
    displayName : 'BillingPageForCourseRedux-redux'

    render: ->
        <BillingPage is_simplified={true} for_course={true} redux={redux} />

render_amount = (amount, currency) ->
    <div style={float:'right'}>{misc.stripe_amount(amount, currency)}</div>

brand_to_icon = (brand) ->
    return if brand in ['discover', 'mastercard', 'visa'] then "fab fa-cc-#{brand}" else "fa-credit-card"

COUNTRIES = ",United States,Canada,Spain,France,United Kingdom,Germany,Russia,Colombia,Mexico,Italy,Afghanistan,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua and Barbuda,Argentina,Armenia,Aruba,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Bouvet Island,Brazil,British Indian Ocean Territory,British Virgin Islands,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,China,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Cook Islands,Costa Rica,Cote d'Ivoire,Croatia,Cuba,Cyprus,Czech Republic,Democratic Republic of The Congo,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Ethiopia,Falkland Islands,Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,French Southern and Antarctic Lands,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Heard Island and McDonald Islands,Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Macao,Macedonia,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Micronesia,Moldova,Monaco,Mongolia,Montenegro,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,North Korea,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn Islands,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Rwanda,Saint Helena,Saint Kitts and Nevis,Saint Lucia,Saint Pierre and Miquelon,Saint Vincent and The Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Georgia and The South Sandwich Islands,South Korea,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Svalbard and Jan Mayen,Swaziland,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Timor-Leste,Togo,Tokelau,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Turks and Caicos Islands,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,United States Minor Outlying Islands,Uruguay,Uzbekistan,Vanuatu,Vatican City,Venezuela,Vietnam,Wallis and Futuna,Western Sahara,Yemen,Zambia,Zimbabwe".split(',')

STATES = {'':'',AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',AS:'American Samoa',DC:'District of Columbia',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',VI:'United States Virgin Islands'}


# FUTURE: make this an action and a getter in the BILLING store
set_selected_plan = (plan, period) ->
    if period?.slice(0,4) == 'year'
        plan = plan + "-year"
    if period?.slice(0,4) == 'week'
        plan = plan + "-week"
    redux.getActions('billing').setState(selected_plan : plan)

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