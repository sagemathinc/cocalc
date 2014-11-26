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


notifications_syncdb = undefined
exports.get_notifications_syncdb = get_notifications_syncdb = (cb) ->
    if notifications_syncdb?
        cb(undefined, notifications_syncdb)
        return
    salvus_client.get_notifications_syncdb
        cb : (err, string_id) =>
            if err
                cb(err)
            else
                require('syncstring').syncdb
                    string_id : string_id
                    cb        : (err, db) =>
                        if err
                            cb(err)
                        else
                            notifications_syncdb = db
                            cb(undefined, db)

_init_notifications_done = false
init_notifications = () ->
    if _init_notifications_done
        return
    #console.log('initializing notifications')
    get_notifications_syncdb (err, db) ->
        if err
            $(".salvus-notification-indicator").hide()
            setTimeout(init_notifications, 30000) # try again later
            return
        $(".salvus-notification-indicator").show()
        if _init_notifications_done
            # init_notifications must have been called repeatedly at once, and one finished
            return
        _init_notifications_done = true
        render_notifications()
        db.on 'change', update_notifications

salvus_client.on("signed_in", init_notifications)

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

notification_elements = {}
render_notification = (x, init) ->
    #console.log("rendering #{misc.to_json(x)}")
    name = "#{x.project_id}/#{x.path}"
    if not init
        elt = notification_elements[name]

    if not elt?
        notification_elements[name] = elt = template_notification.clone()
        notification_list_body.append(elt)
        elt.data(project_id:x.project_id, path:x.path, name:name, comment:x.actions?['comment'])
        elt.find(".salvus-notification-path-icon").addClass(editor.file_icon_class(misc.filename_extension(x.path)))
        elt.click () ->
            open_notification($(@))

    if x.path == ".sagemathcloud.log"
        if x.project_title?
            d = "<b>#{x.fullname}</b> used the <b>#{x.project_title}</b> project"
    else
        actions = []
        if x.actions?['comment']
            actions.push('<i class="salvus-notification-commented">commented on</i>')
            elt.find(".salvus-notification-action-icon").addClass("salvus-notification-action-icon-comment")
        else
            elt.find(".salvus-notification-action-icon").removeClass("salvus-notification-action-icon-comment")
        if x.actions?['edit']
            actions.push('edited')
        if actions.length == 0
            actions = ['used']
        action = actions.join(' and ')
        d = "<b>#{x.fullname}</b> #{action} <b>#{x.path}</b>"
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

timestamp_cmp = (a,b) ->
    a = a.timestamp
    b = b.timestamp
    if not a?
        return 1
    if not b?
        return -1
    if a > b
        return -1
    else if a < b
        return +1
    return 0

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

DELETE_OLD_DAYS = 30
render_notifications = () ->
    #console.log("render_notifications")
    notification_list_body.empty()
    important_count = 0
    v = notifications_syncdb.select(where:{table:'activity'})
    v.sort(timestamp_cmp)
    too_old = new Date() - 1000*60*60*24*DELETE_OLD_DAYS
    i = 0
    for x in v
        i += 1
        # only bother deleting old notifications after we have a lot of them.
        if i>40 and x.timestamp? and x.timestamp <= too_old
            notifications_syncdb.delete(where:{table:'activity',project_id:x.project_id,path:x.path})
            continue

        render_notification(x, true)
        if is_important(x)
            important_count += 1
    $(".salvus-notification-list-loading").hide()
    if v.length == 0
        $(".salvus-notification-list-none").show()
    update_important_count(false)

is_important = (x) -> not x.seen and x.actions?['comment']

update_important_count = (recalculate) ->
    if recalculate
        important_count = (x for x in notifications_syncdb.select(where:{table:'activity'}) when is_important(x)).length

    if important_count == 0
        notification_count.text('')
    else
        notification_count.text(important_count)

    #if unread_visible_notifications.length == 0
    #    mark_read_button.addClass('disabled')
    #else
    #    mark_read_button.removeClass('disabled')

    require('misc_page').set_window_title()


update_notifications = (changes) ->
    #console.log("update_notifications: #{misc.to_json(changes)}")
    for c in changes
        if c.insert?
            render_notification(c.insert)
    update_important_count(true)
    sort_notifications()
    resize_notification_list()

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
    path = target.data('path')
    comment = target.data('comment')
    notifications_syncdb?.update
        set   : {read:true}
        where :
            project_id : project_id
            path       : path
    if path == '.sagemathcloud.log'
        history.load_target("projects/#{project_id}")
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
    else
        notification_list.hide()
        unbind_handlers()
    notification_list_is_hidden = not notification_list_is_hidden
    return false

mark_read_button = notification_list.find("a[href=#mark-all-read]").click () ->
    mark_visible_notifications_read()


mark_visible_notifications = (mark) ->
    set = {}; set[mark] = true
    for x in notifications_syncdb.select(where:{table:'activity'})
        if not x[mark]
            elt = notification_elements["#{x.project_id}/#{x.path}"]
            if elt.is(":visible")
                notifications_syncdb.update
                    set   : set
                    where :
                        project_id : x.project_id
                        path       : x.path
                x[mark] = true
                render_notification(x, false)

mark_visible_notifications_seen = () ->
    mark_visible_notifications('seen')
    update_important_count(true)

mark_visible_notifications_read = () ->
    mark_visible_notifications('read')














