###############################################################################
# The Project Files page
###############################################################################

project_page = undefined # export


(() ->
    class ProjectPage
        
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
            $("#project-project_title").text(@project.title)
            $("#project-project_description").text(@project.description)
            return @



    project_page = new ProjectPage()
)()    