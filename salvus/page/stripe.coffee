###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#    SageMath, Inc.
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

################################################
# Stripe Billing code
################################################

async           = require('async')
misc            = require('misc')
{alert_message} = require('alerts')
defaults        = misc.defaults
required        = defaults.required

{salvus_client} = require('salvus_client')

exports.stripe_user_interface = (opts) ->
    opts = defaults opts,
        element                : required
    return new STRIPE(opts.element)

templates = $(".smc-stripe-templates")

stripe_date = (d) ->
    return new Date(d*1000).toLocaleDateString( 'lookup', { year: 'numeric', month: 'long', day: 'numeric' })

log = (x,y,z) -> console.log('stripe: ', x,y,z)


class STRIPE
    constructor: (elt) ->
        @element = templates.find(".smc-stripe-page").clone()
        elt.empty()
        elt.append(@element)
        @init()
        window.s = @

    init: () =>
        @elt_cards = @element.find(".smc-stripe-page-card")
        @element.find("a[href=#new-card]").click(@new_card)

    update: (cb) =>
        $(".smc-billing-tab-refresh-spinner").show().addClass('fa-spin')
        async.series([
            (cb) =>
                salvus_client.stripe_get_customer
                    cb : (err, resp) =>
                        if err or not resp.stripe_publishable_key
                            $("#smc-billing-tab span").text("Billing is not yet available.")
                            cb(true)
                        else
                            Stripe.setPublishableKey(resp.stripe_publishable_key)
                            @set_customer(resp.customer)
                            @render_cards_and_subscriptions()
                            cb()
            (cb) =>
                salvus_client.stripe_get_charges
                    cb: (err, charges) =>
                        if err
                            cb(err)
                        else
                            @set_charges(charges)
                            @render_charges()
                            cb()
        ], (err) =>
            $(".smc-billing-tab-refresh-spinner").removeClass('fa-spin')
            cb?(err)
        )

    set_customer: (customer) =>
        @customer = customer

    render_cards_and_subscriptions: () =>
        if not @customer?
            # nothing to do
            return
        @render_cards()
        @render_subscriptions()
        if @customer.cards.data.length > 0
            @element.find("a[href=#new-subscription]").removeClass("disabled")
        else
            @element.find("a[href=#new-subscription]").addClass("disabled")

    render_one_card: (card) =>
        log('render_one_card', card)
        # card is a map with domain
        #    id, object, last4, brand, funding, exp_month, exp_year, fingerprint, country, name, address_line1, address_line2, address_city, address_state, address_zip, address_country, cvc_check, address_line1_check, address_zip_check, dynamic_last4, metadata, customer
        elt = templates.find(".smc-stripe-card").clone()
        elt.attr('id', card.id)
        for k, v of card
            if v? and v != null
                t = elt.find(".smc-stripe-card-#{k}")
                if t.length > 0
                    t.text(v)
        x = elt.find(".smc-stripe-card-brand-#{card.brand}")
        if x.length > 0
            x.show()
        else
            elt.find(".smc-stripe-card-brand-Other").show()

        elt.smc_toggle_details
            show   : '.smc-stripe-card-show-details'
            hide   : '.smc-stripe-card-hide-details'
            target : '.smc-strip-card-details'

        elt.find("a[href=#delete-card]").click () =>
            @delete_card(card)

        return elt

    delete_card: (card, cb) =>
        log("delete_card")
        m = "<h4 style='color:red;font-weight:bold'><i class='fa-warning-sign'></i>  Delete Payment Method</h4>  Are you sure you want to delete this #{card.brand} card?<br><br>"
        bootbox.confirm m, (result) =>
            if result
                salvus_client.stripe_delete_card
                    card_id : card.id
                    cb      : (err) =>
                        if err
                            alert_message
                                type    : "error"
                                message : "Error trying to delete card."
                        else
                            alert_message
                                type    : "info"
                                message : "Card deleted."
                            @update()
                        cb?(err)
            else
                cb?()

    render_cards: () =>
        log("render_cards")
        cards = @customer.cards
        panel = @element.find(".smc-stripe-cards-panel")
        elt_cards = panel.find(".smc-stripe-page-cards")
        elt_cards.empty()
        for card in cards.data
            elt_cards.append(@render_one_card(card))

        if cards.data.length > 1
            panel.find("a[href=#change-default]").show()
        else
            panel.find("a[href=#change-default]").hide()

        if cards.has_more
            panel.find("a[href=#show-more]").show().click () =>
                @show_all_cards()
        else
            panel.find("a[href=#show-more]").hide()

    render_one_subscription: (subscription) =>
        log('render_one_subscription', subscription)
        ###
        #
        # subscription is a map with domain
        #
        #    id, plan, object, start, status, customer, cancel_at_period_end, current_period_start, current_period_end,
        #    ended_at, trial_start, trial_end, canceled_at, quantity, application_fee_percent, discount, tax_percent, metadata
        #
        # The plan is another map with domain:
        #
        #    interval, name, created, amount, currency, id, object, livemode, interval_count, trial_period_days,
        #    metadata, statement_descriptor
        #
        ###
        elt = templates.find(".smc-stripe-subscription").clone()
        elt.attr('id', subscription.id)

        elt.find(".smc-stripe-subscription-quantity").text(subscription.quantity)
        for k in ['start', 'current_period_start', 'current_period_end']
            v = subscription[k]
            if v
                elt.find(".smc-stripe-subscription-#{k}").text(stripe_date(v))

        plan = subscription.plan
        elt.find(".smc-stripe-subscription-plan-name").text(plan.name)

        # TODO: make currency more sophisticated
        elt.find(".smc-stripe-subscription-plan-amount").text("$#{plan.amount/100}/month")  #TODO!

        elt.smc_toggle_details
            show   : '.smc-stripe-subscription-show-details'
            hide   : '.smc-stripe-subscription-hide-details'
            target : '.smc-strip-subscription-details'

        return elt

    render_subscriptions: () =>
        log("render_subscriptions")
        subscriptions = @customer.subscriptions
        panel = @element.find(".smc-stripe-subscriptions-panel")
        if subscriptions.data.length == 0 and @customer.cards.data.length == 0
            # no way to pay and no subscriptions yet -- don't show
            panel.hide()
            return
        else
            panel.show()
        elt_subscriptions = panel.find(".smc-stripe-page-subscriptions")
        elt_subscriptions.empty()
        for subscription in subscriptions.data
            elt_subscriptions.append(@render_one_subscription(subscription))

        if subscriptions.has_more
            panel.find("a[href=#show-more]").show().click () =>
                @show_all_subscriptions()
        else
            panel.find("a[href=#show-more]").hide()

    set_charges: (charges) =>
        @charges = charges

    render_one_charge: (charge) =>
        log('render_one_charge', charge)
        elt = templates.find(".smc-stripe-charge").clone()
        elt.attr('id', charge.id)

        elt.find(".smc-stripe-charge-amount").text("$#{charge.amount/100}") # TODO
        if charge.description
            elt.find(".smc-stripe-charge-plan-name").text(charge.description)

        elt.find(".smc-stripe-charge-created").text(stripe_date(charge.created))

        elt.smc_toggle_details
            show   : '.smc-stripe-charge-show-details'
            hide   : '.smc-stripe-charge-hide-details'
            target : '.smc-stripe-charge-details'

        return elt

    render_charges: () =>
        log("render_charges")
        charges = @charges
        if not charges?
            return
        panel = @element.find(".smc-stripe-charges-panel")
        if charges.data.length == 0
            # no charges yet -- don't show
            panel.hide()
            return
        else
            panel.show()
        elt_charges = panel.find(".smc-stripe-page-charges")
        elt_charges.empty()
        for charge in charges.data
            elt_charges.append(@render_one_charge(charge))

        if charges.has_more
            panel.find("a[href=#show-more]").show().click () =>
                @show_all_charges()
        else
            panel.find("a[href=#show-more]").hide()


    new_card: () =>
        btn = @element.find("a[href=#new-card]")
        btn.addClass('disabled')  # only re-enable after save/cancel editing one card.

        # clone a copy of the card row
        row = templates.find(".smc-stripe-card-row").clone()

        # insert new card row into list of payment cards at the top
        @elt_cards.prepend(row)

        row.find(".smc-stripe-card").hide()
        row.find("a[href=#update-card]").hide()
        row.find(".smc-stripe-card-edit").show()

        row.find("#smc-credit-card-number").validateCreditCard (result) =>
            a = row.find(".smc-stripe-credit-card-number")
            a.find("i").hide()
            if result.valid
                i = a.find(".fa-cc-#{result.card_type.name}")
                if i.length > 0
                    i.show()
                else
                    a.find(".fa-credit-card").show()
                a.find(".fa-check").show()
                a.find(".smc-stripe-credit-card-invalid").hide()
            else
                a.find(".smc-stripe-credit-card-invalid").show()

        row.find("a[href=#submit-card-info]").click () =>
            form = row.find("form")
            btn.icon_spin(start:true).addClass('disabled')
            response = undefined
            async.series([
                (cb) =>
                    Stripe.card.createToken form, (status, _response) =>
                        console.log("status=", status)
                        console.log("response=", _response)
                        if status != 200
                            cb(_response.error.message)
                        else
                            response = _response
                            cb()
                (cb) =>
                    salvus_client.stripe_create_card
                        token : response.id
                        cb    : cb
            ], (err) =>
                btn.icon_spin(false).removeClass('disabled')
                if err
                    row.find(".smc-stripe-card-error-row").show()
                    row.find(".smc-stripe-card-errors").text(err)
                else
                    row.find(".smc-stripe-card-edit").hide()
                    row.find(".smc-stripe-card-info").find("input").val('')
                    row.find(".smc-stripe-card-error-row").hide()
                    row.find(".smc-stripe-card-method").show().text("#{response.card.brand} card ending in #{response.card.last4} ")
                    row.find("a[href=#update-card]").show()
            )
            return false

        row.find("a[href=#cancel-card]").click () =>
            btn.removeClass('disabled')
            row.find(".smc-stripe-card-edit").hide()
            row.find(".smc-stripe-card-method").show()

        return false


    billing_history_append: (entry) =>
        e = @billing_history_row.clone().show()
        for k, v of entry
            e.find(".smc-stripe-history-entry-#{k}").text(v)
        @element.find(".smc-stripe-history-rows").append(e)

    # TESTS:
    test_billing: () =>
        @billing_history_append
            date    : '2014-01-29'
            plan    : 'Small'
            method  : 'Visa 4*** **** **** 1199'
            receipt : '...'
            amount  : 'USD $7.00'
            status  : 'Succeeded'
