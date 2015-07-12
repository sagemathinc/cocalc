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
misc_page = require('misc_page')

{rclass, React, rtypes, FluxComponent, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, SelectorInput} = require('r_misc')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.

actions = store = undefined
init_flux = (flux) ->
    # Create the billing actions
    class BillingActions extends Actions
        setTo: (payload) => payload

        clear_error: => @setTo(error:'')

        update_customer: (cb) =>
            if @_update_customer_lock then return else @_update_customer_lock=true
            @setTo(action:"Updating billing information")
            async.parallel([
                (cb) =>
                    salvus_client.stripe_get_customer
                        cb : (err, resp) =>
                            @_update_customer_lock = false
                            if not err
                                Stripe.setPublishableKey(resp.stripe_publishable_key)
                                @setTo(customer: resp.customer)
                            cb(err)
                (cb) =>
                    salvus_client.stripe_get_invoices
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

        cancel_subscription: (id, cb) =>
            @_action('cancel_subscription', "Cancel a subscription", {subscription_id:id, cb:cb})

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

    store = flux.createStore('billing', BillingStore, flux)

validate =
    valid   : {border:'1px solid green'}
    invalid : {border:'1px solid red'}

AddPaymentMethod = rclass
    displayName : "AddPaymentMethod"
    propTypes:
        flux     : rtypes.object.isRequired
        on_close : rtypes.func.isRequired  # called when this should be closed

    getInitialState: ->
        new_payment_info : {name : @props.flux.getStore('account').get_fullname()}
        submitting       : false
        error            : ''

    submit_payment_method: ->
        @setState(error: false, submitting:true)
        @props.flux.getActions('billing').submit_payment_method @state.new_payment_info, (err) =>
            @setState(error: err, submitting:false)
            if not err
                @props.on_close()

    render_payment_method_field: (field, control) ->
        if field == 'State' and @state.new_payment_info.address_country != "United States"
            return
        <Row key={field}>
            <Col xs=4>
                {field}
            </Col>
            <Col xs=8>
                {control}
            </Col>
        </Row>

    set_input_info: (field, ref, value) ->
        x = misc.copy(@state.new_payment_info)
        x[field] = value ? @refs[ref].getValue()
        @setState(new_payment_info: x)

    render_input_card_number: ->
        type  = $.payment.cardType(@state.new_payment_info.number)
        icon  = if type in ['discover', 'mastercard', 'visa'] then "cc-#{type}" else "credit-card"
        value = if @valid('number') then $.payment.formatCardNumber(@state.new_payment_info.number) else @state.new_payment_info.number
        <Input autoFocus
               ref         = "input_card_number"
               style       = @style('number')
               type        = "text"
               size        = "20"
               placeholder = "1234 5678 9012 3456"
               value       = {value}
               onChange    = {=>@set_input_info('number','input_card_number')}
               buttonAfter = {<Button><Icon name={icon} /></Button>}
        />

    render_input_cvc: ->
        <Input ref='input_cvc'
            style    = {misc.merge({width:"5em"}, @style('cvc'))}
            type     = "text" size=4
            placeholder = "···"
            onChange = {=>@set_input_info("cvc", 'input_cvc')}
        />

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

    style: (name) ->
        a = @valid(name)
        if not a?
            return {}
        else if a == true
            return validate.valid
        else
            return validate.invalid

    render_input_expiration: ->
        that = @
        <span>
            <input
                readOnly  = {@state.submitting}
                className = "form-control"
                style     = {misc.merge({display:'inline', width:'5em'}, @style('exp_month'))}
                placeholder="MM" type="text" size="2"
                onChange={(e)=>@set_input_info("exp_month", undefined, e.target.value)}
            />
            <span> / </span>
            <input
                className = "form-control"
                style     = {misc.merge({display:'inline', width:'5em'}, @style('exp_year'))}
                placeholder="YY" type="text" size="2"
                onChange={(e)=>@set_input_info("exp_year", undefined, e.target.value)}
            />
        </span>

    render_input_name: ->
        <Input ref='input_name' type="text" placeholder="Name on Card"
               onChange={=>@set_input_info("name", 'input_name')}
               style={@style('name')}
               value={@state.new_payment_info.name}
               />

    render_input_country: ->
        <SelectorInput
            options   = {COUNTRIES}
            on_change = {(country)=>@set_input_info("address_country", "", country)}
        />

    render_input_zip: ->
        <Input ref='input_address_zip'
               style={@style('address_zip')}
               placeholder="Zip Code" type="text" size="5" pattern="\d{5,5}(-\d{4,4})?"
               onChange={=>@set_input_info("address_zip", 'input_address_zip')}
        />

    render_input_state_zip: ->
        <Row>
            <Col xs=7>
                <SelectorInput
                    options   = {STATES}
                    on_change = {(state)=>@set_input_info("address_state", "", state)}
                />
            </Col>
            <Col xs=5>
                {@render_input_zip()}
            </Col>
        </Row>

    render_payment_method_fields: ->
        PAYMENT_METHOD_FORM =
            "Card Number"        : @render_input_card_number
            "CVC"                : @render_input_cvc
            "Expiration (MM/YY)" : @render_input_expiration
            "Name on Card"       : @render_input_name
            "Country"            : @render_input_country
            "State"              : @render_input_state_zip

        for field, control of PAYMENT_METHOD_FORM
            @render_payment_method_field(field, control())

    render_payment_method_buttons: ->
        <Row>
            <Col xs=4>
                Powered by Stripe
            </Col>
            <Col xs=8>
                <ButtonToolbar style={float: "right"}>
                    <Button onClick={@props.on_close}>Cancel</Button>
                    <Button onClick={@submit_payment_method} bsStyle='primary' disabled={not @valid()}>Add Credit Card</Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render: ->
        <Row>
            <Col xs=8 xsOffset=2>
                <Well>
                    {@render_error()}
                    {@render_payment_method_fields()}
                    {@render_payment_method_buttons()}
                </Well>
            </Col>
        </Row>


#address_city: nulladdress_country: "United States"address_line1: nulladdress_line1_check: nulladdress_line2: nulladdress_state: "WA"address_zip: "98122"address_zip_check: "pass"brand: "Diners Club"country: nullcustomer: "cus_6TzOs3X3oawJxr"cvc_check: "pass"dynamic_last4: nullexp_month: 2exp_year: 2020fingerprint: "ukp9e1Ie0rPtwrXy"funding: "credit"id: "card_16MMxEGbwvoRbeYxoQoOUyno"last4: "5904"metadata: Object__proto__: Objectname: "William Stein"object: "card"tokenization_method: null__proto__: Object1: Objectlength: 2__proto__: Array[0]has_more: falseobject: "list"total_count: 2url: "/v1/customers/cus_6TzOs3X3oawJxr/sources"__proto__: Objectsubscriptions: Object__proto__: Object__proto__: Object


PaymentMethod = rclass
    displayName : "PaymentMethod"
    propTypes:
        source         : rtypes.object.isRequired
        default        : rtypes.bool.isRequired
        set_as_default : rtypes.func.isRequired   # called when this card should be set to default
        delete_method  : rtypes.func.isRequired   # called when this card should be deleted

    getInitialState: ->
        confirm_default : false
        confirm_delete  : false

    icon_name: ->
        return 'cc-discover' # TODO

    render_confirm_default: ->
        <Row>
            <Col xsoffset=2 xs=7>
                Are you sure you want to set this payment method to be the default for invoices?
            </Col>
            <Col xs=3>
                <ButtonToolbar style={float: "right"}>
                    <Button onClick={=>@setState(confirm_default:false)}>Cancel</Button>
                    <Button onClick={=>@setState(confirm_default:false);@props.set_as_default()} bsStyle='warning'>
                        <Icon name='trash'/> Set to Default
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_confirm_delete: ->
        <Row>
            <Col xsoffset=2 xs=7>
                Are you sure you want to delete this payment method?
            </Col>
            <Col xs=3>
                <ButtonToolbar style={float: "right"}>
                    <Button onClick={=>@setState(confirm_delete:false)}>Cancel</Button>
                    <Button bsStyle='danger' onClick={=>@setState(confirm_delete:false);@props.delete_method()}>
                        <Icon name='trash'/> Delete Payment Method
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_card: ->
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
                        onClick={=>@setState(confirm_default:true)}
                        disabled={@props.default}
                        bsStyle={if @props.default then 'primary' else 'default'}>
                        Default
                    </Button>
                    <Button onClick={=>@setState(confirm_delete:true)}>
                        <Icon name="trash" /> Delete
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render: ->
        <Row style={borderBottom:'1px solid #999',  paddingTop: '5px', paddingBottom: '5px'}>
            {@render_card()}
            {@render_confirm_default() if @state.confirm_default}
            {@render_confirm_delete()  if @state.confirm_delete}
        </Row>


PaymentMethods = rclass
    displayName : "PaymentMethods"
    propTypes:
        flux    : rtypes.object.isRequired
        sources : rtypes.object.isRequired
        default : rtypes.string

    getInitialState: ->
        state : 'view'   #  'delete' <--> 'view' <--> 'add_new'
        error : ''

    add_payment_method: ->
        @setState(state:'add_new')

    render_add_payment_method: ->
        if @state.state == 'add_new'
            <AddPaymentMethod flux={@props.flux} on_close={=>@setState(state:'view')} />

    render_add_payment_method_button: ->
        <Button disabled={@state.state != 'view'} onClick={@add_payment_method} bsStyle='primary' style={float: "right"}>
            <Icon name="plus-circle" /> Add Payment Method...
        </Button>

    render_header: ->
        <Row>
            <Col xs=6>
                <Icon name="credit-card" /> Payment Methods
            </Col>
            <Col xs=6>
                {@render_add_payment_method_button()}
            </Col>
        </Row>

    set_as_default: (id) ->
        @props.flux.getActions('billing').set_as_default_payment_method(id)

    delete_method: (id) ->
        @props.flux.getActions('billing').delete_payment_method(id)

    render_payment_method: (source) ->
        <PaymentMethod key = {source.id}
            source         = {source}
            default        = {source.id==@props.default}
            set_as_default = {=>@set_as_default(source.id)}   # closure -- must be in separate function from below
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

Subscription = rclass
    displayName : "Subscription"
    propTypes:
        flux         : rtypes.object.isRequired
        subscription : rtypes.object.isRequired

    getInitialState: ->
        confirm_cancel: false

    cancel_subscription: ->
        @props.flux.getActions('billing').cancel_subscription(@props.subscription.id)

    quantity: ->
        q = @props.subscription.quantity
        if q > 1
            return "#{q} × "

    render_info: ->
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

    render_confirm: ->
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

    render: ->
        <div>
            {@render_info()}
            {@render_confirm() if @state.confirm_cancel}
        </div>

Subscriptions = rclass
    displayName : "Subscriptions"
    propTypes:
        flux          : rtypes.object.isRequired
        subscriptions : rtypes.object
    render_header: ->
        <span>
            <Icon name="list-alt" /> Subscriptions
        </span>

    render_subscriptions: ->
        for sub in @props.subscriptions.data
            <Subscription key={sub.id} subscription={sub} flux={@props.flux} />

    render: ->
        <Panel header={@render_header()}>
            {@render_subscriptions()}
        </Panel>

Invoice = rclass
    displayName : "Invoice"

    propTypes:
        invoice : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    getInitialState: ->
        hide_line_items : true

    download_invoice: (e) ->
        e.preventDefault()
        invoice = @props.invoice
        username = @props.flux.getStore('account').get_username()
        misc_page.download_file("/invoice/sagemathcloud-#{username}-receipt-#{new Date(invoice.date*1000).toISOString().slice(0,10)}-#{invoice.id}.pdf")

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
            v.push(" (start: #{misc.stripe_date(line.plan.created)})")
        return v

    render_line_item: (line, n) ->
        <Row key={line.id} style={borderBottom:'1px solid #aaa'}>
            <Col xs=1>
                {n}.
            </Col>
            <Col xs=9>
                {@render_line_description(line)}
            </Col>
            <Col xs=2>
                {render_amount(line.amount, @props.invoice.currency)}
            </Col>
        </Row>

    render_tax: ->
        <Row key='tax' style={borderBottom:'1px solid #aaa'}>
            <Col xs=1>
            </Col>
            <Col xs=9>
                WA State Sales Tax ({@props.invoice.tax_percent}%)
            </Col>
            <Col xs=2>
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
    propTypes:
        flux     : rtypes.object.isRequired
        invoices : rtypes.object

    render_header: ->
        <span>
            <Icon name="list-alt" /> Invoices and Receipts
        </span>

    render_invoices: ->
        if not @props.invoices?
            return
        for invoice in @props.invoices.data
            <Invoice key={invoice.id} invoice={invoice} flux={@props.flux} />

    render: ->
        <Panel header={@render_header()}>
            {@render_invoices()}
        </Panel>

BillingPage = rclass
    displayName : "BillingPage"
    propTypes:
        customer : rtypes.object
        invoices : rtypes.object
        error    : rtypes.string

    render_action: ->
        if @props.action
            <div style={float:'right'}>
                <Icon name="circle-o-notch" spin /> {@props.action}
            </div>

    render_error: ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                onClose = {=>@props.flux.getActions('billing').clear_error()} />

    render_page: ->
        if not @props.customer
            <Loading />
        else
            <div>
                <PaymentMethods flux={@props.flux} sources={@props.customer.sources} default={@props.customer.default_source} />
                <Subscriptions subscriptions={@props.customer.subscriptions} flux={@props.flux} />
                <InvoiceHistory invoices={@props.invoices} flux={@props.flux} />
            </div>

    render: ->
        <div>
            <div>&nbsp;{@render_action()}</div>
            {@render_error()}
            {@render_page()}
        </div>

render = (flux) ->
    <FluxComponent flux={flux} connectToStores={'billing'} >
        <BillingPage />
    </FluxComponent>


exports.render_billing = (dom_node, flux) ->
    init_flux(flux)
    React.render(render(flux), dom_node)

render_amount = (amount, currency) ->
    <div style={float:'right'}>{misc.stripe_amount(amount, currency)}</div>

COUNTRIES = ",United States,Canada,Spain,France,United Kingdom,Germany,Russia,Colombia,Mexico,Italy,Afghanistan,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua and Barbuda,Argentina,Armenia,Aruba,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Bouvet Island,Brazil,British Indian Ocean Territory,Brunei Darussalam,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,China,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Congo,The Democratic Republic of The,Cook Islands,Costa Rica,Cote D'ivoire,Croatia,Cuba,Cyprus,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Ethiopia,Falkland Islands (Malvinas),Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,French Southern Territories,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-bissau,Guyana,Haiti,Heard Island and Mcdonald Islands,Holy See (Vatican City State),Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Islamic Republic of,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Korea,Democratic People's Republic of,Korea,Republic of,Kuwait,Kyrgyzstan,Lao People's Democratic Republic,Latvia,Lebanon,Lesotho,Liberia,Libyan Arab Jamahiriya,Liechtenstein,Lithuania,Luxembourg,Macao,Macedonia,The Former Yugoslav Republic of,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Micronesia,Federated States of,Moldova,Republic of,Monaco,Mongolia,Montenegro,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Palestinian Territory,Occupied,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Rwanda,Saint Helena,Saint Kitts and Nevis,Saint Lucia,Saint Pierre and Miquelon,Saint Vincent and The Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Georgia and The South Sandwich Islands,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Svalbard and Jan Mayen,Swaziland,Sweden,Switzerland,Syrian Arab Republic,Taiwan,Republic of China,Tajikistan,Tanzania,United Republic of,Thailand,Timor-leste,Togo,Tokelau,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Turks and Caicos Islands,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,United States Minor Outlying Islands,Uruguay,Uzbekistan,Vanuatu,Venezuela,Viet Nam,Virgin Islands,British,Virgin Islands,Wallis and Futuna,Western Sahara,Yemen,Zambia,Zimbabwe".split(',')

STATES = {'':'',AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",AS:"American Samoa",DC:"District of Columbia",FM:"Federated States of Micronesia",GU:"Guam",MH:"Marshall Islands",MP:"Northern Mariana Islands",PW:"Palau",PR:"Puerto Rico",VI:"Virgin Islands"}