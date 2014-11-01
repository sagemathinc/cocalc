# activity.coffee

misc = require('misc')

# key: project_id, path, user_id
# value: the actual notification
notifications = {}

require('salvus_client').salvus_client.on 'activity_notifications', (mesg) ->
    for m in mesg.notifications
        key = "#{m.project_id}/#{m.path}:#{m.account_id}:#{m.comment}"
        notifications[key] = m
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
    v.sort (a,b) ->
        if a.timestamp < b.timestamp
            return -1
        else if a.timestamp > b.timestamp
            return +1
        return 0

    unread_count = 0
    notification_list_body.empty()
    search = []
    for x in misc.search_split($(".salvus-notification-list-search").val().toLowerCase())
        x = $.trim(x).toLowerCase()
        search.push(x)

    for x in v
        n = template_notification.clone()
        if x.comment == 'chat'
            action = 'commented on'
        else
            action = 'edited'
        if x.path == ".sagemathcloud.log"
            if x.project_title?
                d = "<b>#{x.fullname}</b> used <a>#{x.project_title}</a>"
        else
            d = "<b>#{x.fullname}</b> #{action} <a>#{x.path}</a>"
            if x.project_title?
                d += " in <a>#{x.project_title}</a>"

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
            n.find(".salvus-notification-desc").html(d)
            notification_list_body.prepend(n)
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

f = (e) ->
    target = $(e.target)
    if target.hasClass('salvus-notification-list-search')
        return
    #console.log(target)
    $(document).unbind('click', f)
    notification_list.hide()
    hidden = true
    return false

$(".salvus-notification-indicator").click () =>
    if hidden
        notification_list.show()
        $(document).click(f)
    else
        notification_list.hide()
        $(document).unbind('click', f)
    hidden = not hidden
    return false




