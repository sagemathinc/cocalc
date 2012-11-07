
# Make it so clicking on the link with given id-item makes the
# element with given id visible, and all others invisible.  Also,
# the clicked link gets the active class, and all others become
# inactive.

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
    
connect_links_and_pages(["about", "demo1", "demo2", "sign_in"], "sign_in")
