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
{ErrorDisplay, Icon, SelectorInput} = require('r_misc')

{salvus_client} = require('salvus_client')  # used to run the command -- could change to use an action and the store.

COUNTRIES = ",United States,Canada,Spain,France,United Kingdom,Germany,Russia,Colombia,Mexico,Italy,Afghanistan,Albania,Algeria,American Samoa,Andorra,Angola,Anguilla,Antarctica,Antigua and Barbuda,Argentina,Armenia,Aruba,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Bouvet Island,Brazil,British Indian Ocean Territory,Brunei Darussalam,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Central African Republic,Chad,Chile,China,Christmas Island,Cocos (Keeling) Islands,Colombia,Comoros,Congo,Congo,The Democratic Republic of The,Cook Islands,Costa Rica,Cote D'ivoire,Croatia,Cuba,Cyprus,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Equatorial Guinea,Eritrea,Estonia,Ethiopia,Falkland Islands (Malvinas),Faroe Islands,Fiji,Finland,France,French Guiana,French Polynesia,French Southern Territories,Gabon,Gambia,Georgia,Germany,Ghana,Gibraltar,Greece,Greenland,Grenada,Guadeloupe,Guam,Guatemala,Guinea,Guinea-bissau,Guyana,Haiti,Heard Island and Mcdonald Islands,Holy See (Vatican City State),Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Islamic Republic of,Iraq,Ireland,Israel,Italy,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kiribati,Korea,Democratic People's Republic of,Korea,Republic of,Kuwait,Kyrgyzstan,Lao People's Democratic Republic,Latvia,Lebanon,Lesotho,Liberia,Libyan Arab Jamahiriya,Liechtenstein,Lithuania,Luxembourg,Macao,Macedonia,The Former Yugoslav Republic of,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Marshall Islands,Martinique,Mauritania,Mauritius,Mayotte,Mexico,Micronesia,Federated States of,Moldova,Republic of,Monaco,Mongolia,Montenegro,Montserrat,Morocco,Mozambique,Myanmar,Namibia,Nauru,Nepal,Netherlands,Netherlands Antilles,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Niue,Norfolk Island,Northern Mariana Islands,Norway,Oman,Pakistan,Palau,Palestinian Territory,Occupied,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Pitcairn,Poland,Portugal,Puerto Rico,Qatar,Reunion,Romania,Rwanda,Saint Helena,Saint Kitts and Nevis,Saint Lucia,Saint Pierre and Miquelon,Saint Vincent and The Grenadines,Samoa,San Marino,Sao Tome and Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Solomon Islands,Somalia,South Africa,South Georgia and The South Sandwich Islands,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Svalbard and Jan Mayen,Swaziland,Sweden,Switzerland,Syrian Arab Republic,Taiwan,Republic of China,Tajikistan,Tanzania,United Republic of,Thailand,Timor-leste,Togo,Tokelau,Tonga,Trinidad and Tobago,Tunisia,Turkey,Turkmenistan,Turks and Caicos Islands,Tuvalu,Uganda,Ukraine,United Arab Emirates,United Kingdom,United States,United States Minor Outlying Islands,Uruguay,Uzbekistan,Vanuatu,Venezuela,Viet Nam,Virgin Islands,British,Virgin Islands,U.S.,Wallis and Futuna,Western Sahara,Yemen,Zambia,Zimbabwe".split(',')

STATES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",AS:"American Samoa",DC:"District of Columbia",FM:"Federated States of Micronesia",GU:"Guam",MH:"Marshall Islands",MP:"Northern Mariana Islands",PW:"Palau",PR:"Puerto Rico",VI:"Virgin Islands"}


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
        if field == 'State' and @state.new_payment_info.country != "United States"
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
        <SelectorInput
            options   = {COUNTRIES}
            on_change = {(country)=>@set_input_info("country", "", country)}
        />

    render_input_zip: ->
        if @state.new_payment_info.state == 'WA'
            <Input ref='input_address_zip' placeholder="Zip Code" type="text" size="5" pattern="\d{5,5}(-\d{4,4})?"
                    onChange={=>@set_input_info("address_zip", 'input_address_zip')}
            />

    render_input_state_zip: ->
        <Row>
            <Col xs=7>
                <SelectorInput
                    options   = {STATES}
                    on_change = {(state)=>@set_input_info("state", "", state)}
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

