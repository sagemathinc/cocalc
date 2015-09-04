###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

async     = require('async')
misc      = require('misc')

{flux, rclass, React, rtypes, Flux, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, Well, Alert} = require('react-bootstrap')
{ActivityDisplay, ErrorDisplay, Icon, Loading, SelectorInput, r_join, Tip} = require('r_misc')


{PROJECT_UPGRADES} = require('schema')

actions = store = undefined
# Create the billing actions
class BillingActions extends Actions
    setTo: (payload) => payload

    clear_error: => @setTo(error:'')

    update_customer: (cb) =>
        if not Stripe?
            cb?("stripe not available")
            return
        if @_update_customer_lock then return else @_update_customer_lock=true
        @setTo(action:"Updating billing information")
        customer_is_defined = false
        {salvus_client} = require('salvus_client')   # do not put at top level, since some code runs on server
        async.series([
            (cb) =>
                salvus_client.stripe_get_customer
                    cb : (err, resp) =>
                        @_update_customer_lock = false
                        if not err
                            Stripe.setPublishableKey(resp.stripe_publishable_key)
                            @setTo(customer: resp.customer, loaded:true)
                            customer_is_defined = resp.customer?
                        cb(err)
            (cb) =>
                if not customer_is_defined
                    cb()
                else
                    # only call get_invoices if the customer already exists in the system!
                    salvus_client.stripe_get_invoices
                        limit : 100  # TODO -- this will change when we use webhooks and our own database of info.
                        cb: (err, invoices) =>
                            if not err
                                @setTo(invoices: invoices)
                            cb(err)
        ], (err) =>
            @setTo(error:err, action:'')
            cb?(err)
        )


    _action: (action, desc, opts) =>
        @setTo(action: desc)
        cb = opts.cb
        opts.cb = (err) =>
            @setTo(action:'')
            if err
                @setTo(error:err)
                cb?(err)
            else
                @update_customer(cb)
        {salvus_client} = require('salvus_client')   # do not put at top level, since some code runs on server
        salvus_client["stripe_#{action}"](opts)

    delete_payment_method: (id, cb) =>
        @_action('delete_source', 'Deleting a payment method', {card_id:id, cb:cb})

    set_as_default_payment_method: (id, cb) =>
        @_action('set_default_source', 'Setting payment method as default', {card_id:id, cb:cb})

    submit_payment_method: (info, cb) =>
        response = undefined
        async.series([
            (cb) =>  # see https://stripe.com/docs/stripe.js#createToken
                @setTo(action:"Creating a new payment method -- get token from Stripe")
                Stripe.card.createToken info, (status, _response) =>
                    if status != 200
                        cb(_response.error.message)
                    else
                        response = _response
                        cb()
            (cb) =>
                @_action('create_source', 'Creating a new payment method (sending token to SageMathCloud)', {token:response.id, cb:cb})
        ], (err) =>
            @setTo(action:"", error:err)
            cb?(err)
        )

    cancel_subscription: (id) =>
        @_action('cancel_subscription', "Cancel a subscription", subscription_id : id)

    create_subscription : (plan='standard') =>
        @_action('create_subscription', 'Create a subscription', plan : plan)

actions = flux.createActions('billing', BillingActions)

# Create the billing store
class BillingStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('billing')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (payload) ->
        @setState(payload)

store = flux.createStore('billing', BillingStore)

validate =
    valid   : {border:'1px solid green'}
    invalid : {border:'1px solid red'}

