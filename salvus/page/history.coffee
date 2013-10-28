###
Code related to the history and URL in the browser bar.

The URI schema is as follows:

    Overall help:
       https://cloud.sagemath.com/projects/help

    Overall settings:
       https://cloud.sagemath.com/projects/settings

    Projects Page:
       https://cloud.sagemath.com/projects/

    Specific project:
       https://cloud.sagemath.com/projects/project-id/

    Create new file page (in given directory):
       https://cloud.sagemath.com/projects/project-id/new/path/to/dir

    Search (in given directory):
       https://cloud.sagemath.com/projects/project-id/search/path/to/dir

    Settings:
       https://cloud.sagemath.com/projects/project-id/settings

    Log:
       https://cloud.sagemath.com/projects/project-id/log

    Directory listing (must have slash at end):
      https://cloud.sagemath.com/projects/project-id/files/path/to/dir/

    Open file:
      https://cloud.sagemath.com/projects/project-id/files/path/to/file

    (From before) raw http:
      https://cloud.sagemath.com/projects/project-id/raw/path/...

    (From before) proxy server (supports websockets and ssl) to a given port.
      https://cloud.sagemath.com/projects/project-id/port/<number>/.

###

{top_navbar} = require('top_navbar')
projects     = require('projects')

exports.push_state = (location) ->


# Now load any specific page/project/previous state
exports.load_target = load_target = (target) ->
    #console.log("load_target('#{target}')")
    if not target
        return
    segments = target.split('/')
    switch segments[0]
        when 'help'
            top_navbar.switch_to_page("salvus-help")
        when 'projects'
            if segments.length > 1
                projects.load_target(segments.slice(1).join('/'))
            else
                top_navbar.switch_to_page("projects")
        when 'settings'
            top_navbar.switch_to_page("account")

window.onpopstate = (event) ->
    #console.log("location: " + document.location + ", state: " + JSON.stringify(event.state))
    load_target(decodeURIComponent(document.location.pathname.slice(window.salvus_base_url.length + 1)))
