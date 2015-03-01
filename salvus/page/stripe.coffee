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

misc     = require("misc")

defaults = misc.defaults
required = defaults.required


exports.stripe_user_interface = (opts) ->
    opts = defaults opts,
        stripe_publishable_key : required
        element                : required
    return new STRIPE(stripe_publishable_key, element)

class STRIPE
    constructor: (@stripe_publishable_key, elt) ->
        Stripe.setPublishableKey(stripe_publishable_key)
        @element = $(".smc-stripe-billing-template").clone().show()
        elt.empty()
        elt.append(@element)
        @init()

    init: () =>

        @billing_history_row = $(".smc-billing-history-row")

        $("a[href=#new-payment-method]").click(new_payment_method)
        $("a[href=#submit-payment-info]").click(submit_payment_info)

        $("a[href=#cancel-payment-info]").click () ->
            clear_payment_info()
            close_payment_info()

        $("#smc-credit-card-number").validateCreditCard (result) ->
            a = $(".smc-credit-card-number")
            a.find("i").hide()
            if result.valid
                i = a.find(".fa-cc-#{result.card_type.name}")
                if i.length > 0
                    i.show()
                else
                    a.find(".fa-credit-card").show()
                a.find(".fa-check").show()
                a.find(".smc-credit-card-invalid").hide()
            else
                a.find(".smc-credit-card-invalid").show()


    new_payment_method: () =>

        # TODO: change to load this right when billing tab is requested
        stripe_publishable_key = account_settings.settings?.billing_accounts?.stripe_publishable_key
        if not stripe_publishable_key?
            bootbox.alert("Billing is not configured.")
            return
        Stripe.setPublishableKey(stripe_publishable_key)

        # clone a copy of the payment method row

        # insert new payment method row into list of payment methods

        # set it to being edited

        clear_payment_info()
        $(".smc-payment-method").hide()
        $("#smc-credit-card-number").val('')
        $("a[href=#new-payment-method]").addClass('disabled')
        $(".smc-payment-info").show()
        $("a[href=#submit-payment-info]").removeClass('disabled')
        return false

    close_payment_info: () =>
        $(".smc-payment-info").hide()
        $("a[href=#new-payment-method]").removeClass('disabled')
        $(".smc-payment-method").show()
        return false

    clear_payment_info: () =>
        $(".smc-payment-info").find("input").val('')
        $(".smc-payment-error-row").hide()

    submit_payment_info: () =>
        form = $(".smc-payment-info").find("form")
        $("a[href=#submit-payment-info]").icon_spin(start:true).addClass('disabled')
        Stripe.card.createToken form, (status, response) ->
            $("a[href=#submit-payment-info]").icon_spin(start:false).removeClass('disabled')
            console.log("status=", status)
            console.log("response=", response)
            if status == 200
                $(".smc-payment-method").text("#{response.card.brand} card ending in #{response.card.last4} ")
                clear_payment_info()
                close_payment_info()
            else
                $(".smc-payment-error-row").show()
                $(".smc-payment-errors").text(response.error.message)
        return false

    billing_history_append: (entry) =>
        e = @billing_history_row.clone().show()
        for k, v of entry
            e.find(".smc-billing-history-entry-#{k}").text(v)
        $(".smc-billing-history-rows").append(e)

    # TESTS:
    test_billing: () =>
        @billing_history_append
            date    : '2014-01-29'
            plan    : 'Small'
            method  : 'Visa 4*** **** **** 1199'
            receipt : '...'
            amount  : 'USD $7.00'
            status  : 'Succeeded'
