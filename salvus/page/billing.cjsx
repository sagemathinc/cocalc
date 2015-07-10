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

{rclass, React, rtypes, FluxComponent}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, Well} = require('react-bootstrap')
{ErrorDisplay, Icon} = require('r_misc')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.

PAYMENT_METHOD_FORM =
    "Card Number":<div></div>
    "CVC":<div></div>
    "Expiration (MM/YY)":<div></div>
    "Name on Card":<div></div>
    "Country":<div></div>
    "State":<div></div>


PaymentMethods = rclass
    getInitialState: ->
        adding_payment_method: false

    submit_credit_card: ->
        console.log("submitting credit card")

    add_payment_method: ->
        @setState(adding_payment_method: true)

    render_payment_method_field: (field, control) ->
        <Row key={field}>
            <Col xs=4>
                {field}
            </Col>
            <Col xs=8>
                {control}
            </Col>
        </Row>

    render_payment_method_fields: ->
        for field, control of PAYMENT_METHOD_FORM
            @render_payment_method_field(field, control)

    render_payment_method_buttons: ->
        <Row>
            <Col xs=4>
                Powered by Stripe
            </Col>
            <Col xs=8>
                <ButtonToolbar style={float: "right"}>
                    <Button onClick={=>@setState(adding_payment_method: false)}>Cancel</Button>
                    <Button onClick={@submit_credit_card} bsStyle='primary'>Add Credit Card</Button>
                </ButtonToolbar>
            </Col>
        </Row>

    render_add_payment_method: ->
        <Well>
            {@render_payment_method_fields()}
            {@render_payment_method_buttons()}
        </Well>

    render_header: ->
        <Row>
            <Col xs=6>
                <Icon name="credit-card" /> Payment Methods
            </Col>
            <Col xs=6>
                <Button disabled={@state.adding_payment_method} onClick={@add_payment_method} bsStyle='primary' style={float: "right"}>
                    <Icon name="plus-circle" /> Add Payment Method...
                </Button>
            </Col>
            {@render_add_payment_method() if @state.adding_payment_method}
        </Row>

    render_payment_methods: ->

    render: ->
        <Panel header={@render_header()}>
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
            <PaymentMethods />
            <InvoiceHistory />
        </div>

render = (flux) ->
    <FluxComponent flux={flux}>
        <BillingPage />
    </FluxComponent>


exports.render_billing = (dom_node, flux) ->
    React.render(render(flux), dom_node)

