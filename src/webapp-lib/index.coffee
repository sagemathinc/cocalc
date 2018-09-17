# CoCalc: Collaborative Calculation in the Cloud
# Copyright (C) 2017, Sagemath Inc.
# License: AGPLv3+

# this is embedded into index.pug to do some dynamic changes.
# the overall goal is to be slick and simple to avoid any slowdowns whatsoever...

'use strict'

stat_rows = [
    ['Modified projects', 'projects_edited'],
    ['Created projects', 'projects_created'],
    ['Created accounts', 'accounts_created'],
]
opened_files = [
    ['Sage Worksheets',     'sagews'],
    ['Jupyter Notebooks',   'ipynb'],
    ['LaTeX Documents',     'tex'],
    ['Markdown',            'md']
]

sum_clients = (stats) ->
    hubs = stats?['hub_servers'] ? []
    s = 0
    for h in hubs
        s += h.clients ? 0
    return s


# improve understanding of large numbers
fmt = (num) ->
    num = parseInt(num)
    num.toLocaleString(undefined, {useGrouping:true, maximumSignificantDigits: 2})

update_stats = (stats) ->
    #console.log stats
    table  = document.getElementById('statstable')
    if table.rows.length >= 2
        for i in [table.rows.length...1]
            table.deleteRow(i-1)

    for [name, key] in stat_rows
        row    = table.insertRow()
        cell   = row.insertCell()
        cell.className = 'left'
        cell.innerHTML = "<strong>#{name}</strong>"
        for j in window.stat_times
            cell = row.insertCell()
            num = fmt(stats[key][j])
            cell.appendChild(document.createTextNode(num))

    row   = table.insertRow()
    delim = row.insertCell()
    delim.innerHTML = '&nbsp;'
    delim.setAttribute("colspan", 5)
    row   = table.insertRow()
    cell  = row.insertCell()
    cell.className = 'left'
    cell.innerHTML = '<strong>Edited files</strong>'
    cell  = row.insertCell()
    cell.setAttribute("colspan", 4)
    #cell.innerHTML = 'newly opened or edited'

    for [name, ext] in opened_files
        row     = table.insertRow()
        cell    = row.insertCell()
        cell.className = 'left'
        cell.innerHTML = "<strong>#{name}</strong>"
        for j in window.stat_times
            cell       = row.insertCell()
            total      = fmt(stats.files_opened?.total[j]?[ext] ? 0)
            # distinct   = fmt(stats.files_opened?.distinct[j]?[ext] ? 0)
            cell.innerHTML = "<span title='total files opened'>#{total}</span>"
            #   (<span title='distinct files opened'>#{distinct})</span>

    document.getElementById("sum_clients").innerHTML = sum_clients(stats)

get_stats = ->
    r = new XMLHttpRequest()
    r.open("GET", "./stats", true)
    r.onreadystatechange = ->
        return if r.readyState != 4 or r.status != 200
        try
            update_stats(JSON.parse(r.responseText))
        catch e
            console.log e
    r.send()
    # tail recursive callback
    setTimeout(get_stats, 90 * 1000)

init_video = ->
    for vplayer in document.getElementsByClassName("video-player")
        vid  = vplayer.getElementsByTagName("video")[0]
        over = vplayer.getElementsByClassName("video-overlay")[0]
        do (vplayer, vid, over) ->
            vplayer.onclick = (el) ->
                #console.log vplayer, over, vid
                vplayer.removeChild(over)
                vid.setAttribute("controls", "true")
                vid.setAttribute("loop", "true")
                vid.play()

find_parent = (el, matcher) ->
    while true
        el = el.parentElement
        return null if not el
        return el   if matcher(el)

init_magic_anchors = ->
    div_matcher = (el) ->
        is_div    = el.tagName.toUpperCase() == 'DIV'
        is_anchor = el.getAttribute("id")?
        return is_div and is_anchor

    for tag in ['h1', 'h2']
        for header in document.getElementsByTagName(tag)
            div = find_parent(header, div_matcher)
            continue if not div
            a_id   = "a-#{div.getAttribute('id')}"
            anchor = document.querySelector("a##{a_id}")
            continue if not anchor
            marker = document.createElement("a")
            marker.setAttribute("class", "marker")
            loc    = window.location
            marker_url = loc.href.slice(0, loc.href.length - loc.hash.length) + "##{a_id}"
            marker.setAttribute("href", marker_url)
            marker.appendChild(document.createTextNode('¶'))
            header.appendChild(marker)

document.addEventListener "DOMContentLoaded", ->
    if document.getElementById('statstable')?
        get_stats()
    init_video()
    init_magic_anchors()
