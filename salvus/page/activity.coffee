# activity.coffee

misc = require('misc')
editor = require('editor')
history = require('history')

# key: project_id/path
# value: the actual notifications for that project_id/path
notifications = {}

timestamp_cmp = (a,b) ->
    if a.timestamp > b.timestamp
        return -1
    else if a.timestamp < b.timestamp
        return +1
    return 0

require('salvus_client').salvus_client.on 'activity_notifications', (mesg) ->
    for m in mesg.notifications
        key = "#{m.project_id}/#{m.path}"
        v = notifications[key]
        if not v?
            notifications[key] = [m]
        else
            v.push(m)
            v.sort(timestamp_cmp)
    window.n = notifications
    render_notifications()

template               = $(".salvus-notification-template")
template_notification  = template.find(".salvus-notification")
notification_count     = $(".salvus-notification-unseen-count")
notification_list      = $(".salvus-notification-list")
notification_list_body = $(".salvus-notification-list-body")

unread_count = 0
exports.unread_count = () -> unread_count

render_notifications = () ->
    v = (x for k,x of notifications)
    v.sort((a,b) -> timestamp_cmp(a[0],b[0]))

    unread_count = 0
    notification_list_body.empty()
    search = []
    for s in misc.search_split($(".salvus-notification-list-search").val().toLowerCase())
        s = $.trim(s).toLowerCase()
        search.push(s)

    for m in v
        n = template_notification.clone()
        x = m[0] # for now -- in general do more analysis based on all notifications
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
        else
            unread_count += 1
        include = true
        if search.length > 0
            d0 = d.toLowerCase()
        for s in search
            if d0.indexOf(s) == -1
                include = false
                break
        if include
            n.data(project_id:x.project_id, path:x.path)
            n.find(".salvus-notification-path-icon").addClass(editor.file_icon_class(misc.filename_extension(x.path)))
            n.find(".salvus-notification-desc").html(d)
            n.click () ->
                open_notification($(@))
            notification_list_body.append(n)
            date = new Date(x.timestamp)
            n.find(".salvus-notification-time").attr('title', date.toISOString()).timeago()

    if v.length == 0
        notification_list_body.append("<span class='lighten'>No notifications loaded...</span>")

    if unread_count == 0
        notification_count.text('')
    else
        notification_count.text(unread_count)


    require('misc_page').set_window_title()

$(".salvus-notification-list-search").keyup (e) =>
    if e?.keyCode == 27
        $(".salvus-notification-list-search").val('')
    render_notifications()

hidden = true

open_notification = (target) ->
    project_id = target.data('project_id')
    path = target.data('path')
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

$(".salvus-notification-indicator").click () =>
    if hidden
        notification_list.show()
        $(document).click(notification_list_click)
        $(window).resize(resize_notification_list)
    else
        notification_list.hide()
        unbind_handlers()
    hidden = not hidden
    return false




