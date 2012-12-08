###########################################################
#
# This should be the last code run on client application startup.
#
###########################################################

{top_navbar} = require('top_navbar')

top_navbar.hide_page_button("projects")
top_navbar.hide_page_button("worksheet1")
top_navbar.hide_page_button("worksheet")
top_navbar.switch_to_page("account")

window.history.pushState("", "", "/")  # this gets rid of the "3" part of URL


