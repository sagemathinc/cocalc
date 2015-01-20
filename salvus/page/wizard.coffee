###############################################################################
#
#    SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMathCloud Authors
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

_ = require("underscore")
misc_page = require('misc_page')

wizard_template = $(".smc-wizard")

data = null

class Wizard
    constructor: () ->
        @dialog = wizard_template.clone()

        # the elements
        @nav      = @dialog.find(".smc-wizard-nav")
        @lvl1     = @dialog.find(".smc-wizard-lvl1")
        @lvl2     = @dialog.find(".smc-wizard-lvl2")
        @document = @dialog.find(".smc-wizard-doc")
        @code     = @dialog.find(".smc-wizard-code")
        @descr    = @dialog.find(".smc-wizard-descr > div.panel-body")

        # the state
        @lang     = undefined
        @cat1     = undefined
        @cat2     = undefined
        @title    = undefined
        @doc      = undefined

        @init()
        @dialog.modal('show')

    init: () =>
        cb = () =>
            @init_nav()
            @init_buttons()

        if data?
            # console.log "data exists"
            cb()
        else
            # console.log "data null"
            $.ajax # TODO use some of those clever retry-functions
                url: window.salvus_base_url + "/static/wizard/wizard.js"
                dataType: "json"
                error: (jqXHR, textStatus, errorThrown) =>
                    console.log "AJAX Error: #{textStatus}"
                success: (data2, textStatus, jqXHR) =>
                    # console.log "Successful AJAX call: #{data}"
                    data = data2
                    cb()

    init_nav: () ->
        # <li role="presentation"><a href="#sage">Sage</a></li>
        N = {"sage": "Sage", "python": "Python", "r": "R", "gap" :"GAP", "cython" : "Cython"}
        for key in _.keys(data)
            name = key
            if N[key]?
                name = N[key]
            @nav.append($("<li role='presentation'><a href='##{key}'>#{name}</a></li>"))

    init_buttons: () ->
        @dialog.find(".btn-close").on "click", =>
            @dialog.modal('hide')
            return false

        @dialog.find(".btn-submit").on "click", =>
            @dialog.modal('hide')
            window.alert("INSERT CODE:\n" + @doc[0])
            return false

        @nav.on "click", "li", (evt) =>
            evt.preventDefault()
            pill = $(evt.target)
            @set_active(@nav, pill.parent())
            @lang = pill.attr("href").substring(1)
            @fill_list(@lvl1, _.keys(data[@lang]))
            @lvl2.empty()
            @document.empty()
            return false

        @lvl1.on "click", "li", (evt) =>
            evt.preventDefault()
            t = $(evt.target)
            @set_active(@lvl1, t)
            @cat1 = t.attr("data")
            # console.log("lvl1: #{select1}")
            @fill_list(@lvl2, _.keys(data[@lang][@cat1]))
            @document.empty()
            return false

        @lvl2.on "click", "li", (evt) =>
            evt.preventDefault()
            t = $(evt.target)
            @set_active(@lvl2, t)
            @cat2 = t.attr("data")
            # console.log("lvl2: #{select2}")
            @fill_list(@document, _.keys(data[@lang][@cat1][@cat2]))
            return false

        @document.on "click", "li", (evt) =>
            evt.preventDefault()
            t = $(evt.target)
            @set_active(@document, t)
            @title = t.attr("data")
            # console.log("document: #{doc}")
            @doc = data[@lang][@cat1][@cat2][@title]
            @code.text(@doc[0])
            @descr.html(misc_page.markdown_to_html(@doc[1]).s)
            @descr.mathjax()
            return false

    set_active: (list, which) ->
        for pill in list.find("li")
            # console.log(pill, which.get(0))
            $(pill).toggleClass "active", pill == which.get(0)

    fill_list: (list, entries) ->
        list.empty()
        for entry in entries
            # <li class="list-group-item active"><span class="badge">3</span>...</li>
            list.append($("<li class='list-group-item' data='#{entry}'>#{entry}</li>"))

exports.show = () -> new Wizard()
