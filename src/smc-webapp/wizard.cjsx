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
#                                 language given, a selection of it is triggered
# w.destroy()                  -- invokes the dialog destruction, should be called when
#                                 the originating object is destroyed.

_ = require("underscore")
{defaults, required, optional} = require('smc-util/misc')
misc_page = require('./misc_page')

markdown = require('./markdown')

# the json from the server, where the entries for the documents are
# double-nested objects (two hiearchies of categories) mapping to title/code/description documents
DATA = null

# react wizard
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('./smc-react')
{Col, Row, Panel, Button, Input, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem} = require('react-bootstrap')
{Loading, Icon, Markdown} = require('./r_misc')

redux_name = (project_id, path) ->
    return "wizard-#{project_id}-#{path}"

class WizardStore extends Store

class WizardActions extends Actions
    get: (key) ->
        @redux.getStore(@name).get(key)
    set: (update) ->
        @setState(update)
    show: (lang='sage') =>
        @set
            show: true
            lang: lang
    reset: ->
        @set
            cat0       : null
            cat1       : null
            cat2       : null
            catlist0   : []
            catlist1   : []
            catlist2   : []
            code       : ''
            descr      : ''
            hits       : []
            search_str : null
            search_sel : null
            cat1_top   : ["Intro", "Tutorial", "Help"]
    hide: =>
        @set(show: false)
    init: (lang='sage') ->
        @reset()
        @show(lang=lang)
        @load_data()
    init_data: (data) ->
        @set(data: data)
        nav_entries = []
        for key in _.keys(data)
            entry = switch key
                        when 'gap'
                            ['gap', 'GAP']
                        else
                            [key, key[0].toUpperCase() + key[1..]]
            if _.keys(data[key]).length > 0
                nav_entries.push(entry)
        @set(nav_entries: nav_entries)
        @select_lang(@get('lang'))
    insert: (cb) ->
        # this is the essential task of the wizard:
        # call the callback with the selected code snippet
        cb
            code  : 'code'
            lang  : @get('lang')
            title : 'title'
            descr : 'description'
    load_data: () ->
        if not DATA?
            require.ensure [], =>
                # DATA is a global variable!
                DATA = require('wizard/wizard.json')
                @init_data(DATA)
        else
            @init_data(DATA)
    data_lang: () ->
        @get('data').get(@get('lang'))
    select_lang: (lang) ->
        @reset()
        catlist0 = @get('data').get(lang).keySeq().toArray().sort(@cat_sort)
        @set
            lang     : lang
            catlist0 : catlist0
        if catlist0.length == 1
            @set_selected_category(0, catlist0[0], 0)
    search: (search_str) ->
        @reset()
        if not search_str? or search_str.length == 0
            @select_lang(@get('lang'))
            return
        @set(search_str : search_str)
        str = search_str.toLowerCase()
        hits = []
        data_lang = @data_lang()
        EnoughResultsException = {}
        try
            data_lang.forEach (data1, lvl1) ->
                data1.forEach (data2, lvl2) ->
                    data2.forEach (entry, lvl3) ->
                        title = entry.get(0)
                        descr = entry.getIn([1, 1])
                        inTitle = title.toLowerCase().indexOf(str)
                        inDescr = descr.toLowerCase().indexOf(str)
                        if inTitle != -1 or inDescr != -1
                            hits.push([lvl1, lvl2, lvl3, title, descr, inDescr])
                            if hits.length >= 30
                                throw EnoughResultsException
        catch ex
            if ex isnt EnoughResultsException
                throw ex
        @set
            hits: hits

    search_selected: (lvl1, lvl2, lvl3, idx) ->
        doc = @data_lang().getIn([lvl1, lvl2, lvl3])
        @show_doc(doc)
        @set(search_sel : idx)

    show_doc: (doc) ->
        @set
            code  : doc.getIn([1, 0])
            descr : doc.getIn([1, 1])

    cat_sort: (a, b) =>
        # ordering operator, such that some entries are in front
        top = @get('cat1_top')
        ord = (el) ->
            i = top.reverse().indexOf(el)
            return 1 - i
        return ord(a) - ord(b) or a > b

    set_selected_category: (level, selected, idx) ->
        lang = @data_lang()
        switch level
            when 0, 1
                @set(code: '', descr: '', cat2 : null)
        switch level
            when 0
                catlist1 = lang.get(selected).keySeq().toArray().sort(@cat_sort)
                @set
                    cat0     : selected
                    cat1     : null
                    cat2     : null
                    catlist1 : catlist1
                    catlist2 : []
                if catlist1.length == 1
                    @set_selected_category(1, catlist1[0], 0)
            when 1
                cat0     = @get('cat0')
                catlist2 = lang.getIn([cat0, selected]).map((el) -> el.get(0)).toArray()
                @set
                    cat1     : selected
                    cat2     : null
                    catlist2 : catlist2
                if catlist2.length == 1
                    @set_selected_category(2, catlist2[0], 0)
            when 2
                cat0 = @get('cat0')
                cat1 = @get('cat1')
                doc  = lang.getIn([cat0, cat1, idx])
                @set
                    cat2  : idx
                @show_doc(doc)

