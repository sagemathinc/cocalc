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
misc      = require('smc-util/misc')

{redux, rclass, React, ReactDOM, rtypes, Redux, Actions, Store}  = require('./smc-react')

{Button, ButtonToolbar, Input, Row, Col, Panel, Well, Alert, ButtonGroup} = require('react-bootstrap')
{ActivityDisplay, ErrorDisplay, Icon, Loading, SelectorInput, r_join, Space, Tip} = require('./r_misc')
{HelpEmailLink} = require('./customize')

{PROJECT_UPGRADES} = require('smc-util/schema')

actions = store = undefined
# Create the billing actions
class BillingActions extends Actions
    clear_error: =>
        @setState(error:'')

    update_customer: (cb) =>
        if not Stripe?
            cb?("stripe not available")
            return
        if @_update_customer_lock then return else @_update_customer_lock=true
        @setState(action:"Updating billing information")
        customer_is_defined = false
        {salvus_client} = require('./salvus_client')   # do not put at top level, since some code runs on server
        async.series([
            (cb) =>
                salvus_client.stripe_get_customer
                    cb : (err, resp) =>
                        @_update_customer_lock = false
                        if not err and not resp?.stripe_publishable_key?
                            err = "WARNING: Stripe is not configured -- billing not available"
                        if not err
                            Stripe.setPublishableKey(resp.stripe_publishable_key)
                            @setState(customer: resp.customer, loaded:true)
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
                                @setState(invoices: invoices)
                            cb(err)
        ], (err) =>
            @setState(error:err, action:'')
            cb?(err)
        )


    _action: (action, desc, opts) =>
        @setState(action: desc)
        cb = opts.cb
        opts.cb = (err) =>
            @setState(action:'')
            if err
                @setState(error:err)
                cb?(err)
            else
                @update_customer(cb)
        {salvus_client} = require('./salvus_client')   # do not put at top level, since some code runs on server
        salvus_client["stripe_#{action}"](opts)

    clear_action: =>
        @setState(action:"", error:"")

    delete_payment_method: (id, cb) =>
        @_action('delete_source', 'Deleting a payment method', {card_id:id, cb:cb})

    set_as_default_payment_method: (id, cb) =>
        @_action('set_default_source', 'Setting payment method as default', {card_id:id, cb:cb})

    submit_payment_method: (info, cb) =>
        response = undefined
        async.series([
            (cb) =>  # see https://stripe.com/docs/stripe.js#createToken
                @setState(action:"Creating a new payment method -- get token from Stripe")
                Stripe.card.createToken info, (status, _response) =>
                    if status != 200
                        cb(_response.error.message)
                    else
                        response = _response
                        cb()
            (cb) =>
                @_action('create_source', 'Creating a new payment method (sending token to SageMathCloud)', {token:response.id, cb:cb})
        ], (err) =>
            @setState(action:'', error:err)
            cb?(err)
        )

    cancel_subscription: (id) =>
        @_action('cancel_subscription', 'Cancel a subscription', subscription_id : id)

    create_subscription : (plan='standard') =>
        @_action('create_subscription', 'Create a subscription', plan : plan)

actions = redux.createActions('billing', BillingActions)
store   = redux.createStore('billing')

validate =
    valid   : {border:'1px solid green'}
    invalid : {border:'1px solid red'}

