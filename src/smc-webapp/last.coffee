###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2014 -- 2016, SageMath, Inc.
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


###############################################################################
#
# This should be the last code run on client application startup.
#
###############################################################################

$               = window.$
{webapp_client} = require('./webapp_client')
{redux}         = require('./app-framework')
misc            = require('smc-util/misc')

# see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
# I have some concern about performance.
$(document).on "click", (e) ->
    if e.button == 1 and $(e.target).hasClass("webapp-no-middle-click")
        e.preventDefault()
        e.stopPropagation() # ?
    # hide popover on click
    if $(e.target).data('toggle') != 'popover' and $(e.target).parents('.popover.in').length == 0
        $('[data-toggle="popover"]').popover('hide')


client = webapp_client
if client._connected
    # These events below currently (due to not having finished the react rewrite)
    # have to be emited after the page loads, but may happen before.
    client.emit('connected')
    if client._signed_in
        client.emit("signed_in", client._sign_in_mesg)


# load the mathjax configuration before mathjax starts up
{MathJaxConfig} = require('smc-util/mathjax-config')
window.MathJax = MathJaxConfig

$ = window.$
$("#smc-startup-banner")?.remove()
$('#smc-startup-banner-status')?.remove()
$ ->
    try
        $(parent).trigger('initialize:frame')

    # mathjax startup. config is set above, now we dynamically insert the mathjax script URL
    mjscript = document.createElement("script")
    mjscript.type = "text/javascript"
    mjscript.src  = MATHJAX_URL
    mjscript.onload = ->
        # once loaded, we finalize the configuration and process pending rendering requests
        {mathjax_finish_startup} = require('./misc_page')
        MathJax.Hub?.Queue([mathjax_finish_startup])
    document.getElementsByTagName("head")[0].appendChild(mjscript)

    # enable logging
    misc.wrap_log()

    # for commercial setup, enable conversion tracking
    if require('./customize').commercial
        theme = require('smc-util/theme')
        # the gtag initialization
        window.dataLayer = window.dataLayer || []
        window.gtag = ->
            dataLayer.push(arguments)
        window.gtag('js', new Date())
        window.gtag('config', theme.gtag_id)
        # load tagmanager
        jtag = document.createElement("script")
        jtag.src = "https://www.googletagmanager.com/gtag/js?id=#{theme.gtag_id}"
        jtag.async = true
        document.getElementsByTagName("head")[0].appendChild(jtag)

    # finally, record start time
    # TODO compute an report startup initialization time
    prom_client = require('./prom-client')
    if prom_client.enabled
        browser_info_gauge = prom_client.new_gauge('browser_info', 'Information about the browser', ['browser', 'mobile', 'touch', 'git_version'])
        feature = require('./feature')
        browser_info_gauge.labels(feature.get_browser(), feature.IS_MOBILE, feature.IS_TOUCH, (SMC_GIT_REV ? 'N/A')).set(1)
        initialization_time_gauge = prom_client.new_gauge('initialization_seconds', 'Time from loading app.html page until last.coffee is completely done')
        initialization_time_gauge.set(((new Date()).getTime() - window.webapp_initial_start_time) / 1000)
