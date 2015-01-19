###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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

wizard_template = $(".smc-wizard")

class Wizard
    constructor: () ->
        @dialog = wizard_template.clone()

        @nav      = @dialog.find(".smc-wizard-nav")
        @lvl1     = @dialog.find(".smc-wizard-lvl1")
        @lvl2     = @dialog.find(".smc-wizard-lvl2")
        @document = @dialog.find(".smc-wizard-doc")
        @code     = @dialog.find(".smc-wizard-code")
        @descr    = @dialog.find(".smc-wizard-descr > div.panel-body")

        @init()
        @dialog.modal('show')

    init: () ->

        @dialog.find(".btn-close").on "click", =>
            @dialog.modal('hide')
            return false

        @nav.on "click", "li", (evt) =>
            evt.preventDefault()
            pill = $(evt.target)
            @set_nav(pill)
            @fill_list(@lvl1, ["a", "B", "CCC", pill.attr("href").substring(1)])
            return false

        @lvl1.on "click", "li", (evt) =>
            evt.preventDefault()
            select1 = $(evt.target).attr("data")
            console.log("lvl2: #{select1}")
            @fill_list(@lvl2, ["1", "2", "3", "#{select1}"])
            return false

        @lvl2.on "click", "li", (evt) =>
            evt.preventDefault()
            select2 = $(evt.target).attr("data")
            console.log("lvl1: #{select2}")
            @fill_list(@document, ["bla", "bla2"])
            return false

    set_nav: (which) ->
        for pill in @nav.find("li")
            console.log(pill, which)
            $(pill).toggleClass "active", pill == which.parent().get(0)

    fill_list: (list, entries) ->
        list.empty()
        for entry in entries
            # <li class="list-group-item active"><span class="badge">3</span>...</li>
            list.append($("<li class='list-group-item' data='#{entry}'>#{entry}</li>"))

exports.show = () -> new Wizard()