AddPaymentMethod = rclass
    displayName : "AddPaymentMethod"

    propTypes :
        redux    : rtypes.object.isRequired
        on_close : rtypes.func.isRequired  # called when this should be closed

    getInitialState : ->
        new_payment_info : {name : @props.redux.getStore('account').get_fullname()}
        submitting       : false
        error            : ''
        cvc_help         : false

    submit_payment_method : ->
        @setState(error: false, submitting:true)
        @props.redux.getActions('billing').submit_payment_method @state.new_payment_info, (err) =>
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
        <div>
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
            <div style={color:"#666", marginTop:'15px'}>
                (Using PayPal is also possible -- email <HelpEmailLink/>.)
            </div>
        </div>

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
                <Space/><Space/>
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
        redux   : rtypes.object.isRequired
        sources : rtypes.object.isRequired
        default : rtypes.string

    getInitialState : ->
        state : 'view'   #  'delete' <--> 'view' <--> 'add_new'
        error : ''

    add_payment_method : ->
        @setState(state:'add_new')

    render_add_payment_method : ->
        if @state.state == 'add_new'
            <AddPaymentMethod redux={@props.redux} on_close={=>@setState(state:'view')} />

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
        @props.redux.getActions('billing').set_as_default_payment_method(id)

    delete_method : (id) ->
        @props.redux.getActions('billing').delete_payment_method(id)

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
                </span><Space/>
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
                </span> <Space/>
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render : ->
        free = require('smc-util/schema').DEFAULT_QUOTAS
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
                </span>
                <Space/>
                <span style={color:'#999'}>
                    {data.display}
                </span>
            </Tip>
        </div>

    render_cost: (price, period) ->
        period = PROJECT_UPGRADES.period_names[period] ? period
        <span key={period}>
            <span style={fontSize:'16px', verticalAlign:'super'}>$</span><Space/>
            <span style={fontSize:'30px'}>{price}</span>
            <span style={fontSize:'14px'}> / {period}</span>
        </span>

    render_header : (prices, periods) ->
        sep = <span style={marginLeft:'10px', marginRight:'10px'}>or</span>
        <h3 style={textAlign:'center'}>
            {r_join((@render_cost(prices[i], periods[i]) for i in [0...prices.length]), sep)}
        </h3>

    render_plan_name : (plan_data) ->
        if @props.on_click?
            <Button bsStyle={if @props.selected then 'primary'}>
                <Icon name={plan_data.icon} /> {"#{misc.capitalize(@props.plan).replace(/_/g,' ')} plan..."}
            </Button>
        else
            <div>
                <Icon name={plan_data.icon} /> <span style={fontWeight:'bold'}>{misc.capitalize(@props.plan).replace(/_/g,' ')} plan</span>
            </div>

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
            className = 'smc-grow'
            header    = {@render_header(prices, periods)}
            bsStyle   = {if @props.selected then 'primary' else 'info'}
            onClick   = {=>@props.on_click?()}
        >
            Upgrades that you may distribute to your projects<br/><br/>

            {@render_plan_info_line(name, benefits[name] ? 0, params[name]) for name in PROJECT_UPGRADES.field_order when benefits[name]}

            <div style={textAlign : 'center', marginTop:'10px'}>
                {@render_plan_name(plan_data)}
            </div>

        </Panel>

