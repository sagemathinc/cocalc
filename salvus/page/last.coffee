###########################################################
#
# This should be the last code run on client application startup.
#
###########################################################

{top_navbar} = require('top_navbar')
top_navbar.hide_page_button("projects")

# see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
# I have some concern about performance.
$(document).on "click", (e) ->
    if e.button == 1 and $(e.target).hasClass("salvus-no-middle-click")
        e.preventDefault()


# Now load any specific page/project/previous state
exports.load_target = load_target = (target) ->
    if not target
        return
    segments = target.split('/')
    switch segments[0]
        when 'help'
            top_navbar.switch_to_page("salvus-help")
        when 'projects'
            if segments.length > 1
                require('projects').load_target(segments.slice(1).join('/'))
            else
                top_navbar.switch_to_page("projects")
        when 'settings'
            top_navbar.switch_to_page("account")


