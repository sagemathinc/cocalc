{salvus_client} = require('salvus_client')
{top_navbar}    = require('top_navbar')

top_navbar.on "switch_to_page-salvus-help", () ->
    update_stats()

update_stats = () ->
    salvus_client.server_stats
        cb : (err, stats) ->
            if err
                return
            X = $(".salvus-stats").show()
            X.find(".salvus-stats-accounts").text(stats.accounts)
            X.find(".salvus-stats-projects").text(stats.projects)
