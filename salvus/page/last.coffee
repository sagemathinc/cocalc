###########################################################
#
# This should be the last code run on client application startup.
#
###########################################################

{top_navbar} = require('top_navbar')
top_navbar.hide_page_button("projects")

misc_page = require('misc_page')
editor    = require('editor')

# see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
# I have some concern about performance.
$(document).on "click", (e) ->
    if e.button == 1 and $(e.target).hasClass("salvus-no-middle-click")
        e.preventDefault()

# asynchronously load additional dependencies, e.g., CodeMirror, term.js....
# These are things that aren't needed for the initial page initialization,
# but are needed to load documents.

misc_page.define_codemirror_extensions()
editor.define_codemirror_sagews_mode()
