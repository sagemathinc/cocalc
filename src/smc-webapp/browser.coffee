#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{redux} = require('./app-framework')

# Calling set_window_title will set the title, but also put a notification
# count to the left of the title; if called with no arguments just updates
# the count, maintaining the previous title.
notify_count = undefined
exports.set_notify_count_function = ->
    store = redux.getStore('file_use')
    notify_count = store.get_notify_count

last_title = ''
exports.set_window_title = (title) ->
    if not title?
        title = last_title
    last_title = title
    u = notify_count?()
    if u
        title = "(#{u}) #{title}"
    site_name = redux.getStore('customize').get('site_name')
    if title.length > 0
        document.title = title + " - " + site_name
    else
        document.title = site_name