AddPaymentMethod = rclass
    displayName : "AddPaymentMethod"

    propTypes :
        flux     : rtypes.object.isRequired
        on_close : rtypes.func.isRequired  # called when this should be closed

    getInitialState : ->
        new_payment_info : {name : @props.flux.getStore('account').get_fullname()}
        submitting       : false
        error            : ''
        cvc_help         : false

    submit_payment_method : ->
        @setState(error: false, submitting:true)
        @props.flux.getActions('billing').submit_payment_method @state.new_payment_info, (err) =>
            @setState(error: err, submitting:false)
            if not err
                @props.on_close()

    render_payment_method_field : (field, control) ->
        if field == 'State' and @state.new_payment_info.address_country != "United States"
            return
        <Row key={field}>
            <Col sm=4>
                {field}
            </Col>
            <Col sm=8>
                {control}
            </Col>
        </Row>

    set_input_info : (field, ref, value) ->
        x = misc.copy(@state.new_payment_info)
        x[field] = value ? @refs[ref].getValue()
        @setState(new_payment_info: x)

    render_input_card_number : ->
        icon = brand_to_icon($.payment.cardType(@state.new_payment_info.number))
        value = if @valid('number') then $.payment.formatCardNumber(@state.new_payment_info.number) else @state.new_payment_info.number
        <Input
            autoFocus
            ref         = 'input_card_number'
            style       = @style('number')
            type        = 'text'
            size        = '20'
            placeholder = '1234 5678 9012 3456'
            value       = {value}
            onChange    = {=>@set_input_info('number','input_card_number')}
            addonAfter  = {<Icon name={icon} />}
            disabled    = {@state.submitting}
        />

    render_input_cvc_input : ->
        <Input
            ref         = 'input_cvc'
            style       = {misc.merge({width:'5em'}, @style('cvc'))}
            type        = 'text'
            size        = 4
            placeholder = '···'
            onChange    = {=>@set_input_info('cvc', 'input_cvc')}
            disabled    = {@state.submitting}
        />

    render_input_cvc_help : ->
        if @state.cvc_help
            <div>The <a href='https://en.wikipedia.org/wiki/Card_security_code' target='_blank'>security code</a> is
            located on the back of credit or debit cards and is a separate group of 3 (or 4) digits to the right of
            the signature strip. <a href='' onClick={(e)=>e.preventDefault();@setState(cvc_help:false)}>(hide)</a></div>
        else
            <a href='' onClick={(e)=>e.preventDefault();@setState(cvc_help:true)}>(what is the security code?)</a>

    render_input_cvc : ->
        <Row>
            <Col md=3>{@render_input_cvc_input()}</Col>
            <Col md=9>{@render_input_cvc_help()}</Col>
        </Row>

    valid : (name) ->
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
        if not x?
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

    style : (name) ->
        a = @valid(name)
        if not a?
            return {}
        else if a == true
            return validate.valid
        else
            return validate.invalid

    render_input_expiration : ->
        <div style={marginBottom:'15px'}>
            <input
                readOnly    = {@state.submitting}
                className   = 'form-control'
                style       = {misc.merge({display:'inline', width:'5em'}, @style('exp_month'))}
                placeholder = 'MM'
                type        = 'text'
                size        = '2'
                onChange    = {(e)=>@set_input_info('exp_month', undefined, e.target.value)}
            />
            <span> / </span>
            <input
                readOnly    = {@state.submitting}
                className   = 'form-control'
                style       = {misc.merge({display:'inline', width:'5em'}, @style('exp_year'))}
                placeholder = 'YY'
                type        = 'text'
                size        = '2'
                onChange    = {(e)=>@set_input_info('exp_year', undefined, e.target.value)}
            />
        </div>

    render_input_name : ->
        <Input
            ref         = 'input_name'
            type        = 'text'
            placeholder = 'Name on Card'
            onChange    = {=>@set_input_info('name', 'input_name')}
            style       = {@style('name')}
            value       = {@state.new_payment_info.name}
            disabled    = {@state.submitting}
        />

    render_input_country : ->
        <SelectorInput
            options   = {COUNTRIES}
            on_change = {(country)=>@set_input_info('address_country', '', country)}
            disabled  = {@state.submitting}
        />

    render_input_zip : ->
        <Input
            ref         = 'input_address_zip'
            style       = {@style('address_zip')}
            placeholder = 'Zip Code'
            type        = 'text'
            size        = '5'
            pattern     = '\d{5,5}(-\d{4,4})?'
            onChange    = {=>@set_input_info('address_zip', 'input_address_zip')}
            disabled    = {@state.submitting}
        />

    render_tax_notice : ->
        <Row>
            <Col sm=12>
                <Alert bsStyle='info'>
                    <h4><Icon name='exclamation-triangle' /> Notice </h4>
                    <p>Sales tax is applied in the state of Washington</p>
                </Alert>
            </Col>
        </Row>

    render_input_state_zip : ->
        <div>
            <Row>
                <Col sm=7>
                    <SelectorInput
                        options   = {STATES}
                        on_change = {(state)=>@set_input_info('address_state', '', state)}
                        disabled  = {@state.submitting}
                    />
                </Col>
                <Col sm=5>
                    {@render_input_zip()}
                </Col>
            </Row>
            {@render_tax_notice() if @state.new_payment_info.address_state is 'WA'}
        </div>


    render_payment_method_fields : ->
        PAYMENT_METHOD_FORM =
            'Card Number'         : @render_input_card_number
            'Security Code (CVC)' : @render_input_cvc
            'Expiration (MM/YY)'  : @render_input_expiration
            'Name on Card'        : @render_input_name
            'Country'             : @render_input_country
            'State'               : @render_input_state_zip

        for field, control of PAYMENT_METHOD_FORM
            @render_payment_method_field(field, control())

    render_payment_method_buttons : ->
        <Row>
            <Col sm=4>
                Powered by <a href="https://stripe.com/" target="_blank">Stripe</a>
            </Col>
            <Col sm=8>
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

    render_error : ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render : ->
        <Row>
            <Col sm=6 smOffset=3>
                <Well style={boxShadow:'5px 5px 5px lightgray', position:'absolute', zIndex:2}>
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
        default        : rtypes.bool.isRequired
        set_as_default : rtypes.func.isRequired   # called when this card should be set to default
        delete_method  : rtypes.func.isRequired   # called when this card should be deleted

    getInitialState : ->
        confirm_default : false
        confirm_delete  : false

    icon_name : ->
        return brand_to_icon(@props.source.brand.toLowerCase())

    render_confirm_default : ->
        <Row>
            <Col md=5 mdOffset=2>
                Are you sure you want to set this payment method to be the default for invoices?
            </Col>
            <Col md=5>
                <ButtonToolbar>
                    <Button onClick={=>@setState(confirm_default:false)}>Cancel</Button>
                    <Button onClick={=>@setState(confirm_default:false);@props.set_as_default()} bsStyle='warning'>
                        <Icon name='trash'/> Set to Default
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_confirm_delete : ->
        <Row>
            <Col md=5 mdOffset=2>
                Are you sure you want to delete this payment method?
            </Col>
            <Col md=5>
                <ButtonToolbar>
                    <Button onClick={=>@setState(confirm_delete:false)}>Cancel</Button>
                    <Button bsStyle='danger' onClick={=>@setState(confirm_delete:false);@props.delete_method()}>
                        <Icon name='trash'/> Delete Payment Method
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_card : ->
        <Row>
            <Col md=2>
                <Icon name={@icon_name()} /> {@props.source.brand}
            </Col>
            <Col md=1>
                <em>····</em>{@props.source.last4}
            </Col>
            <Col md=1>
                {@props.source.exp_month}/{@props.source.exp_year}
            </Col>
            <Col md=2>
                {@props.source.name}
            </Col>
            <Col md=1>
                {@props.source.country}
            </Col>
            <Col md=2>
                {@props.source.address_state}
                &nbsp; &nbsp;
                {@props.source.address_zip}
            </Col>
            <Col md=3>
                <ButtonToolbar style={float: "right"}>
                    <Button
                        onClick  = {=>@setState(confirm_default:true)}
                        disabled = {@props.default}
                        bsStyle  = {if @props.default then 'primary' else 'default'}
                    >
                        Default
                    </Button>
                    <Button onClick={=>@setState(confirm_delete:true)}>
                        <Icon name="trash" /> Delete
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render : ->
        <div style={borderBottom:'1px solid #999',  paddingTop: '5px', paddingBottom: '5px'}>
            {@render_card()}
            {@render_confirm_default() if @state.confirm_default}
            {@render_confirm_delete()  if @state.confirm_delete}
        </div>

