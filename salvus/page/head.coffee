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



# Make it so clicking on the link with given id-item makes the
# element with given id visible, and all others invisible.  Also,
# the clicked link gets the active class, and all others become
# inactive.
###
_call_when_hiding_page = {}
call_when_hiding_page = (id, f) ->
    if _call_when_hiding_page.id?
        _call_when_hiding_page[id].push(f)
    else
        _call_when_hiding_page[id] = [f]

_call_when_showing_page = {}
call_when_showing_page = (id, f) ->
    if _call_when_showing_page.id?
        _call_when_showing_page[id].push(f)
    else
        _call_when_showing_page[id] = [f]

active_page = null

connect_links_and_pages = (page_ids, default_page=null) ->
    show_page = (id) ->
        active_page = id
        for q in page_ids
            p = "#" + q
            if q == id
                $(p).show()
                $(p+"-item").addClass("active")
                if _call_when_showing_page[q]?
                    for f in _call_when_showing_page[q]
                        f()
            else
                $(p).hide()
                $(p+"-item").removeClass("active")
                if _call_when_hiding_page[q]?
                    for f in _call_when_hiding_page[q]
                        f()
    for p in page_ids
        $("a[href='#"+p+"']").click((e) -> show_page(e.target.hash.slice(1)); return false)
    if default_page?
        show_page(default_page)
    else
        show_page(page_ids[0])
    return show_page
    
show_page = connect_links_and_pages(["about", "demo1", "demo2", "sign_in"], "sign_in")
###



#####################################
# Now try to do something better (?)
###
defaults = require("misc").defaults

class Page
    constructor: (opts) ->
        opts = defaults opts,
            element : defaults:required   # the HTML element that is the "view" of the page
            onfocus : undefined
            onblur  : undefined
        @element = element
        @onfocus = onfocus
        @onblur = onblur

    focus: () -> @onfocus()

    blue: () -> @onblur()
###                     
