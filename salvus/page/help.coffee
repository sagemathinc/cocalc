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


{salvus_client} = require('salvus_client')
{top_navbar}    = require('top_navbar')

top_navbar.on "switch_to_page-salvus-help", () ->
    window.history.pushState("", "", window.salvus_base_url + '/help')
    update_stats()

update_stats = () ->
    $(".salvus-stats").find("i.fa-refresh").addClass('fa-spin')
    salvus_client.server_stats
        cb : (err, stats) ->
            $(".salvus-stats").find("i.fa-refresh").removeClass('fa-spin')
            if err
                return
            X = $(".salvus-stats").show()
            X.find(".salvus-stats-accounts").text(stats.accounts)
            X.find(".salvus-stats-projects").text(stats.projects)
            X.find(".salvus-stats-active_projects").text(stats.active_projects)
            X.find(".salvus-stats-last_day_projects").text(stats.last_day_projects)
            X.find(".salvus-stats-last_week_projects").text(stats.last_week_projects)
            #X.find(".salvus-stats-last_month_projects").text(stats.last_month_projects)

            if stats.hub_servers.length == 0
                n = 0
            else
                n = (x['clients'] for x in stats.hub_servers).reduce((s,t) -> s+t)
            X.find(".salvus-stats-number-of-clients").text(n)

$(".salvus-stats").find("a[href=#refresh-status]").click () ->
    update_stats()
    return false


