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


###########################################################
#
# This should be the last code run on client application startup.
#
###########################################################

{top_navbar} = require('top_navbar')
top_navbar.hide_page_button("projects")
#top_navbar.hide_page_button("salvus-help")

misc_page = require('misc_page')
editor    = require('editor')

# see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
# I have some concern about performance.
$(document).on "click", (e) ->
    if e.button == 1 and $(e.target).hasClass("salvus-no-middle-click")
        e.preventDefault()
        e.stopPropagation() # ?

# asynchronously load additional dependencies, e.g., CodeMirror, term.js....
# These are things that aren't needed for the initial page initialization,
# but are needed to load documents.

misc_page.define_codemirror_extensions()
editor.define_codemirror_sagews_mode()

if window.salvus_target and not localStorage.remember_me and window.salvus_target != 'login'
    require('history').load_target(window.salvus_target)
else
    top_navbar.switch_to_page('account')

# Run MathJax on certain elements of the page
$(".salvus-mathjax-on-startup").mathjax()
