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

# User names, project titles, and filenames get truncated this amount before display.
TRUNC = 32

misc    = require('misc')
editor  = require('editor')
history = require('history')
account = require('account')
async   = require('async')

{salvus_client} = require('salvus_client')

template               = $(".salvus-notification-template")
template_notification  = template.find(".salvus-notification")
notification_count     = $(".salvus-notification-unseen-count")
notification_list      = $(".salvus-notification-list")
notification_list_body = $(".salvus-notification-list-body")
notification_list_none = $(".salvus-notification-list-none")
notification_search    = $(".salvus-notification-list-search")

important_count = 0
exports.important_count = () -> important_count

search_list = []
update_search_list = () ->
    search_list = ($.trim(s).toLowerCase() for s in misc.search_split(notification_search.val().toLowerCase()))

matches_current_search = (x) ->
    if search_list.length == 0
        return true
    x = x.toLowerCase()
    for s in search_list
        if x.indexOf(s) == -1
            return false
    return true

namelist_to_display = (names) ->
    # foo
    # foo and bar
    # foo, bar and fubar
    # foo, bar, fubar and 1 other
    # foo, bar, fubar and 3 others
    z = ("<b>#{x}</b>" for x in names)
    if z.length <= 2
        return z.join(' and ')
    else if z.length == 3
        return "#{z[0]}, #{z[1]} and #{z[2]}"
    else if z.length == 4
        return "#{z[0]}, #{z[1]}, #{z[2]} and 1 other person"
    else
        return "#{z[0]}, #{z[1]}, #{z[2]} and #{z.length-3} other people"

path_to_display = (path) ->
    i = path.lastIndexOf('.')
    if i != -1
        ext = misc.trunc_left(path.slice(i), TRUNC)
        path = misc.trunc_left(path.slice(0,i), TRUNC)
        return "<b>#{path}</b><span class='lighten'>#{ext}</span>"
    else
        return "<b>#{misc.trunc_left(path, TRUNC)}</b>"

notification_elements = {}
render_notification = (x) ->
    #console.log("rendering #{misc.to_json(x)}")
    if not x.account_ids? or x.account_ids.length == 0
        # not enough info to render this notification (e.g., happens if notification log truncated)
        return
    name = "#{x.project_id}/#{x.path}"
    elt = notification_elements[name]
    hash = misc.hash_string(misc.to_json(x))
    if elt? and elt.data('last_hash') == hash
        # no change
        return

    if not elt?
        notification_elements[name] = elt = template_notification.clone()
        notification_list_body.append(elt)
        elt.data(project_id:x.project_id, path:x.path, name:name, comment:x.action == 'comment')
        elt.find(".salvus-notification-path-icon").addClass(editor.file_icon_class(misc.filename_extension(x.path)))
        elt.click () ->
            open_notification($(@))

    elt.data(last_hash:hash)

    titles_and_fullnames [x], (err) ->
        if err
            return
        users = namelist_to_display(x.fullnames)
        if x.path == ".sagemathcloud.log"
            if x.project_title?
                d = "#{users} used the <b>#{x.project_title}</b> project"
        else
            actions = []
            if x.actions['comment']
                actions.push('<i class="salvus-notification-commented">commented on</i>')
                elt.find(".salvus-notification-action-icon").addClass("salvus-notification-action-icon-comment")
            if x.actions['edit']
                actions.push("edited")
                elt.find(".salvus-notification-action-icon").removeClass("salvus-notification-action-icon-comment")

            action = actions.join(' and ')
            d = "#{users} #{action} #{path_to_display(x.path)}"
            if x.project_title?
                d += " in <b>#{x.project_title}</b>"
        desc = elt.find(".salvus-notification-desc")
        desc.html(d)

        if x.read
            elt.addClass('salvus-notification-read')
        else
            elt.removeClass('salvus-notification-read')

        try
            e = elt.find(".salvus-notification-time").find("span")
            e.timeago('dispose')
            f = $("<span>")
            e.replaceWith(f)
            if not x.timestamp
                x.timestamp = new Date() - 0
            if x.timestamp
                elt.data('timestamp', x.timestamp)
                date = new Date(x.timestamp)
                f.attr('title', date.toISOString()).timeago()
        catch err
            console.log("WARNING: activity notification invalid time ", x.timestamp, err)

        if not matches_current_search(desc.text())
            elt.hide()
        else
            elt.show()
            $(".salvus-notification-list-none").hide()

sort_notifications = () ->
    #console.log('sort_notifications')
    v = notification_list_body.children()
    v.sort (elt1, elt2) ->
        a = $(elt1).data('timestamp')
        b = $(elt2).data('timestamp')
        if not a?
            return 1
        if not b?
            return -1
        if a > b
            return -1
        else if a < b
            return +1
        return 0
    v.detach().appendTo(notification_list_body)

