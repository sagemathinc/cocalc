###############################################################################
# The Project Files page
###############################################################################

project_page = undefined # export


(() ->
    MAX_TITLE_LENGTH = 25
    
    class ProjectPage
        constructor: (@project_id) ->
            @container = $("#project-template").clone()
            $("#footer").before(@container)
            @container.top_navbar
                id    : @project_id
                label : @project_id
            
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
            console.log(@project)
            if not @project?
                return
                
            @container.find(".project-project_title").text(@project.title)
            @container.find(".project-project_description").text(@project.description)

            label = @project.title.slice(0,MAX_TITLE_LENGTH) + if @project.title.length > MAX_TITLE_LENGTH then "..." else ""
            top_navbar.set_button_label(@project.project_id, label)
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