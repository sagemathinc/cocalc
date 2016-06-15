###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


###########################################################
#
# This should be the last code run on client application startup.
#
###########################################################

{top_navbar} = require('./top_navbar')
top_navbar.hide_page_button("projects")
{salvus_client} = require('./salvus_client')
$ = require("jquery")

# see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
# I have some concern about performance.
$(document).on "click", (e) ->
    if e.button == 1 and $(e.target).hasClass("salvus-no-middle-click")
        e.preventDefault()
        e.stopPropagation() # ?

remember_me = salvus_client.remember_me_key()
if window.smc_target and not localStorage[remember_me] and window.smc_target != 'login'
    require('./history').load_target(window.smc_target)
else
    top_navbar.switch_to_page('account')

client = window.smc.client
if client._connected
    # These events below currently (do to not having finished the react rewrite)
    # have to be emited after the page loads, but may happen before.
    client.emit('connected')
    if client._signed_in
        client.emit("signed_in", client._sign_in_mesg)

# mathjax configuration: this could be cleaned up further or even parameterized with some code during startup

# ATTN: do not use "xypic.js", frequently causes crash!
window.MathJax =
    skipStartupTypeset: true
    extensions: ["tex2jax.js","asciimath2jax.js"]  # "static/mathjax_extensions/xypic.js"
    jax: ["input/TeX","input/AsciiMath", "output/SVG"]
    tex2jax:
        inlineMath: [ ['$','$'], ["\\(","\\)"] ]
        displayMath: [ ['$$','$$'], ["\\[","\\]"] ]
        processEscapes: true

    TeX:
        extensions: ["autoload-all.js"]
        Macros:  # get these from sage/misc/latex.py
            Bold:  ["\\mathbb{#1}",1]
            ZZ:    ["\\Bold{Z}",0]
            NN:    ["\\Bold{N}",0]
            RR:    ["\\Bold{R}",0]
            CC:    ["\\Bold{C}",0]
            FF:    ["\\Bold{F}",0]
            QQ:    ["\\Bold{Q}",0]
            QQbar: ["\\overline{\\QQ}",0]
            CDF:   ["\\Bold{C}",0]
            CIF:   ["\\Bold{C}",0]
            CLF:   ["\\Bold{C}",0]
            RDF:   ["\\Bold{R}",0]
            RIF:   ["\\Bold{I} \\Bold{R}",0]
            RLF:   ["\\Bold{R}",0]
            CFF:   ["\\Bold{CFF}",0]
            GF:    ["\\Bold{F}_{#1}",1]
            Zp:    ["\\ZZ_{#1}",1]
            Qp:    ["\\QQ_{#1}",1]
            Zmod:  ["\\ZZ/#1\\ZZ",1]

    # do not use "xypic.js", frequently causes crash!
    "HTML-CSS":
        linebreaks:
            automatic: true
    SVG:
        linebreaks:
            automatic: true
    showProcessingMessages: false

$ = require("jquery")
$ ->
    $("#smc-startup-banner")?.remove()
    $('#smc-startup-banner-status')?.remove()
    $(parent).trigger('initialize:frame')

    # dynamically inserting the mathjax script URL
    mjscript = document.createElement("script")
    mjscript.type = "text/javascript"
    mjscript.src  = MATHJAX_URL
    mjscript.onload = ->
        {mathjax_finish_startup} = require('./misc_page')
        MathJax.Hub?.Queue([mathjax_finish_startup])
    document.getElementsByTagName("head")[0].appendChild(mjscript)