WizardHeader = rclass
    displayName : 'WizardHeader'
    propTypes:
        actions     : rtypes.object
        nav_entries : rtypes.array
        search_str  : rtypes.string
        lang        : rtypes.string.isRequired
    langSelect: (key) ->
        @props.actions.select_lang(key)
    search: (evt) ->
        evt.preventDefault()
        evt.stopPropagation()
        @props.actions.search(evt.target.value)
    render_nav : ->
        entries = @props.nav_entries
        entries ?= []
        <Nav bsStyle="pills" activeKey={@props.lang} ref='lang' onSelect={@langSelect}>
            {entries.map (entry, idx) =>
                    [key, name] = entry
                    <NavItem key={key} eventKey={key} title={name}>{name}</NavItem>
            }
        </Nav>
    render : ->
        <Row>
            <Col sm={3}><h2><Icon name='magic' /> Wizard</h2></Col>
            <Col sm={5}>
                {@render_nav()}
            </Col>
            <Col sm={3}>
                <Input ref='search'
                       type='text'
                       className='smc-wizard-search'
                       placeholder='Search'
                       value={@props.search_str}
                       onChange={@search}  />
            </Col>
        </Row>

WizardBody = rclass
    displayName : 'WizardBody'
    propTypes:
        actions    : rtypes.object
        data       : rtypes.object
        lang       : rtypes.string.isRequired
        code       : rtypes.string
        descr      : rtypes.string
        cat0       : rtypes.string
        cat1       : rtypes.string
        cat2       : rtypes.number
        catlist0   : rtypes.arrayOf(rtypes.string)
        catlist1   : rtypes.arrayOf(rtypes.string)
        catlist2   : rtypes.arrayOf(rtypes.string)
        search_str : rtypes.string
        search_sel : rtypes.number
        hits       : rtypes.arrayOf(rtypes.array)

    componentWillMount: ->
        @scrollTo0 = _.debounce (() -> $(@refs.list_0).find('.active').scrollintoview()), 50
        @scrollTo1 = _.debounce (() -> $(@refs.list_1).find('.active').scrollintoview()), 50
        @scrollTo2 = _.debounce (() -> $(@refs.list_2).find('.active').scrollintoview()), 50

    componentDidUpdate: (props, state) ->
        @scrollTo0()
        @scrollTo1()
        @scrollTo2()

    category_selection: (level, selected, idx) ->
        @props.actions.set_selected_category(level, selected, idx)

    category_list: (level) ->
        cat  = @props["cat#{level}"]
        list = @props["catlist#{level}"]
        if not list?
            list = []
        # don't use ListGroup & ListGroupItem with onClick, because then there are div/buttons (instead of ul/li) and layout is f'up
        <ul className='list-group' ref="list_#{level}">
            {list.map (name, idx) =>
                click  = @category_selection.bind(@, level, name, idx)
                # level 0 and 1 by name, level 2 by index
                comp   = if level == 2 then idx else name
                active = if comp == cat then 'active' else ''
                <li className={"list-group-item " + active} onClick={click} key={idx}>{name}</li>
            }
        </ul>

    search_result_selection: (lvl1, lvl2, lvl3, idx) ->
        @props.actions.search_selected(lvl1, lvl2, lvl3, idx)

    render_search_results : ->
        ss = @props.search_str
        <ul className='list-group' ref="search_results">
            {@props.hits.map (hit, idx) =>
                [lvl1, lvl2, lvl3, title, descr, inDescr] = hit
                click = @search_result_selection.bind(@, lvl1, lvl2, lvl3, idx)
                title_hl = title.replace(new RegExp(ss, "gi"), "<span class='hl'>#{ss}</span>")
                if inDescr != -1
                    i = Math.max(0, inDescr-30)
                    j = Math.min(descr.length, inDescr+30+ss.length)
                    t = descr[inDescr...inDescr+ss.length]
                    snippet = descr[i..j].replace(new RegExp(ss, "gi"), "<span class='hl'>#{t}</span>")
                    if i > 0
                        snippet = '...' + snippet
                    if j < descr.length
                        snippet = snippet + '...'
                active = if @props.search_sel == idx then 'active' else ''
                <li className={"list-group-item " + active} onClick={click} key={idx}>
                    {lvl1} → {lvl2} → <span style={fontWeight: 'bold'} dangerouslySetInnerHTML={__html : title_hl}></span>
                    {' '}{<span className='snippet'} dangerouslySetInnerHTML={__html : snippet}></span> if snippet?.length > 0}
                </li>
            }
        </ul>

    render_top : ->
        searching = @props.search_str?.length > 0
        if not @props.data?
            <Row>
                <Col sm={8} smOffset={4}>
                    <ul className='list-group'>
                        <li></li><li></li>
                        <li><Loading /></li>
                    </ul>
                </Col>
            </Row>
        else if searching
            <Row>
                <Col sm={12}>{@render_search_results()}</Col>
            </Row>
        else
            <Row>
                <Col sm={3}>{@category_list(0)}</Col>
                <Col sm={3}>{@category_list(1)}</Col>
                <Col sm={6}>{@category_list(2)}</Col>
            </Row>

    render : ->
        <Modal.Body className='modal-body'>
            {@render_top()}
            <Row>
                <Col sm={6}>
                    <pre ref='code' className='code'>{@props.code}</pre>
                </Col>
                <Col sm={6}>
                    <Panel ref='descr' className='smc-wizard-descr'>
                        <Markdown value={@props.descr} />
                    </Panel>
                </Col>
            </Row>
        </Modal.Body>