AddSubscription = rclass
    displayName : 'AddSubscription'

    propTypes :
        on_close      : rtypes.func.isRequired
        selected_plan : rtypes.string
        actions       : rtypes.object.isRequired

    getDefaultProps : ->
        selected_plan : ''

    getInitialState : ->
        selected_button : 'month'

    submit_create_subscription : ->
        plan = @props.selected_plan
        @props.actions.create_subscription(plan)

    set_button_and_deselect_plans : (button) ->
        if @state.selected_button isnt button
            set_selected_plan('')
            @setState(selected_button : button)

    render_period_selection_buttons : ->
        <ButtonGroup bsSize='large' style={marginBottom:'20px'}>
            <Button
                bsStyle = {if @state.selected_button is 'month' then 'primary'}
                onClick = {=>@set_button_and_deselect_plans('month')}
            >
                Monthly subscriptions
            </Button>
            <Button
                bsStyle = {if @state.selected_button is 'year' then 'primary'}
                onClick = {=>@set_button_and_deselect_plans('year')}
            >
                Yearly subscriptions
            </Button>
            <Button
                bsStyle = {if @state.selected_button is 'month4' then 'primary'}
                onClick = {=>@set_button_and_deselect_plans('month4')}
            >
                Course (4-month) subscriptions
            </Button>
        </ButtonGroup>
        ### -- nobody ever even once requested info in over a month!!
            <Button
                bsStyle = {if @state.selected_button is 'dedicated_resources' then 'primary'}
                onClick = {=>@set_button_and_deselect_plans('dedicated_resources')}
            >
                Dedicated resources
            </Button>
        ###

    render_subscription_grid : ->
        <SubscriptionGrid period={@state.selected_button} selected_plan={@props.selected_plan} />

    render_dedicated_resources : ->
        <div style={marginBottom:'15px'}>
            <ExplainResources type='dedicated'/>
        </div>

    render_create_subscription_options : ->
        <div>
            <h3><Icon name='list-alt'/> Sign up for a Subscription</h3>
            <ExplainResources type='shared'/>
            <hr/>
            <div style={textAlign:'center'}>
                {@render_period_selection_buttons()}
            </div>
            {@render_subscription_grid()}
        </div>
        ###
            if @state.selected_button is 'month' or @state.selected_button is 'year'}
            {@render_dedicated_resources() if @state.selected_button is 'dedicated_resources'}
        ###

    render_create_subscription_confirm : ->
        <Alert bsStyle='primary' >
            <h4><Icon name='check' /> Confirm your selection </h4>
            <p>You have selected the <span style={fontWeight:'bold'}>{misc.capitalize(@props.selected_plan)} subscription</span>.</p>
            <p>By clicking 'Add Subscription' your payment card will be immediately charged and you will be signed
            up for a recurring subscription.</p>
        </Alert>

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
                        disabled = {@props.selected_plan is ''} >
                        <Icon name='check' /> Add Subscription
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
                    {@render_create_subscription_confirm() if @props.selected_plan isnt ''}
                    {@render_create_subscription_buttons()}
                </Well>
            </Col>
        </Row>


exports.SubscriptionGrid = SubscriptionGrid = rclass
    displayName : 'SubscriptionGrid'

    propTypes :
        period        : rtypes.string.isRequired  # see docs for PlanInfo
        selected_plan : rtypes.string
        is_static     : rtypes.bool    # used for display mode

    getDefaultProps : ->
        is_static : false

    is_selected : (plan, period) ->
        if @props.period is 'year'
            return @props.selected_plan is "#{plan}-year"
        else
            return @props.selected_plan is plan

    render_plan_info : (plan, period) ->
        <PlanInfo
            plan     = {plan}
            period   = {period}
            selected = {@is_selected(plan, period)}
            on_click = {if not @props.is_static then ->set_selected_plan(plan, period)} />

    render_cols : (row, ncols) ->
        width = 12/ncols
        for plan in row
            <Col sm={width} key={plan}>
                {@render_plan_info(plan, @props.period)}
            </Col>

    render_rows : (live_subscriptions, ncols) ->
        for i, row of live_subscriptions
            <Row key={i}>
                {@render_cols(row, ncols)}
            </Row>

    render : ->
        live_subscriptions = []
        for row in PROJECT_UPGRADES.live_subscriptions
            v = []
            for x in row
                if PROJECT_UPGRADES.membership[x].price[@props.period]
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

    render_shared: ->
        <div>
            <h4>Shared Resources</h4>
            <Row>
                <Col sm=6>

                    <p>
                    You may create many completely separate SageMathCloud projects.
                    The projects that run on
                    the general and members only servers
                    all share common disk space, CPU, and RAM.
                    They start with the free quotas below, and can be upgraded
                    up to the indicated bounds on the right.
                    </p>

                    <br/>

                    <p>When you purchase a subscription, you can upgrade the quotas on any projects
                    you use up to the amounts given by your subscription.  Multiple people can contribute
                    to increase the quotas on the same project, and may also remove their contributions
                    at any time.  You may also subscribe
                    more than once to increase the amount that you have available to
                    contribute to your projects.
                    </p>

                    <br/>
                    <p>
                    Immediately email us at <HelpEmailLink/> if anything is unclear to you.
                    </p>


                </Col>
                <Col sm=6>
                    <Row>
                        <Col xs=6>
                            <ProjectQuotaFreeTable/>
                        </Col>
                        <Col xs=6>
                            <ProjectQuotaBoundsTable/>
                        </Col>
                    </Row>
                </Col>
            </Row>
        </div>

    render_dedicated: ->
        <div>
            <h4>Dedicated Resources</h4>
            You may also rent dedicated computers.  Projects of your choice get full use of the
            disk, CPU and RAM of those computers, and these projects do not have to compete with
            other users for resources.   We have not fully automated
            purchase of dedicated computers yet, so please contact
            us at <HelpEmailLink/> if you need
            a dedicated computer.
        </div>

    render: ->
        switch @props.type
            when 'shared'
                return @render_shared()
            when 'dedicated'
                return @render_dedicated()
            else
                throw Error("unknown type #{@props.type}")


