###############################################################################
# The Project Files page
###############################################################################

project_page = undefined # export


(() ->
    class ProjectPage
        constructor: (@project_id) ->
            @container = $("#project-template").clone()
            
        set_model: (project) ->
            @project = project
            @update_view()
                
        load_from_server: (opts) ->
            opts = defaults opts,
                project_id : required
                cb         : undefined
                
            salvus.conn.get_project
                cb : (error, project) =>
                    if error
                        opts.cb?(error)
                    else
                        @project = project
                        @update_view()
                        opts.cb?()

        save_to_server: (opts) ->
            opts = defaults opts,
                timeout : 10
                
            salvus.conn.update_project_data
                data    : @project
                cb      : opts.cb  
                timeout : opts.timeout
            
        update_view: () ->
            if not @project?
                return
            @container.find(".project-project_title").text(@project.title)
            @container.find(".project-project_description").text(@project.description)
            return @


    project_pages = {}

    # Function that returns the project page for the project with given id,
    # or creates it if it doesn't exist.
    project_page = (project_id) ->
        p = project_pages[project_id]
        if p?
            return p
        p = new ProjectPage(project_id)
        project_pages[project_id] = p
        return p
        
)()    