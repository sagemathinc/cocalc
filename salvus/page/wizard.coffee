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

# Wizard
# This is a modal dialog, which downloads a hierarchical collection of code snippets
# with descriptions. It returns an object, containing the code and the language:
# {"code": "...", "lang" : "..."} via a given callback.
#
# Usage:
# w = new Wizard({"cb" : callback, ["lang" : "initial language"]})
# w.hide()                     -- temporarily hide dialog (also via close/X button)
# w.show({<like constructor>}) -- show dialog again (same state!) and if
#                                language given, a selection of it is triggered
# w.destroy()                 -- invokes the dialog destruction, should be called when
#                                the originating object is destroyed.

"use strict"
_ = require("underscore")
{defaults, required, optional} = require('misc')
misc_page = require('misc_page')

wizard_template = $(".smc-wizard")

data = null

class Wizard
    constructor: (opts) ->
        @opts = defaults opts,
            lang  : 'sage'
            cb    : required # this callback will be called to return the selected code

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

    init: () =>
        @dialog.modal('show')
        cb = () =>
            @init_nav()
            @init_buttons()
            @show(lang: opts.lang)

        if data?
            cb()
        else
            @nav.append($("<li><a href='#'>Loading Data ...</a></li>"))
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
        @nav.empty()
        nav_entries = [
            ["sage", "Sage"],
            ["python", "Python"],
            ["r", "R"],
            ["gap", "GAP"],
            ["cython", "Cython"]]
        for entry, idx in nav_entries when data[entry[0]]? && _.keys(data[entry[0]]).length > 0
            nav_pill = $("<li role='presentation'><a href='##{entry[0]}'>#{entry[1]}</a></li>")
            @nav.append(nav_pill)

    init_buttons: () ->
        @dialog.find(".btn-close").on "click", =>
            @hide()
            return false

        @dialog.find(".btn-submit").on "click", =>
            @submit()
            return false

        # open all anchor links starting with "http" in a new window
        @dialog.on "click", "a[href^=http]", (evt) =>
            evt.preventDefault()
            window.open(evt.target.href)
            return false

        @nav.on "click", "li", (evt) =>
            pill = $(evt.target)
            @select_nav(pill)
            return false

        @lvl1.on "click", "li", (evt) =>
            # .closest("li") because of the badge
            el = $(evt.target).closest("li")
            @select_lvl1(el)
            return false

        @lvl2.on "click", "li", (evt) =>
            el = $(evt.target).closest("li")
            @select_lvl2(el)
            return false

        @document.on "click", "li", (evt) =>
            el = $(evt.target)
            @select_doc(el)
            return false

        @dialog.on "keydown", (evt) =>
            # 38: up,   40: down  /  74: j-key, 75: k-key
            # 37: left, 39: right /  72: h-key, 76: l-key
            # jQuery's prev/next need a check for length to see, if there is an element
            # necessary, since it is an unevaluated jquery object?
            key = evt.which
            active = @document.find(".active")
            if not active? || key not in [13, 38, 40, 74, 75, 37, 39, 72, 76]
                return
            evt.preventDefault()
            if key == 13 # return
                @submit()

            # this handles the up/down operations. The idea is, to be able to iterate throug all docs
            # for a given language. That's why there is this nested if. It handles the carry-overs at
            # the start or end of the list by advancing the next higher level. Most of the code is for corner cases.
            else if key in [38, 40, 74, 75] # up or down
                if key in [38, 75] # up
                    dirop = "prev"
                    carryop = "last"

                else if key in [40, 74] # down
                    dirop = "next"
                    carryop = "first"

                new_doc = active[dirop]()
                if new_doc.length == 0
                    # we have to switch one step #{dirop} in the lvl2 category
                    lvl2_active = @lvl2.find(".active")
                    new_lvl2 = lvl2_active[dirop]()
                    if new_lvl2.length == 0
                        lvl1_active = @lvl1.find(".active")
                        # now, we also have to step #{dirop} in the highest lvl1 category
                        new_lvl1 = lvl1_active[dirop]()
                        if new_lvl1.length == 0
                            new_lvl1 = @lvl1.children()[carryop]()
                        @select_lvl1(new_lvl1)
                        new_lvl2 = @lvl2.children()[carryop]()
                    @select_lvl2(new_lvl2)
                    new_doc = @document.children()[carryop]()
                @select_doc(new_doc)

            else # left or right
                if key in [37, 72] # left
                    new_pill = @nav.find(".active").prev()
                    if new_pill.length == 0
                        new_pill = @nav.children().last()
                else if key in [39, 76] # right
                    new_pill = @nav.find(".active").next()
                    if new_pill.length == 0
                        new_pill = @nav.children().first()
                @select_nav(new_pill.children(0))

    show: (opts) ->
        # the opposite of @hide, used to resurrect the dialog in its current state
        # the @init invokes the initial @dialog.modal("show"), don't get confused!
        old_lang = @opts.lang
        @opts = defaults opts,
            lang  : @opts.lang
            cb    : @opts.cb
        @dialog.show()
        if not @lang? || old_lang != @opts.lang
            @select_lang(@opts.lang)

    hide: () ->
        # this is deliberately not destroying the instance
        @dialog.hide()

    destroy: () ->
        # this is the destructive operation, which unbinds all the event handling etc.
        @dialog.modal("hide")

    submit: () ->
        @hide()
        if @doc?
            @opts.cb(code: @doc[0], lang: @lang, descr: @doc[1])

    set_active: (list, which) ->
        list.find("li").removeClass("active")
        which.addClass("active")

    select_lang: (lang) ->
        # crude way to go from a lang-string to the <a> element
        @select_nav(@nav.find("a[href=##{@opts.lang}]"))

    select_nav: (pill) ->
        # pill is the clicked <a> in the @nav
        @set_active(@nav, pill.parent())
        lang = pill.attr("href").substring(1)
        if not lang? || lang.length == 0
            return
        @lang = lang
        @lvl2.empty()
        @document.empty()
        @fill_list(@lvl1, data[@lang])

    select_lvl1: (t) ->
        # the major category has been clicked
        @set_active(@lvl1, t)
        @cat1 = t.attr("data")
        # console.log("lvl1: #{select1}")
        @document.empty()
        @fill_list(@lvl2, data[@lang][@cat1])
        t.scrollintoview()

    select_lvl2: (t) ->
        # the minor category has been clicked
        @set_active(@lvl2, t)
        @cat2 = t.attr("data")
        # console.log("lvl2: #{select2}")
        @fill_list(@document, data[@lang][@cat1][@cat2])
        t.scrollintoview()

    select_doc: (t) ->
        # the document title on the right has been clicked
        @set_active(@document, t)
        @title = t.attr("data")
        @doc = data[@lang][@cat1][@cat2][@title]
        @code.text(@doc[0])
        content = misc_page.markdown_to_html(@doc[1]).s
        if @doc[2] # by-attribution
            attr = misc_page.markdown_to_html("&copy; " + @doc[2]).s
            content += "<div class='attr'>#{attr}</div>"
        @descr.html(content)
        @descr.mathjax()
        t.scrollintoview()

    _list_sort: (a, b) ->
        # ordering operator, such that some entries are in front
        ord = (el) -> switch el
            when "Intro"    then -3
            when "Tutorial" then -2
            when "Help"     then -1
            else 0
        return ord(a) - ord(b) || a > b

    fill_list: (list, entries) ->
        # the three lists are the levels in the tree of documents. they change dynamically.
        # there is also a mutually recursive logic, to expand sublevels iff there is just one entry (saves stupid clicks)
        # fill_list call -> calls select_lvl1/2 -> which in turn calls fill_list again.
        list.empty()
        if entries?
            keys = _.keys(entries).sort(@_list_sort)
            for key in keys
                # <li class="list-group-item active"><span class="badge">3</span>...</li>
                if list == @document
                    list.append($("<li class='list-group-item' data='#{key}'>#{key}</li>"))
                else
                    subdocs = entries[key]
                    nb = _.keys(subdocs).length
                    list.append($("<li class='list-group-item' data='#{key}'><span class='badge'>#{nb}</span>#{key}</li>"))

            if keys.length == 1
                key = keys[0]
                entries2 = entries[key]
                if list == @lvl1
                    @select_lvl1(@lvl1.find("[data=#{key}]"))
                else if list == @lvl2
                    @select_lvl2(@lvl2.find("[data=#{key}]"))

exports.Wizard = Wizard