Subscription = rclass
    displayName : 'Subscription'

    propTypes :
        redux        : rtypes.object.isRequired
        subscription : rtypes.object.isRequired

    getInitialState : ->
        confirm_cancel : false

    cancel_subscription : ->
        @props.redux.getActions('billing').cancel_subscription(@props.subscription.id)

    quantity : ->
        q = @props.subscription.quantity
        if q > 1
            return "#{q} × "

    render_cancel_at_end : ->
        if @props.subscription.cancel_at_period_end
            <span style={marginLeft:'15px'}>Will cancel at period end.</span>

    render_info : ->
        sub = @props.subscription
        cancellable = not (sub.cancel_at_period_end or @state.cancelling or @state.confirm_cancel)
        <Row style={paddingBottom: '5px', paddingTop:'5px'}>
            <Col md=4>
                {@quantity()} {sub.plan.name} ({misc.stripe_amount(sub.plan.amount, sub.plan.currency)}/{sub.plan.interval})
            </Col>
            <Col md=2>
                {misc.capitalize(sub.status)}
            </Col>
            <Col md=4 style={color:'#666'}>
                {misc.stripe_date(sub.current_period_start)} – {misc.stripe_date(sub.current_period_end)} (start: {misc.stripe_date(sub.start)})
                {@render_cancel_at_end()}
            </Col>
            <Col md=2>
                {<Button style={float:'right'} onClick={=>@setState(confirm_cancel:true)}>Cancel...</Button> if cancellable}
            </Col>
        </Row>

    render_confirm : ->
        if not @state.confirm_cancel
            return
        <Row style={borderBottom:'1px solid #999', paddingBottom:'15px', paddingTop:'15px'}>
            <Col md=6>
                Are you sure you want to cancel this subscription?  If you cancel your subscription, it will run to the end of the subscription period, but will not be renewed when the current (already paid for) period ends; any upgrades provided by this subscription will be disabled.    If you need further clarification or need a refund, please email  <HelpEmailLink/>.
            </Col>
            <Col md=6>
                <Button onClick={=>@setState(confirm_cancel:false)}>Make no change</Button>
                <div style={float:'right'}>
                    <Button bsStyle='danger' onClick={=>@setState(confirm_cancel:false);@cancel_subscription()}>CANCEL: do not auto-renew my subscription</Button>
                </div>
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
        subscriptions : rtypes.object
        sources       : rtypes.object.isRequired
        selected_plan : rtypes.string
        redux         : rtypes.object.isRequired

    getInitialState : ->
        state : 'view'    # view -> add_new ->         # TODO

    render_add_subscription_button : ->
        <Button
            bsStyle   = 'primary'
            disabled  = {@state.state isnt 'view' or @props.sources.total_count is 0}
            onClick   = {=>@setState(state : 'add_new')}
            className = 'pull-right' >
            <Icon name='plus-circle' /> Add Subscription...
        </Button>

    render_add_subscription : ->
        # TODO: the #smc-billing-tab is to scroll back near the top of the page; will probably go away.
        <AddSubscription
            on_close      = {=>@setState(state : 'view'); set_selected_plan(''); $("#smc-billing-tab").scrollintoview()}
            selected_plan = {@props.selected_plan}
            actions       = {@props.redux.getActions('billing')} />

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
            <Subscription key={sub.id} subscription={sub} redux={@props.redux} />

    render : ->
        <Panel header={@render_header()}>
            {@render_add_subscription() if @state.state is 'add_new'}
            {@render_subscriptions()}
        </Panel>

