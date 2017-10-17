# adsense

$ = window.$

async           = require('async')
underscore  = _ = require('underscore')
misc_page       = require('./misc_page')
{defaults, required} = misc = require('smc-util/misc')

exports.have_code = ->
    true

exports.id = "ad-#{misc.uuid()}"

# async init
init_done = false
exports.init = (cb) ->
    if init_done
        cb?(); return
    init_done = true
    window.googletag = window.googletag || {}
    window.googletag.cmd = window.googletag.cmd || []

    gads = document.createElement("script")
    gads.async = true
    gads.type = "text/javascript"
    useSSL = "https:" == document.location.protocol
    gads.src = (if useSSL then "https:" else "http:") + "//www.googletagservices.com/tag/js/gpt.js"
    node = document.getElementsByTagName("script")[0]
    node.parentNode.insertBefore(gads, node)
    window.googletag.cmd.push((-> cb?()))

_refresh = (slot) ->
    window.googletag.display(exports.id)
    window.googletag.pubads().refresh([slot])

refresh = underscore.debounce(_refresh, 5000)

slot1 = null
exports.load = (slot='/1005121/cocalc-test') ->
    window.googletag.cmd.push ->
        if not slot1?
            slot1 = window.googletag.defineSlot(slot, [160, 600], exports.id)
            # slot1.setTargeting("test", "refresh")
            slot1.addService(window.googletag.pubads())
            console.log("ads/slot1:", slot1)

            # Start ad fetching
            window.googletag.enableServices()
            window.googletag.display(exports.id)
        else
            refresh(slot1)

exports.init()