PaymentMethods = rclass
    displayName : 'PaymentMethods'

    propTypes :
        flux    : rtypes.object.isRequired
        sources : rtypes.object.isRequired
        default : rtypes.string

    getInitialState : ->
        state : 'view'   #  'delete' <--> 'view' <--> 'add_new'
        error : ''

    add_payment_method : ->
        @setState(state:'add_new')

    render_add_payment_method : ->
        if @state.state == 'add_new'
            <AddPaymentMethod flux={@props.flux} on_close={=>@setState(state:'view')} />

    render_add_payment_method_button : ->
        <Button disabled={@state.state != 'view'} onClick={@add_payment_method} bsStyle='primary' className='pull-right'>
            <Icon name='plus-circle' /> Add Payment Method...
        </Button>

    render_header : ->
        <Row>
            <Col sm=6>
                <Icon name='credit-card' /> Payment Methods
            </Col>
            <Col sm=6>
                {@render_add_payment_method_button()}
            </Col>
        </Row>

    set_as_default : (id) ->
        @props.flux.getActions('billing').set_as_default_payment_method(id)

    delete_method : (id) ->
        @props.flux.getActions('billing').delete_payment_method(id)

    render_payment_method : (source) ->
        <PaymentMethod
            key            = {source.id}
            source         = {source}
            default        = {source.id==@props.default}
            set_as_default = {=>@set_as_default(source.id)}   # closure -- must be in separate function from below
            delete_method  = {=>@delete_method(source.id)}
        />

    render_payment_methods : ->
        for source in @props.sources.data
            @render_payment_method(source)

    render_error : ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render : ->
        <Panel header={@render_header()}>
            {@render_error()}
            {@render_add_payment_method() if @state.state in ['add_new']}
            {@render_payment_methods()}
        </Panel>

