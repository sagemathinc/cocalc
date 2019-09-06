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

SubscriptionGrid = require("./billing/subscription-grid").SubscriptionGrid

ExplainResources = require('./billing/explain-resources').ExplainResources

ExplainPlan = require('./billing/explain-plan').ExplainPlan

DedicatedVM = require('./billing/dedicated-vm').DedicatedVM

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

