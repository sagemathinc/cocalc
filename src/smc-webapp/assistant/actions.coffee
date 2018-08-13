##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, SageMath, Inc.
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

_            = require('underscore')
immutable    = require('immutable')
{Actions}    = require('../app-framework')
{INIT_STATE} = require('./common')

# the json from the server, where the entries for the documents are
# double-nested objects (two hiearchies of categories) mapping to title/code/description documents
DATA = null

class exports.ExamplesActions extends Actions
    _init: (store, project_id, path) ->
        @store = store
        @setState(
            path       : path
            project_id : project_id
        )

    get: (key) ->
        @store.get(key)

    set: (update) ->
        @setState(update)

    show: (lang) =>
        lang ?= 'sage'
        if lang != @get('lang')
            @init(lang)
        else
            @set(show: true)

    reset: ->
        @set(INIT_STATE)

    hide: =>
        @set(show: false)

    init: (lang) ->
        return if not lang?
        if not @get('initialized')
            @reset()
            @set(lang:lang)
            @load_data()
        else if @get('lang') != lang
            @select_lang(lang)
        @set(
            show                : true
            initialized         : true
            prepend_setup_code  : @get('prepend_setup_code') ? true
        )

    init_data: (data) ->
        @set(data: data)
        nav_entries = []
        for key, v of data
            if _.keys(v).length > 0
                nav_entries.push(key)
        @set(nav_entries: nav_entries)
        @select_lang(@get('lang'))

    set_handler: (handler) ->
        @set(handler:handler)

    insert: (descr) ->
        # this is the essential task of the example dialog:
        # call the callback with the selected code snippet
        code               = @get('code')
        setup_code         = @get('setup_code')
        prepend_setup_code = @get('prepend_setup_code')
        if (prepend_setup_code) and (setup_code?.length > 0)
            code = "#{setup_code}\n#{code}"
        @store.log()
        ret =
            code  : code
            lang  : @get('lang')
            descr : if descr then @get('descr') else null
        @get('handler')?(ret)

    load_data: () ->
        if not DATA?
            require.ensure [], =>
                # DATA is a global variable!
                # this file is supposed to be in webapp-lib/examples/examples.json
                # follow "./install.py examples" to see how the makefile is called during build
                DATA = require('webapp-lib/examples/examples.json')
                @init_data(DATA)
        else
            @init_data(DATA)

    # when a language is selected, this resets the category selections
    select_lang: (lang) ->
        return if lang? == @get('lang')
        lang ?= @get('lang')
        @reset()
        data = @get('data')
        if data.has(lang)
            @set(lang: lang)
            category_list0 = @store.get_category_list0()
            @set(category_list0 : category_list0)
            if category_list0.length == 1
                @set_selected_category(0, 0)
        else
            @set(unknown_lang:true)

    # a search is performed. basically looks through the documents until it finds enough results ...
    search: (search_str) ->
        @reset()
        if not search_str? or search_str.length == 0
            @select_lang(@get('lang'))
            return
        @set(search_str : search_str)
        str = search_str.toLowerCase()
        hits = []
        data_lang = @store.data_lang()
        EnoughResultsException = {}
        try
            data_lang.forEach (data1, lvl1) ->
                data1.forEach (data2, lvl2) ->
                    data2.get('entries').forEach (doc, lvl3) ->
                        title = doc.get(0)
                        descr = doc.getIn([1, 1])
                        inTitle = title.toLowerCase().indexOf(str)
                        inDescr = descr.toLowerCase().indexOf(str)
                        if inTitle != -1 or inDescr != -1
                            hits.push([lvl1, lvl2, lvl3, title, descr, inDescr])
                            if hits.length >= 30
                                throw EnoughResultsException
        catch ex
            if ex isnt EnoughResultsException
                throw ex
        @set(hits: hits)

    # a specific search result is selected and the corresponding document is set to be shown to the user
    search_selected: (idx) ->
        # why is @get('hits') immutable ?
        [lvl1, lvl2, lvl3, title, descr, inDescr] = @get('hits').get(idx).toArray()
        lang = @store.data_lang()
        doc = lang.getIn([lvl1, lvl2, 'entries', lvl3])
        @show_doc(lang, lvl1, lvl2, doc)
        @set(search_sel : idx)

    # keyboard handling for the search list
    search_cursor: (dir) ->
        # searching and then cursor-selecting search results
        # dir: +1 → downward / -1 → upward
        return if not @get('hits')?
        l = @get('hits').size
        if not @get('search_sel')?
            if dir > 0
                new_sel = 0
            else
                new_sel = l - 1
        else
            l = @get('hits').size
            new_sel = (@get('search_sel') + dir) %% l
            if new_sel < 0
                new_sel = l - 1
        @set(search_sel : new_sel)
        @search_selected(new_sel)

    generate_setup_code: (lang, lvl1, lvl2, doc) ->
        setup = lang.getIn([lvl1, lvl2, 'setup'])
        vars  = lang.getIn([lvl1, lvl2, 'variables'])
        code  = doc.getIn([1, 0])

        # extra setup on top
        extra = undefined
        # given we have a "variables" dictionary, we check
        if vars?
            # ... each line for variables inside of function calls
            # assuming function calls are after the first open ( bracket
            re = /\b([a-zA-Z_0-9]+)/g
            # all detected variable names are collected in that array
            varincode = []
            for line in code.split('\n')
                if '(' in line
                    line = line[line.indexOf('(')...]
                line.replace(re, ((_, g) -> varincode.push(g)))
            # then we add name = values lines to set only these
            # TODO syntax needs to be language specific!
            extra = vars
                .filter(((v,k) -> varincode.includes(k)))
                .entrySeq()
                .map((([k,v]) -> "#{k} = #{v}"))
                .toJS()
            if extra.length > 0
                extra = extra.join('\n')

        ret = ''
        if setup?
            ret += "#{setup}\n"
        if extra?
            ret += "#{extra}\n"
        return ret

    # for a specific document, set the code and description box values.
    show_doc: (lang, lvl1, lvl2, doc) ->
        @set(
            code        : doc.getIn([1, 0])
            descr       : doc.getIn([1, 1])
            submittable : true
            setup_code  : @generate_setup_code(lang, lvl1, lvl2, doc)
        )

    # key handling for the categories selection.
    # there is also a "twist": it wraps around at the end of a category to the next higher category
    # (similar to a counter with carry) but the lenght of the categories changes!
    select_cursor: (dir) ->
        # dir: only 1 or -1!
        # +1 → downward, higher idx number, first in list
        # -1 → upwards, lower index, last in list
        category0 = @get('category0')
        category1 = @get('category1')
        category2 = @get('category2')
        # console.log 'category0', category0, 'category1', category1, 'category2', category2
        top_or_bottom = (list) ->
            if dir < 0 then list.length - 1 else 0
        # dealing with some corner cases first
        if not category0?
            category_list0 = @store.get_category_list0()
            if category_list0?.length > 0
                @set_selected_category(0, top_or_bottom(category_list0))
        else if not category1?
            category_list1 = @store.get_category_list1()
            if category_list1?.length > 0
                @set_selected_category(1, top_or_bottom(category_list1))
        else if not category2?
            category_list2 = @store.get_category_list2()
            if category_list2?.length > 0
                @set_selected_category(2, top_or_bottom(category_list2))
        else # category0 1 and 2 are defined (i.e. we have a selection)
            l0 = @get('category_list0').size
            l1 = @get('category_list1').size
            l2 = @get('category_list2').size
            category2_next = category2 + dir

            # the next two blocks take care of carry in cat 2 and 1
            # trick: to accomodate for lists of varying length, an index
            # of -1 is fine -- see @set_selected_category
            if category2_next < 0
                category1_next = category1 - 1
            else if category2_next >= l2
                category2_next = 0
                category1_next = category1 + 1

            if category1_next < 0
                category0_next = category0 - 1
            else if category1_next >= l1
                category1_next = 0
                category0_next = category0 + 1

            if category0_next?
                # wrap category0 around (no curry)
                category0_next = (category0_next) % l0
                if category0_next < 0
                    category0_next = l0 - 1
                @set_selected_category(0, category0_next)
            if category1_next?
                @set_selected_category(1, category1_next)
            @set_selected_category(2, category2_next)

    # this sets a selected category for a given level.
    # it is able to handle negative indices (wraps around nicely) and it also expands
    # subcategories, if there is only one choice.
    set_selected_category: (level, idx) ->
        lang = @store.data_lang()
        switch level
            when 0, 1
                @set(
                    code        : ''
                    descr       : ''
                    category2   : null
                    submittable : false
                    setup_code  : ''
                    variables   : null
                )

        switch level
            when 0
                @set(category0: if idx == -1 then @get('category_list0').size - 1 else idx)
                category_list1 = @store.get_category_list1()
                @set(
                    category1       : null
                    category2       : null
                    category_list1  : category_list1
                    category_list2  : []
                )
                if category_list1.length == 1
                    @set_selected_category(1, 0)

            when 1
                category0 = @get('category0')
                @set(category1 : if idx == -1 then @get('category_list1').size - 1 else idx)
                category_list2 = @store.get_category_list2()
                @set(
                    category2        : undefined
                    category_list2   : category_list2
                )
                if category_list2.length == 1
                    @set_selected_category(2, 0)

            when 2
                k0    = @get('category_list0').get(@get('category0'))
                k1    = @get('category_list1').get(@get('category1'))
                idx   = if idx == -1 then @get('category_list2').size - 1 else idx
                doc   = lang.getIn([k0, k1, 'entries', idx])
                @set(category2:idx)
                @show_doc(lang, k0, k1, doc)