update_important_count = (recalculate) ->
    if recalculate and activity_log?
        important_count = 0
        for path, x of activity_log.notifications
            if x.important
                important_count += 1
    if important_count == 0
        notification_count.text('')
    else
        notification_count.text(important_count)
    require('misc_page').set_window_title()

update_which_notifications_are_shown = () ->
    update_search_list()
    num_visible = 0
    for e in notification_list_body.children()
        elt = $(e)
        if matches_current_search(elt.find(".salvus-notification-desc").text())
            elt.show()
            num_visible += 1
        else
            elt.hide()
    if num_visible == 0
        x = $(".salvus-notification-list-none")
        x.show()
        if search_list.list == 0
            x.find("span").hide()
        else
            x.find("span").show()
    else
        $(".salvus-notification-list-none").hide()

notification_search.keyup (e) ->
    if e?.keyCode == 27
        notification_search.val('')
    update_which_notifications_are_shown()

$(".salvus-notification-list-search-clear").click () ->
    notification_search.val('')
    notification_search.focus()
    update_which_notifications_are_shown()
    return false

notification_list_is_hidden = true

open_notification = (target) ->
    project_id = target.data('project_id')
    path       = target.data('path')
    comment    = target.data('comment')
    salvus_client.mark_activity
        events : [{path:target.data('name'), timestamp:target.data('timestamp')}]
        mark   : 'read'
    if path == '.sagemathcloud.log'
        history.load_target("projects/#{project_id}/log")
    else
        history.load_target("projects/#{project_id}/files/#{path}")
        if comment
            p = require('project').project_page(project_id:project_id)
            p.show_editor_chat_window(path)

unbind_handlers = () ->
    $(document).unbind('click', notification_list_click)
    $(window).unbind('resize', resize_notification_list)

resize_notification_list = () ->
    if not notification_list.is(":visible")
        return
    notification_list.removeAttr('style')  # gets rid of the custom height from before
    max_height = $(window).height() - notification_list.offset().top - 50
    if notification_list.height() > max_height
        notification_list.height(max_height)
    notification_list.hide(); notification_list.show()  # hack since on some browser scrollbar looks wrong otherwise.

notification_list_click = (e) ->
    target = $(e.target)
    if target.hasClass('salvus-notification-list-search')
        return
    unbind_handlers()
    notification_list.hide()
    notification_list_is_hidden = true
    return false

$(".salvus-notification-indicator").click () ->
    if notification_list_is_hidden
        notification_list.show()
        notification_search.focus()
        mark_visible_notifications_seen()
        $(document).click(notification_list_click)
        $(window).resize(resize_notification_list)
        resize_notification_list()

        # disable/blur any other editors that may be open...
        # This should be replaced by a function that calls some sort of
        # blur or disable function on the currently opened editor, if
        # there is one.  As of now, this is only needed for tasks, which
        # take over the keyboard when visible, so we just do it here.
        # ALSO: On closing the activity list, we should probably
        # explicitly restore the focus of the opened editor.
        require('tasks').unset_key_handler()

    else
        notification_list.hide()
        unbind_handlers()
    notification_list_is_hidden = not notification_list_is_hidden
    return false

mark_read_button = notification_list.find("a[href=#mark-all-read]").click () ->
    mark_visible_notifications_read()

# Go through the activity table of the notifications_syncdb database, if it is loaded,
# and ensure that there is at most one entry with each user_id/project_id/path.  If there are
# multiple entries with the same project_id/path, delete all but the one with the
# newest timestamp. After fixes, returns list of all notifications.
# Also, if any timestamp is in the future, set it to now.
all_notifications = () =>
    if not notifications_syncdb?
        return [] # nothing loaded yet
    return notifications_syncdb.select(where:{table:'activity'})

activity_log    = undefined
user_account_id = undefined

exports.get_activity_log = () -> activity_log

_init_activity_done = false
_init_activity_retry_interval = 2000
init_activity = () ->
    if _init_activity_done
        return
    #console.log('initializing activity: doing query...')
    t0 = misc.mswalltime()
    salvus_client.get_all_activity
        cb : (err, _activity_log) =>
            if err
                console.log("initializing activity: error=#{err}; will try later")
                setTimeout(init_activity, 15000)
                return
            #console.log("initializing activity: success! (query time=#{misc.mswalltime(t0)}ms)")
            if _init_activity_done
                # init_activity could have been called repeatedly at once, and one finished
                return
            $(".salvus-notification-indicator").show()
            _init_activity_done = true
            activity_log = _activity_log
            user_account_id = activity_log.account_id
            render_activity_log()

salvus_client.on "signed_in", () =>
    _init_activity_done = false
    init_activity()

process_recent_activity = (events) ->
    #console.log("new activity -- #{misc.to_json(events)}")
    if not activity_log?
        return
    activity_log.process(events)
    to_update = {}
    for e in events
        to_update["#{e.project_id}/#{e.path}"] = true
    for path,_ of to_update
        x = parse_notification_for_display(path, activity_log.notifications[path])
        render_notification(x)
    update_important_count(true)
    sort_notifications()

