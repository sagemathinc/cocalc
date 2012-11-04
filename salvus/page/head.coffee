# Make it so clicking on the link with given id-item makes the
# element with given id visible, and all others invisible.  Also,
# the clicked link gets the active class, and all others become
# inactive.
active_page = null
connect_links_and_pages = (page_ids, default_page=null) ->
    show_page = (id) ->
        active_page = id
        for p in page_ids
            if p == id
                $(p).show()
                $(p+"-item").addClass("active")
            else
                $(p).hide()
                $(p+"-item").removeClass("active")
    for p in page_ids
        $("a[href='"+p+"']").click((e) -> show_page(e.target.hash); return false)
    if default_page?
        show_page(default_page)
    else
        show_page(page_ids[0])
    
connect_links_and_pages(["#about", "#demo1", "#demo2"], "#demo1")
