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
defaults        = misc.defaults
required        = defaults.required

{salvus_client} = require('salvus_client')

exports.stripe_user_interface = (opts) ->
    opts = defaults opts,
        stripe_publishable_key : required
        element                : required
    return new STRIPE(opts.stripe_publishable_key, opts.element)

templates = $(".smc-billing-templates")

class STRIPE
    constructor: (@stripe_publishable_key, elt) ->
        Stripe.setPublishableKey(@stripe_publishable_key)
        @element = templates.find(".smc-stripe-billing-page").clone()
        elt.empty()
        elt.append(@element)
        @init()

    init: () =>
        @elt_payment_methods = @element.find(".smc-stripe-billing-page-payment-methods")


        @element.find("a[href=#new-payment-method]").click(@new_payment_method)


    set_customer: (customer) =>
        @customer = customer

    render: () =>
        console.log 'render (not done) '

    new_payment_method: () =>

        btn = @element.find("a[href=#new-payment-method]")
        btn.addClass('disabled')  # only re-enable after save/cancel editing one card.

        # clone a copy of the payment method row
        row = templates.find(".smc-payment-method-row").clone()

        # insert new payment method row into list of payment methods at the top
        @elt_payment_methods.prepend(row)

        row.find(".smc-payment-method").hide()
        row.find("a[href=#update-payment-method]").hide()
        row.find(".smc-payment-edit").show()

        row.find("#smc-credit-card-number").validateCreditCard (result) =>
            a = row.find(".smc-credit-card-number")
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

        row.find("a[href=#submit-payment-info]").click () =>
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
                    row.find(".smc-payment-error-row").show()
                    row.find(".smc-payment-errors").text(err)
                else
                    row.find(".smc-payment-edit").hide()
                    row.find(".smc-payment-info").find("input").val('')
                    row.find(".smc-payment-error-row").hide()
                    row.find(".smc-payment-method").show().text("#{response.card.brand} card ending in #{response.card.last4} ")
                    row.find("a[href=#update-payment-method]").show()
            )
            return false

        row.find("a[href=#cancel-payment-info]").click () =>
            btn.removeClass('disabled')
            row.find(".smc-payment-edit").hide()
            row.find(".smc-payment-method").show()

        return false




    billing_history_append: (entry) =>
        e = @billing_history_row.clone().show()
        for k, v of entry
            e.find(".smc-billing-history-entry-#{k}").text(v)
        @element.find(".smc-billing-history-rows").append(e)

    # TESTS:
    test_billing: () =>
        @billing_history_append
            date    : '2014-01-29'
            plan    : 'Small'
            method  : 'Visa 4*** **** **** 1199'
            receipt : '...'
            amount  : 'USD $7.00'
            status  : 'Succeeded'
