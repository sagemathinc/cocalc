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

misc = require('misc')

{rclass, React, rtypes, FluxComponent}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, Well} = require('react-bootstrap')
{ErrorDisplay, Icon} = require('r_misc')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.


PaymentMethods = rclass
    propTypes:
        flux  : rtypes.object.isRequired

    getInitialState: ->
        adding_payment_method: false
        new_payment_info : {}

    submit_credit_card: ->
        console.log("submitting credit card")

    add_payment_method: ->
        @setState(adding_payment_method: true, new_payment_info:{name : @props.flux.getStore('account').get_fullname()})

    render_payment_method_field: (field, control) ->
        if field == 'State' and @state.new_payment_info?.Country != 'United States'
            return  # only need the state if they are in the US...
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
        console.log(x)

    render_input_card_number: ->
        <Input ref="input_card_number" type="text" size="20" placeholder="1234 5678 9012 3456"
               onChange={=>@set_input_info('number','input_card_number')}
        />

    render_input_cvc: ->
        <Input ref='input_cvc' style={width:"5em"} type="text" size=4 placeholder="···"
            onChange={=>@set_input_info("cvc", 'input_cvc')}
        />

    render_input_expiration: ->
        that = @
        <span>
            <input className="form-control" style={display:'inline', width:'5em'} placeholder="MM" type="text" size="2"
                   onChange={(e)=>@set_input_info("month", undefined, e.target.value)}
            />
            <span> / </span>
            <input className="form-control" style={display:'inline', width:'5em'} placeholder="YY" type="text" size="2"
                   onChange={(e)=>@set_input_info("year", undefined, e.target.value)}
            />
        </span>

    render_input_name: ->
        <Input ref='input_name' type="text" placeholder="Name on Card"
               onChange={=>@set_input_info("name", 'input_name')}
               value={@state.new_payment_info.name}
               />

    render_input_country: ->
        <span></span>

    render_input_state_zip: ->
        <span></span>

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
                    <Button onClick={=>@setState(adding_payment_method: false, new_payment_info:{})}>Cancel</Button>
                    <Button onClick={@submit_credit_card} bsStyle='primary'>Add Credit Card</Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_add_payment_method: ->
        <Row>
            <Col xs=8 xsOffset=2>
                <Well>
                    {@render_payment_method_fields()}
                    {@render_payment_method_buttons()}
                </Well>
            </Col>
        </Row>

    render_add_payment_method_button: ->
        if @state.adding_payment_method
            return
        <Button onClick={@add_payment_method} bsStyle='primary' style={float: "right"}>
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

    render_payment_methods: ->

    render: ->
        <Panel header={@render_header()}>
            {@render_add_payment_method() if @state.adding_payment_method}
            {@render_payment_methods()}
        </Panel>


InvoiceHistory = rclass
    render_header: ->
        <span>
            <Icon name="list-alt" /> Invoice History
        </span>

    render_invoices: ->

    render: ->
        <Panel header={@render_header()}>
        </Panel>


BillingPage = rclass
    render: ->
        <div>
            <PaymentMethods flux={@props.flux} />
            <InvoiceHistory />
        </div>

render = (flux) ->
    <FluxComponent flux={flux}>
        <BillingPage />
    </FluxComponent>


exports.render_billing = (dom_node, flux) ->
    React.render(render(flux), dom_node)