RWizard = (name) -> rclass
    displayName : 'Wizard'

    reduxProps :
        "#{name}" :
            show        : rtypes.bool
            lang        : rtypes.string
            code        : rtypes.string
            descr       : rtypes.string
            data        : rtypes.object
            search      : rtypes.string
            nav_entries : rtypes.arrayOf(rtypes.arrayOf(rtypes.string))
            catlist0    : rtypes.arrayOf(rtypes.string)
            catlist1    : rtypes.arrayOf(rtypes.string)
            catlist2    : rtypes.arrayOf(rtypes.string)
            cat0        : rtypes.string
            cat1        : rtypes.string
            cat2        : rtypes.number
            search_str  : rtypes.string
            search_sel  : rtypes.number
            hits        : rtypes.arrayOf(rtypes.array)

    propTypes :
        cb      : rtypes.func
        actions : rtypes.object.isRequired

    getInitialState : ->
        search  : ''

    close : ->
        @props.actions.hide()

    handle_key : (evt) ->
        evt.preventDefault()
        evt.stopPropagation()
        key = evt.keyCode
        if key not in [13, 38, 40, 37, 39]
            return
        switch key
            when 13 #return
                console.log 'select'
            when 38, 40 # up or down
                console.log 'up or down', key

    render : ->
        <Modal show={@props.show}
               onKeyUp={@handle_key}
               onHide={@close}
               bsSize="large"
               className="smc-wizard">
            <Modal.Header closeButton className='modal-header'>
               <WizardHeader actions     = {@props.actions}
                             lang        = {@props.lang}
                             search_str  = {@props.search_str}
                             nav_entries = {@props.nav_entries} />
            </Modal.Header>

            <WizardBody actions    = {@props.actions}
                        lang       = {@props.lang}
                        code       = {@props.code}
                        descr      = {@props.descr}
                        cat0       = {@props.cat0}
                        cat1       = {@props.cat1}
                        cat2       = {@props.cat2}
                        catlist0   = {@props.catlist0}
                        catlist1   = {@props.catlist1}
                        catlist2   = {@props.catlist2}
                        search_str = {@props.search_str}
                        search_sel = {@props.search_sel}
                        hits       = {@props.hits}
                        data       = {@props.data} />

            <Modal.Footer>
                <Button onClick={@props.actions.hide}>Cancel</Button>
                <Button onClick={=> @props.actions.insert(@props.cb)} bsStyle='success'>Insert Code</Button>
            </Modal.Footer>
        </Modal>