exports.ProjectQuotaBoundsTable = ProjectQuotaBoundsTable = rclass
    render_project_quota: (name, value) ->
        data = PROJECT_UPGRADES.params[name]
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#666'}>
                    {value * data.pricing_factor} {misc.plural(value * data.pricing_factor, data.pricing_unit)}
                </span>&nbsp;
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render : ->
        max = PROJECT_UPGRADES.max_per_project
        <Panel
            header = 'Maximum possible quota per project'
        >
            {@render_project_quota(name, max[name]) for name in PROJECT_UPGRADES.field_order when max[name]}
        </Panel>

exports.ProjectQuotaFreeTable = ProjectQuotaFreeTable = rclass
    render_project_quota: (name, value) ->
        data = PROJECT_UPGRADES.params[name]
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#666'}>
                    {misc.round1(value * data.pricing_factor)} {misc.plural(value * data.pricing_factor, data.pricing_unit)}
                </span>&nbsp;
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render : ->
        free = require('schema').DEFAULT_QUOTAS
        <Panel
            header = 'Projects start with these quotas for free (shared with other users)'
        >
            {@render_project_quota(name, free[name]) for name in PROJECT_UPGRADES.field_order when free[name]}
        </Panel>

PlanInfo = rclass
    displayName : 'PlanInfo'

    propTypes :
        plan     : rtypes.string.isRequired
        period   : rtypes.string.isRequired  # 'month', 'year', or 'month year'
        selected : rtypes.bool
        on_click : rtypes.func

    getDefaultProps : ->
        selected : false

    render_plan_info_line : (name, value, data) ->
        <div key={name} style={marginBottom:'5px', marginLeft:'10px'}>
            <Tip title={data.display} tip={data.desc}>
                <span style={fontWeight:'bold',color:'#666'}>
                    {value * data.pricing_factor} {misc.plural(value * data.pricing_factor, data.pricing_unit)}
                </span>&nbsp;
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render_cost: (price, period) ->
        <span key={period}>
            <span style={fontSize:'16px', verticalAlign:'super'}>$</span>&nbsp;
            <span style={fontSize:'30px'}>{price}</span>
            <span style={fontSize:'14px'}> / {period}</span>
        </span>

    render_header : (prices, periods) ->
        sep = <span style={marginLeft:'10px', marginRight:'10px'}>or</span>
        <h3 style={textAlign:'center'}>
            {r_join((@render_cost(prices[i], periods[i]) for i in [0...prices.length]), sep)}
        </h3>

    render : ->
        plan_data = PROJECT_UPGRADES.membership[@props.plan]
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
            className = 'grow'
            header    = {@render_header(prices, periods)}
            bsStyle   = {if @props.selected then 'primary' else 'info'}
            onClick   = {=>@props.on_click?()}
        >
            Upgrades that you may distribute to your projects<br/><br/>
            {@render_plan_info_line(name, benefits[name] ? 0, params[name]) for name in PROJECT_UPGRADES.field_order}
        </Panel>

