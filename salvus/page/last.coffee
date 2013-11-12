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

