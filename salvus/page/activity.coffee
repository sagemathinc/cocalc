# activity.coffee

misc = require('misc')
editor = require('editor')
history = require('history')
account = require('account')
{salvus_client} = require('salvus_client')

template               = $(".salvus-notification-template")
template_notification  = template.find(".salvus-notification")
notification_count     = $(".salvus-notification-unseen-count")
notification_list      = $(".salvus-notification-list")
notification_list_body = $(".salvus-notification-list-body")
notification_list_none = $(".salvus-notification-list-none")
notification_search    = $(".salvus-notification-list-search")


# key: project_id/path
# value: the actual notifications for that project_id/path
notifications = {}
processed_notifications = []
account_id = undefined

# this is useful for debugging
exports.notifications = () -> return notifications

timestamp_cmp = (a,b) ->
    if a.timestamp > b.timestamp
        return -1
    else if a.timestamp < b.timestamp
        return +1
    return 0

# n is a bunch of notifications for a given path in a project, in order from newest to oldest
# This function basically takes all the recent info about activity on a file you care about,
# and decides on what notification to show you regarding it.  It will get tweaked a lot, and
# should be configurable as well.
process_notification_stream = (n) ->
    m = {}
    if n.length == 0
        return m
    i = 0
    valid = false
    n.sort(timestamp_cmp)
    for x in n
        if x.account_id != account_id
            valid = true
            for k,v of x
                m[k] = v
            if x.comment != 'chat'
                # check if there was a chat before any older read/seen
                for j in [i+1...n.length]
                    if n[j].comment in ['read', 'seen']
                        break
                    if n[j].comment == 'chat'
                        x.comment = 'chat'
                        break
            return m
        else
            m[x.comment] = true  # 'read', 'seen'
        i += 1
    if not valid  # due to truncation/ttl, not enough notification to even know the path -- so no point in retaining.
        return undefined
    else
        return m

process_notifications = () ->
    #console.log("process_notifications")
    processed_notifications = []
    for k, n of notifications
        #console.log("input: #{misc.to_json(n)}")
        m = process_notification_stream(n)
        if m?
            if m.project_title?
                m.project_title = $("<div>").html(m.project_title).text()  # TODO: ugly
            processed_notifications.push(m)
        #console.log("output: #{misc.to_json(m)}")
    processed_notifications.sort(timestamp_cmp)


salvus_client.on 'activity_notifications', (mesg) ->
    account_id = account.account_settings.account_id()  # used elsewhere
    $(".salvus-notification-list-loading").hide()
    notification_search.show()

    for m in mesg.notifications
        key = "#{m.project_id}/#{m.path}"
        v = notifications[key]
        if not v?
            notifications[key] = [m]
        else
            v.unshift(m)
    process_notifications()
    render_notifications()

unseen_count = 0
exports.unseen_count = () -> unseen_count

unseen_visible_notifications = []
mark_visible_notifications_seen = () ->
    for {project_id, path} in unseen_visible_notifications
        salvus_client.add_comment_to_activity_notification_stream
            project_id : project_id
            path       : path
            comment    : 'seen'

unread_visible_notifications = []
mark_visible_notifications_read = () ->
    for {project_id, path} in unread_visible_notifications
        salvus_client.add_comment_to_activity_notification_stream
            project_id : project_id
            path       : path
            comment    : 'read'

render_notifications = () ->
    #console.log("render_notifications")
    unseen_count = 0
    notification_list_body.empty()
    search = []
    for s in misc.search_split(notification_search.val().toLowerCase())
        s = $.trim(s).toLowerCase()
        search.push(s)

    unseen_visible_notifications = []
    unread_visible_notifications = []
    number_shown = 0
    for x in processed_notifications
        n = template_notification.clone()
        if x.comment == 'chat'
            action = 'commented on'
        else
            action = 'edited'
        if x.path == ".sagemathcloud.log"
            if x.project_title?
                d = "<b>#{x.fullname}</b> used the <b>#{x.project_title}</b> project"
        else
            d = "<b>#{x.fullname}</b> #{action} <b>#{x.path}</b>"
            if x.project_title?
                d += " in <b>#{x.project_title}</b>"

        if x.read
            n.addClass('salvus-notification-read')
        if not x.seen
            unseen_count += 1
        include = true
        if search.length > 0
            d0 = d.toLowerCase()
        for s in search
            if d0.indexOf(s) == -1
                include = false
                break
        if include
            if not x.seen
                unseen_visible_notifications.push(project_id:x.project_id, path:x.path)
            if not x.read
                unread_visible_notifications.push(project_id:x.project_id, path:x.path)

            number_shown += 1
            n.data(project_id:x.project_id, path:x.path)
            n.find(".salvus-notification-path-icon").addClass(editor.file_icon_class(misc.filename_extension(x.path)))
            n.find(".salvus-notification-desc").html(d)
            n.click () ->
                open_notification($(@))
            notification_list_body.append(n)
            date = new Date(x.timestamp)
            try
                n.find(".salvus-notification-time").attr('title', date.toISOString()).timeago()
            catch
                console.log("activity notification invalid time ", x)

    if number_shown == 0
        notification_list_none.show()
    else
        notification_list_none.hide()

    if unseen_count == 0
        notification_count.text('')
    else
        notification_count.text(unseen_count)

    if unread_visible_notifications.length == 0
        mark_read_button.addClass('disabled')
    else
        mark_read_button.removeClass('disabled')

    require('misc_page').set_window_title()
    #console.log("render_notifications: #{number_shown} visible")

notification_search.keyup (e) ->
    if e?.keyCode == 27
        notification_search.val('')
    render_notifications()

$(".salvus-notification-list-search-clear").click () ->
    notification_search.val('')
    render_notifications()
    return false

hidden = true

open_notification = (target) ->
    project_id = target.data('project_id')
    path = target.data('path')
    salvus_client.add_comment_to_activity_notification_stream
        project_id : project_id
        path       : path
        comment    : 'read'
    if path == '.sagemathcloud.log'
        history.load_target("projects/#{project_id}")
    else
        history.load_target("projects/#{project_id}/files/#{path}")

unbind_handlers = () ->
    $(document).unbind('click', notification_list_click)
    $(window).unbind('resize', resize_notification_list)

resize_notification_list = () ->
    notification_list.removeAttr('style')  # gets rid of the custom height from before
    max_height = $(window).height() - notification_list.offset().top - 50
    if notification_list.height() > max_height
        notification_list.height(max_height)

notification_list_click = (e) ->
    target = $(e.target)
    if target.hasClass('salvus-notification-list-search')
        return
    unbind_handlers()
    notification_list.hide()
    hidden = true
    return false

$(".salvus-notification-indicator").click () ->
    if hidden
        notification_list.show()
        mark_visible_notifications_seen()
        $(document).click(notification_list_click)
        $(window).resize(resize_notification_list)
    else
        notification_list.hide()
        unbind_handlers()
    hidden = not hidden
    return false

mark_read_button = notification_list.find("a[href=#mark-all-read]").click () ->
    mark_visible_notifications_read()