AddSubscription = rclass
    displayName : 'AddSubscription'

    propTypes :
        on_close : rtypes.func.isRequired
        actions  : rtypes.object.isRequired

    getInitialState : ->
        selected_plan : ''

    submit_create_subscription : ->
        plan = @state.selected_plan
        @props.actions.create_subscription(plan)

    render_create_subscription_options : ->
        <div>
            <h4><Icon name='list-alt'/> Sign up for a subscription</h4>
            <span style={color:'#666'}>
                A subscription allows you to upgrade memory, disk space, and other quotas on any project you use.
                Subscribe more than once to increase your upgrades.
                If you have any questions, email <a href='mailto:help@sagemath.com'>help@sagemath.com</a>.
            </span>
            <hr/>
            <SubscriptionGrid period='month'/>
        </div>

    render_create_subscription_buttons : ->
        <Row>
            <Col sm=4>
                Powered by <a href="https://stripe.com/" target="_blank">Stripe</a>
            </Col>
            <Col sm=8>
                <ButtonToolbar className='pull-right'>
                    <Button
                        bsStyle  = 'primary'
                        onClick  = {=>(@submit_create_subscription();@props.on_close())}
                        disabled = {@state.selected_plan is ''} >
                        Add Subscription
                    </Button>
                    <Button onClick={@props.on_close}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render : ->
        <Row>
            <Col sm=10 smOffset=1>
                <Well style={boxShadow:'5px 5px 5px lightgray', position:'absolute', zIndex:1}>
                    {@render_create_subscription_options()}
                    {@render_create_subscription_buttons()}
                </Well>
            </Col>
        </Row>


exports.SubscriptionGrid = SubscriptionGrid = rclass
    propTypes :
        both   : rtypes.bool
        period : rtypes.string.isRequired  # see docs for PlanInfo

    shouldComponentUpdate : -> false  # schema never changes

    render_cols : (row, ncols) ->
        width = 12/ncols
        for plan in row
            <Col sm={width} key={plan}>
                <PlanInfo plan={plan} period={@props.period} on_click={=>console.log('clicked ' + plan)}/>
            </Col>

    render_rows : (live_subscriptions, ncols) ->
        for i, row of live_subscriptions
            <Row key={i}>
                {@render_cols(row, ncols)}
            </Row>

    render : ->
        live_subscriptions = PROJECT_UPGRADES.live_subscriptions
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



Subscription = rclass
    displayName : 'Subscription'

    propTypes :
        flux         : rtypes.object.isRequired
        subscription : rtypes.object.isRequired

    getInitialState : ->
        confirm_cancel : false

    cancel_subscription : ->
        @props.flux.getActions('billing').cancel_subscription(@props.subscription.id)

    quantity : ->
        q = @props.subscription.quantity
        if q > 1
            return "#{q} × "

    render_info : ->
        sub = @props.subscription
        <Row style={paddingBottom: '5px', paddingTop:'5px'}>
            <Col md=4>
                {@quantity()} {sub.plan.name} ({misc.stripe_amount(sub.plan.amount, sub.plan.currency)}/{sub.plan.interval})
            </Col>
            <Col md=2>
                {misc.capitalize(sub.status)}
            </Col>
            <Col md=4>
                {misc.stripe_date(sub.current_period_start)} – {misc.stripe_date(sub.current_period_end)} (start: {misc.stripe_date(sub.start)})
            </Col>
            <Col md=2>
                <Button style={float:'right'} onClick={=>@setState(confirm_cancel:true)} disabled={@state.cancelling} >Cancel</Button>
            </Col>
        </Row>

    render_confirm : ->
        if not @state.confirm_cancel
            return
        <Row style={borderBottom:'1px solid #999', paddingBottom:'5px'}>
            <Col md=5 mdOffset=1>
                Are you sure you want to cancel this subscription?
            </Col>
            <Col md=6>
                <ButtonToolbar>
                    <Button onClick={=>@setState(confirm_cancel:false)}>No, do NOT cancel</Button>
                    <Button bsStyle='danger' onClick={=>@setState(confirm_cancel:false);@cancel_subscription()}>Yes, Cancel Subscription</Button>
                </ButtonToolbar>
            </Col>
        </Row>


    render : ->
        <div style={borderBottom:'1px solid #999',  paddingTop: '5px', paddingBottom: '5px'}>
            {@render_info()}
            {@render_confirm() if @state.confirm_cancel}
        </div>