salvus_client.on('recent_activity', process_recent_activity)


mark_all_notifications = (mark) ->
    x = []
    for path, events of activity_log.notifications
        if not events[mark]
            x.push({path:path, timestamp:events.timestamp})
    salvus_client.mark_activity
        events : x
        mark   : mark
        cb     : (err) =>
            if err
                console.log("mark_all_notifications(mark=#{mark}): err=",err)

mark_visible_notifications = (mark) ->
    if not activity_log?
        return
    x = []
    for path, notification of activity_log.notifications
        if not notification[mark] or notification.timestamp > notification[mark]
            if notification_elements[path]?.is(":visible")
                x.push({path:path, timestamp:notification.timestamp})
    salvus_client.mark_activity
        events : x
        mark   : mark
        cb     : (err) =>
            if err
                console.log("mark_visible_notifications(#{mark}, events=#{misc.to_json(x)}): err=",err)

mark_visible_notifications_seen = () ->
    mark_visible_notifications('seen')
    update_important_count(true)

mark_visible_notifications_read = () ->
    mark_visible_notifications('read')

project_titles = (v, cb) ->
    project_ids = (x.project_id for x in v when not x.project_title?)
    if project_ids.length == 0
        cb?()
    else
        salvus_client.get_project_titles
            project_ids : project_ids
            cb          : (err, titles) ->
                if err
                    cb?(err)
                else
                    for project_id, title of titles
                        if title.length > TRUNC
                            titles[project_id] = misc.trunc(title, TRUNC)
                    for x in v
                        if not x.project_title?
                            x.project_title = titles[x.project_id]
                    cb?()

account_fullnames = (v, cb) ->
    account_ids = {}
    for x in v
        if not x.fullnames?
            for account_id in x.account_ids
                if account_id != user_account_id
                    account_ids[account_id] = true
    account_ids = misc.keys(account_ids)
    salvus_client.get_user_names
        account_ids : account_ids
        cb          : (err, names) ->
            if err
                cb(err)
            else
                names[user_account_id] = {first_name:"You", last_name:""}
                for x in v
                    if not x.fullnames? or x.fullnames.length != x.account_ids.length
                        x.fullnames = []
                        for account_id in x.account_ids
                            name = names[account_id]
                            x.fullnames.push(misc.trunc("#{name.first_name} #{name.last_name}".trim(), TRUNC))
                cb()

titles_and_fullnames = (v, cb) ->
    async.parallel([
        (cb) ->
            project_titles(v, cb)
        (cb) ->
            account_fullnames(v, cb)
    ], cb)

parse_notification_for_display = (path, notification) ->
    t = notification.timestamp
    x = {project_id:path.slice(0,36), path:path.slice(37), timestamp:t, actions:{}, account_ids:[]}
    accounts = []
    if notification.comment?
        x.actions['comment'] = true
        newest = 0
        seen = notification.seen
        for account_id, timestamp of notification.comment
            if account_id == user_account_id
                seen = Math.max(seen, timestamp)   # if we made comment count that as us seeing it
            newest = Math.max(newest, timestamp)
            accounts.push({account_id:account_id, timestamp:timestamp})
        if seen < newest
            # the user has not seen the comment.
            x.important = true   # unseen comment
    if notification.edit?
        x.actions['edit'] = true
        for account_id, timestamp of notification.edit
            accounts.push({account_id:account_id, timestamp:timestamp})
    accounts.sort(misc.timestamp_cmp)
    y = {}
    x.account_ids = []
    for k in accounts
        if not y[k.account_id]?
            y[k.account_id] = true
            x.account_ids.push(k.account_id)

    if notification.read? and notification.read >= t
        x.read = true
    if notification.seen? and notification.seen >= t
        x.seen = true

    #console.log("#{misc.to_json(notification)} --> #{misc.to_json(x)} ")
    notification.important = x.important  # used for updating important count

    return x

all_activities = (cb) ->
    if not activity_log?
        cb(undefined, [])
        return
    v = []
    for path, notification of activity_log.notifications
        x = parse_notification_for_display(path, notification)
        v.push(x)

    titles_and_fullnames v, (err) =>
        if err
            cb(err)
        else
            cb(undefined, v)

render_activity_log = (cb) ->
    #console.log("render_activity_log")
    important_count = 0
    if not activity_log?
        return
    all_activities (err, v) ->
        if err
            cb?(err)
        else
            v.sort(misc.timestamp_cmp)
            #console.log("all_activities=",v)
            #notification_list_body.empty()
            for x in v
                render_notification(x)
                if x.important
                    important_count += 1
            $(".salvus-notification-list-loading").hide()
            if v.length == 0
                $(".salvus-notification-list-none").show()
            update_important_count(false)
            cb?()