Invoice = rclass
    displayName : "Invoice"

    propTypes :
        invoice : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    getInitialState : ->
        hide_line_items : true

    download_invoice : (e) ->
        e.preventDefault()
        invoice = @props.invoice
        username = @props.redux.getStore('account').get_username()
        misc_page = require('./misc_page')  # do NOT require at top level, since code in billing.cjsx may be used on backend
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
            v.push(" (start: #{misc.stripe_date(line.period.start)})")
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
        redux    : rtypes.object.isRequired
        invoices : rtypes.object

    render_header : ->
        <span>
            <Icon name="list-alt" /> Invoices and Receipts
        </span>

    render_invoices : ->
        if not @props.invoices?
            return
        for invoice in @props.invoices.data
            <Invoice key={invoice.id} invoice={invoice} redux={@props.redux} />

    render : ->
        <Panel header={@render_header()}>
            {@render_invoices()}
        </Panel>

BillingPage = rclass
    displayName : 'BillingPage'

    reduxProps :
        billing :
            customer      : rtypes.object
            invoices      : rtypes.object
            error         : rtypes.string
            action        : rtypes.string
            loaded        : rtypes.bool
            selected_plan : rtypes.string

    propTypes :
        redux : rtypes.object

    render_action : ->
        if @props.action
            <div style={position:'relative', top:'-70px'}>   {# probably ActivityDisplay should manage its own position better. }
                <ActivityDisplay activity ={[@props.action]} on_clear={=>@props.redux.getActions('billing').clear_action()} />
            </div>

    render_error : ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                onClose = {=>@props.redux.getActions('billing').clear_error()} />

    render_suggested_next_step: ->
        cards    = @props.customer?.sources?.total_count ? 0
        subs     = @props.customer?.subscriptions?.total_count ? 0
        invoices = @props.invoices?.data?.length ? 0
        console.log(cards, subs, invoices)
        if cards == 0
            if subs == 0
                # no payment sources yet; no subscriptions either: a new user (probably)
                <span>
                    Click "Add Payment Method..." to add your credit card, then
                    click "Add Subscription..." and
                    choose from either a monthly, yearly or semester-long plan.
                    You will <b>not be charged</b> until you select a specific subscription then click
                    "Add Subscription".
                    If you have any questions at all, email <HelpEmailLink /> immediately.
                </span>
            else
                # subscriptions but they deleted their card.
                <span>
                    Click "Add Payment Method..." to add a credit card so you can
                    purchase or renew your subscriptions.  Without a credit card
                    any current subscriptions will run to completion, but will not renew.
                    If you have any questions about subscriptions or billing (e.g., about
                    using PayPal instead), please email <HelpEmailLink /> immediately.
                </span>

        else if subs == 0
            # have a payment source, but no subscriptions
            <span>
                Click "Add Subscription...", then
                choose from either a monthly, yearly or semester-long plan (you may sign up for the
                same subscription more than once to increase the number of upgrades).
                You will be charged only after you select a specific subscription and click
                "Add Subscription".
                If you have any questions, email <HelpEmailLink /> immediately.
            </span>
        else if invoices == 0
            # have payment source, subscription, but no invoices yet
            <span>
                Sign up for the same subscription package more than
                once to increase the number of upgrades that you can use.
                If you have any questions, email <HelpEmailLink /> immediately.
            </span>
        else
            # have payment source, subscription, and at least one invoice
            <span>
                You may sign up for the same subscription package more than
                once to increase the number of upgrades that you can use.
                Past invoices and receipts are also available below.
                If you have any questions, email <HelpEmailLink /> immediately.
            </span>

    render_info_link: ->
        <div style={marginTop:'1em', marginBottom:'1em', color:"#666"}>
            We offer many <a href={window.smc_base_url + '/policies/pricing.html'} target='_blank'> pricing and subscription options</a>.
            <Space/>
            {@render_suggested_next_step()}
        </div>

    render_page : ->
        if not @props.loaded
            # nothing loaded yet from backend
            <Loading />
        else if not @props.customer?
            # user not initialized yet -- only thing to do is add a card.
            <div>
                <PaymentMethods redux={@props.redux} sources={data:[]} default='' />
            </div>
        else
            # data loaded and customer exists
            <div>
                <PaymentMethods redux={@props.redux} sources={@props.customer.sources} default={@props.customer.default_source} />
                <Subscriptions
                    subscriptions = {@props.customer.subscriptions}
                    sources       = {@props.customer.sources}
                    selected_plan = {@props.selected_plan}
                    redux         = {@props.redux} />
                <InvoiceHistory invoices={@props.invoices} redux={@props.redux} />
            </div>

    render : ->
        if not Stripe?
            return <div>Stripe is not available...</div>
        <div>
            {@render_action()}
            {@render_error()}
            {@render_info_link()}
            {@render_page()}
        </div>

exports.BillingPageRedux = rclass
    displayName : 'BillingPage-redux'

    render : ->
        <Redux redux={redux}>
            <BillingPage redux={redux} />
        </Redux>

render_amount = (amount, currency) ->
    <div style={float:'right'}>{misc.stripe_amount(amount, currency)}</div>

brand_to_icon = (brand) ->
    if brand in ['discover', 'mastercard', 'visa'] then "cc-#{brand}" else "credit-card"

COUNTRIES = ",United States,Canada,Spain,France,United Kingdom,Germany,Russia,Colombia,Mexico,Italy,Afghanistan,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua and Barbuda,Argentina,Armenia,Aruba,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Bouvet Island,Brazil,British Indian Ocean Territory,British Virgin Islands,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,China,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Cook Islands,Costa Rica,Cote d'Ivoire,Croatia,Cuba,Cyprus,Czech Republic,Democratic Republic of The Congo,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Ethiopia,Falkland Islands,Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,French Southern and Antarctic Lands,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-Bissau,Guyana,Haiti,Heard Island and McDonald Islands,Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Macao,Macedonia,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Micronesia,Moldova,Monaco,Mongolia,Montenegro,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,North Korea,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn Islands,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Rwanda,Saint Helena,Saint Kitts and Nevis,Saint Lucia,Saint Pierre and Miquelon,Saint Vincent and The Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Georgia and The South Sandwich Islands,South Korea,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Svalbard and Jan Mayen,Swaziland,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Timor-Leste,Togo,Tokelau,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Turks and Caicos Islands,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,United States Minor Outlying Islands,Uruguay,Uzbekistan,Vanuatu,Vatican City,Venezuela,Vietnam,Wallis and Futuna,Western Sahara,Yemen,Zambia,Zimbabwe".split(',')

STATES = {'':'',AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',AS:'American Samoa',DC:'District of Columbia',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',VI:'United States Virgin Islands'}


# TODO: make this an action and a getter in the BILLING store
set_selected_plan = (plan, period) ->
    if period is 'year'
        redux.getActions('billing').setState(selected_plan : "#{plan}-year")
    else
        redux.getActions('billing').setState(selected_plan : plan)

exports.render_static_pricing_page = () ->
    <div>
        <ExplainResources type='shared'/>

        <br/> <br/>
        <SubscriptionGrid period='month'  is_static={true}/>

        <br/> <br/>
        <SubscriptionGrid period='year'  is_static={true}/>

        <br/> <br/>

        <SubscriptionGrid period='month4'  is_static={true}/>

    </div>

exports.visit_billing_page = ->
    require('./history').load_target('settings/billing')

exports.BillingPageLink = (opts) ->
    {text} = opts
    if not text
        text = "billing page"
    return <a onClick={exports.visit_billing_page} style={cursor:'pointer'}>{text}</a>