Subscriptions = rclass
    displayName : 'Subscriptions'

    propTypes :
        flux          : rtypes.object.isRequired
        subscriptions : rtypes.object
        sources       : rtypes.object.isRequired

    getInitialState : ->
        state : 'view'    # view -> add_new ->         # TODO

    render_add_subscription_button : ->
        <Button
            bsStyle   = 'primary'
            disabled  = {@state.state isnt 'view' or @props.sources.total_count is 0}
            onClick   = {=>@setState(state : 'add_new')}
            className = 'pull-right' >
            <Icon name='plus-circle' /> Add a subscription...
        </Button>

    render_add_subscription : ->
        <AddSubscription
            on_close = {=>@setState(state : 'view')}
            actions  = {@props.flux.getActions('billing')} />

    render_header : ->
        <Row>
            <Col sm=6>
                <Icon name='list-alt' /> Subscriptions
            </Col>
            <Col sm=6>
                {@render_add_subscription_button()}
            </Col>
        </Row>

    render_subscriptions : ->
        for sub in @props.subscriptions.data
            <Subscription key={sub.id} subscription={sub} flux={@props.flux} />

    render : ->
        <Panel header={@render_header()}>
            {@render_add_subscription() if @state.state is 'add_new'}
            {@render_subscriptions()}
        </Panel>

Invoice = rclass
    displayName : "Invoice"

    propTypes :
        invoice : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    getInitialState : ->
        hide_line_items : true

    download_invoice : (e) ->
        e.preventDefault()
        invoice = @props.invoice
        username = @props.flux.getStore('account').get_username()
        misc_page = require('misc_page')  # do NOT require at top level, since code in billing.cjsx may be used on backend
        misc_page.download_file("/invoice/sagemathcloud-#{username}-receipt-#{new Date(invoice.date*1000).toISOString().slice(0,10)}-#{invoice.id}.pdf")

    render_paid_status : ->
        if @props.invoice.paid
            return <span>PAID</span>
        else
            return <span style={color:'red'}>UNPAID</span>

    render_description : ->
        if @props.invoice.description
            return <span>{@props.invoice.description}</span>

    render_line_description : (line) ->
        v = []
        if line.quantity > 1
            v.push("#{line.quantity} × ")
        if line.description?
            v.push(line.description)
        if line.plan?
            v.push(line.plan.name)
            v.push(" (start: #{misc.stripe_date(line.plan.created)})")
        return v

    render_line_item : (line, n) ->
        <Row key={line.id} style={borderBottom:'1px solid #aaa'}>
            <Col sm=1>
                {n}.
            </Col>
            <Col sm=9>
                {@render_line_description(line)}
            </Col>
            <Col sm=2>
                {render_amount(line.amount, @props.invoice.currency)}
            </Col>
        </Row>

    render_tax : ->
        <Row key='tax' style={borderBottom:'1px solid #aaa'}>
            <Col sm=1>
            </Col>
            <Col sm=9>
                WA State Sales Tax ({@props.invoice.tax_percent}%)
            </Col>
            <Col sm=2>
                {render_amount(@props.invoice.tax, @props.invoice.currency)}
            </Col>
        </Row>

    render_line_items : ->
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

    render : ->
        <Row style={borderBottom:'1px solid #999'}>
            <Col md=1>
                {render_amount(@props.invoice.amount_due, @props.invoice.currency)}
            </Col>
            <Col md=1>
                {@render_paid_status()}
            </Col>
            <Col md=3>
                {misc.stripe_date(@props.invoice.date)}
            </Col>
            <Col md=6>
                {@render_description()}
                {@render_line_items()}
            </Col>
            <Col md=1>
                <a onClick={@download_invoice} href=""><Icon name="cloud-download" /></a>
            </Col>
        </Row>