exports.render_wizard = (target, project_id, path, lang = 'sage', cb = null) ->
    name = redux_name(project_id, path)
    actions = redux.getActions(name)
    if not actions?
        actions = redux.createActions(name, WizardActions)
        store   = redux.createStore(name)
    actions.init(lang=lang)
    W = RWizard(name)
    ReactDOM.render(<Redux redux={redux}><W cb={cb} actions={actions}/></Redux>, target)
    return actions

# old wizard code
wizard_template = $(".smc-wizard")
class Wizard
    constructor: (opts) ->
        @opts = defaults opts,
            lang  : 'sage'
            cb    : optional # this callback will be called to return the selected code

        @dialog = wizard_template.clone()

        # the elements
        @nav      = @dialog.find ".smc-wizard-nav"
        @search   = @dialog.find ".smc-wizard-search"
        @lvl1     = @dialog.find ".smc-wizard-lvl1"
        @lvl2     = @dialog.find ".smc-wizard-lvl2"
        @docs     = @dialog.find ".smc-wizard-doc"
        @code     = @dialog.find ".smc-wizard-code"
        @descr    = @dialog.find ".smc-wizard-descr > div.panel-body"

        # the state
        @lang     = undefined
        @cat1     = undefined
        @cat2     = undefined
        @title    = undefined
        @doc      = undefined

        # took me 2 hours to figure out how to properly set an instance method as _.debounce
        # but it works perfectly now! keep the arrow down key pressed and see the difference.
        @scrollintoview_lvl1 = _.debounce ((t) -> t.scrollintoview()), 50
        @scrollintoview_lvl2 = _.debounce ((t) -> t.scrollintoview()), 50
        @scrollintoview_docs = _.debounce ((t) -> t.scrollintoview()), 50

        @init()

    init: () =>
        @dialog.modal('show')
        cb = () =>
            @init_nav()
            @init_buttons()
            @show(@opts)

        if data?
            cb()
        else
            @nav.append($("<li><a href='#'>Loading Data ...</a></li>"))
            require.ensure [], =>
                data = require('wizard/wizard.json')
                cb()
            #$.ajax # TODO use some of those clever retry-functions
            #    url: require("!file!../static/wizard/wizard.js")
            #    dataType: "json"
            #    error: (jqXHR, textStatus, errorThrown) =>
            #        console.log "AJAX Error: #{textStatus}"
            #    success: (payload, textStatus, jqXHR) =>
            #        # console.log "Successful AJAX call: #{data}"
            #        data = payload
            #        cb()

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
            @do_search()
            return false

        @search.on "keyup", (evt) =>
            evt.stopPropagation()
            @do_search()

        @lvl1.on "click", "li", (evt) =>
            # .closest("li") because of the badge
            el = $(evt.target).closest("li")
            @select_lvl1(el)
            return false

        @lvl2.on "click", "li", (evt) =>
            el = $(evt.target).closest("li")
            @select_lvl2(el)
            return false

        @docs.on "click", "li", (evt) =>
            el = $(evt.target)
            @select_doc(el)
            return false

        @dialog.on "keydown", (evt) =>
            # 38: up,   40: down  /  74: j-key, 75: k-key
            # 37: left, 39: right /  72: h-key, 76: l-key
            # jQuery's prev/next need a check for length to see, if there is an element
            # necessary, since it is an unevaluated jquery object?
            key = evt.which
            active = @docs.find(".active")
            if not active? || key not in [13, 38, 40, 37, 39]
                return
            evt.preventDefault()
            evt.stopPropagation()
            if key == 13 # return
                @submit()

            # this handles the up/down operations. The idea is, to be able to iterate throug all docs
            # for a given language. That's why there is this nested if. It handles the carry-overs at
            # the start or end of the list by advancing the next higher level. Most of the code is for corner cases.
            else if key in [38, 40] # up or down
                if key in [38] # up
                    dirop = "prev"
                    carryop = "last"

                else if key in [40] # down
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
                    new_doc = @docs.children()[carryop]()
                @select_doc(new_doc)

            else # left or right
                if key in [37] # left
                    new_pill = @nav.find(".active").prev()
                    if new_pill.length == 0
                        new_pill = @nav.children().last()
                else if key in [39] # right
                    new_pill = @nav.find(".active").next()
                    if new_pill.length == 0
                        new_pill = @nav.children().first()
                @select_nav(new_pill.children(0))

    show: (opts) ->
        # the opposite of @hide, used to resurrect the dialog in its current state
        # the @init invokes the initial @dialog.modal("show"), don't get confused!
        console.log "wizard.show opts=", opts
        old_lang = @opts.lang
        @opts = defaults opts,
            lang  : @opts.lang
            cb    : @opts.cb
        console.log "wizard @opts =", @opts
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
        if @opts.cb? && @doc?
            @opts.cb(code: @doc[0], lang: @lang, descr: @doc[1])

    set_active: (list, which) ->
        list.find("li").removeClass("active")
        which.addClass("active")

    select_lang: (lang) ->
        # crude way to go from a lang-string to the <a> element
        pill = @nav.find("a[href=##{lang}]")
        if pill?
            @select_nav(pill)

    select_nav: (pill) ->
        # pill is the clicked <a> in the @nav
        @set_active(@nav, pill.parent())
        lang = pill.attr("href").substring(1)
        if not lang? || lang.length == 0
            return
        @lang = lang
        @lvl2.empty()
        @docs.empty()
        @fill_list(@lvl1, data[@lang])

    select_lvl1: (t) ->
        # the major category has been clicked
        @set_active(@lvl1, t)
        @cat1 = t.attr("data")
        # console.log("lvl1: #{select1}")
        @docs.empty()
        @fill_list(@lvl2, data[@lang][@cat1])
        @scrollintoview_lvl1(t)

    select_lvl2: (t) ->
        # the minor category has been clicked
        @set_active(@lvl2, t)
        @cat2 = t.attr("data")
        # console.log("lvl2: #{select2}")
        @fill_list(@docs, data[@lang][@cat1][@cat2])
        @scrollintoview_lvl2(t)

    select_doc: (t) ->
        # the document title on the right has been clicked
        @set_active(@docs, t)
        @title = title = t.attr("data")
        @cat1 = t.attr("lvl1") || @cat1
        @cat2 = t.attr("lvl2") || @cat2
        @doc = _.find(data[@lang][@cat1][@cat2], (doc) -> doc[0] == title)[1]
        @code.text(@doc[0])
        content = markdown.markdown_to_html(@doc[1]).s
        if @doc[2] # by-attribution
            attr = markdown.markdown_to_html("&copy; " + @doc[2]).s
            content += "<div class='attr'>#{attr}</div>"
        @descr.html(content)
        @descr.mathjax()
        @scrollintoview_docs(t)

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
        # <li class="list-group-item active"><span class="badge">3</span>...</li>
        list.empty()
        if entries?
            if list == @docs
                for entry in entries
                    key = entry[0]
                    list.append($("<li class='list-group-item' data='#{key}'>#{key}</li>"))

            else
                keys = _.keys(entries).sort(@_list_sort)
                for key in keys
                    subdocs = entries[key]
                    nb = _.keys(subdocs).length
                    list.append($("<li class='list-group-item' data='#{key}'><span class='badge'>#{nb}</span>#{key}</li>"))

                if keys.length == 1
                    key = keys[0]
                    entries2 = entries[key]
                    if list == @lvl1
                        @select_lvl1(@lvl1.find("[data=#{key}]"))
                    if list == @lvl2
                        @select_lvl2(@lvl2.find("[data=#{key}]"))

    do_search: () ->
        search_str = @search.val()
        if not search_str? || search_str.length == 0
            @lvl1.show()
            @lvl2.show()
            @docs.empty()
            return

        @lvl1.hide()
        @lvl2.hide()
        @docs.empty()

        str = search_str.toLowerCase()
        hits = 0
        for lvl1, data1 of data[@lang]
            for lvl2, data2 of data1
                for entry in data2
                    title = entry[0]
                    descr = entry[1][1]
                    if title.toLowerCase().indexOf(str) != -1 || descr.toLowerCase().indexOf(str) != -1
                        title_hl = title.replace(new RegExp(str, "gi"), "<span class='hl'>#{search_str}</span>")
                        @docs.append($("<li class='list-group-item' lvl1='#{lvl1}' lvl2='#{lvl2}' data='#{title}'>#{title_hl}</li>"))
                        hits += 1
                        if hits > 10
                            return


exports.Wizard = Wizard
