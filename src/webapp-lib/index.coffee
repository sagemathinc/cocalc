# CoCalc: Collaborative Calculation in the Cloud
# Copyright (C) 2017, Sagemath Inc.
# License: AGPLv3+

# this is embedded into index.pug to do some dynamic changes.
# the overall goal is to be slick and simple to avoid any slowdowns whatsoever...

stat_rows = [
    ['Modified projects', 'projects_edited'],
    ['Created projects', 'projects_created'],
    ['Created accounts', 'accounts_created'],
]

sum_clients = (stats) ->
    hubs = stats?['hub_servers'] ? []
    s = 0
    for h in hubs
        s += h.clients ? 0
    return s

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
        rowname = document.createElement("strong")
        rowname.appendChild(document.createTextNode(name))
        cell.appendChild(rowname)
        for j in window.stat_times
            cell   = row.insertCell()
            cell.appendChild(document.createTextNode("#{stats[key][j]}"))

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
    setTimeout(get_stats, 10 * 1000)

document.addEventListener "DOMContentLoaded", ->
    get_stats()