InvoiceHistory = rclass
    displayName : "InvoiceHistory"

    propTypes :
        flux     : rtypes.object.isRequired
        invoices : rtypes.object

    render_header : ->
        <span>
            <Icon name="list-alt" /> Invoices and Receipts
        </span>

    render_invoices : ->
        if not @props.invoices?
            return
        for invoice in @props.invoices.data
            <Invoice key={invoice.id} invoice={invoice} flux={@props.flux} />

    render : ->
        <Panel header={@render_header()}>
            {@render_invoices()}
        </Panel>

BillingPage = rclass
    displayName : "BillingPage"

    propTypes :
        customer : rtypes.object
        invoices : rtypes.object
        error    : rtypes.string
        action   : rtypes.string
        loaded   : rtypes.bool
        flux     : rtypes.object

    render_action : ->
        if @props.action
            <ActivityDisplay activity ={[@props.action]}/>

    render_error : ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                onClose = {=>@props.flux.getActions('billing').clear_error()} />

    render_page : ->
        if not @props.loaded
            # nothing loaded yet from backend
            <Loading />
        else if not @props.customer?
            # user not initialized yet -- only thing to do is add a card.
            <div>
                <PaymentMethods flux={@props.flux} sources={data:[]} default='' />
            </div>
        else
            # data loaded and customer exists
            <div>
                <PaymentMethods flux={@props.flux} sources={@props.customer.sources} default={@props.customer.default_source} />
                <Subscriptions subscriptions={@props.customer.subscriptions} sources={@props.customer.sources} flux={@props.flux} />
                <InvoiceHistory invoices={@props.invoices} flux={@props.flux} />
            </div>

    render : ->
        if not Stripe?
            return <div>Stripe is not available...</div>
        <div>
            {@render_action()}
            {@render_error()}
            {@render_page()}
        </div>

render = (flux) ->
    connect_to =
        customer : 'billing'
        invoices : 'billing'
        error    : 'billing'
        action   : 'billing'
        loaded   : 'billing'
    <Flux flux={flux} connect_to={connect_to} >
        <BillingPage />
    </Flux>

is_mounted = false
exports.render_billing = (dom_node, flux) ->
    React.render(render(flux), dom_node)
    is_mounted = true

exports.unmount = (dom_node) ->
    #console.log("unmount billing settings")
    if is_mounted
        React.unmountComponentAtNode(dom_node)
        is_mounted = false

render_amount = (amount, currency) ->
    <div style={float:'right'}>{misc.stripe_amount(amount, currency)}</div>

brand_to_icon = (brand) ->
    if brand in ['discover', 'mastercard', 'visa'] then "cc-#{brand}" else "credit-card"

COUNTRIES = ",United States,Canada,Spain,France,United Kingdom,Germany,Russia,Colombia,Mexico,Italy,Afghanistan,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua and Barbuda,Argentina,Armenia,Aruba,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Bouvet Island,Brazil,British Indian Ocean Territory,British Virgin Islands,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,China,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Cook Islands,Costa Rica,Cote d'Ivoire,Croatia,Cuba,Cyprus,Czech Republic,Democratic Republic of The Congo,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Ethiopia,Falkland Islands,Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,French Southern and Antarctic Lands,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Heard Island and McDonald Islands,Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Macao,Macedonia,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Micronesia,Moldova,Monaco,Mongolia,Montenegro,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,North Korea,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn Islands,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Rwanda,Saint Helena,Saint Kitts and Nevis,Saint Lucia,Saint Pierre and Miquelon,Saint Vincent and The Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Georgia and The South Sandwich Islands,South Korea,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Svalbard and Jan Mayen,Swaziland,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Timor-Leste,Togo,Tokelau,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Turks and Caicos Islands,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,United States Minor Outlying Islands,Uruguay,Uzbekistan,Vanuatu,Vatican City,Venezuela,Vietnam,Wallis and Futuna,Western Sahara,Yemen,Zambia,Zimbabwe".split(',')

STATES = {'':'',AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',AS:'American Samoa',DC:'District of Columbia',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',VI:'United States Virgin Islands'}