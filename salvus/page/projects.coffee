( () ->
    ################################################
    # Model
    ################################################
    class Projects
        constructor: () ->
            @project_list = []
        insert_project: (mesg) ->
            # todo

    projects = new Projects()
              

    update_project_list = () ->
        salvus.conn.get_projects
            cb: (error, projects) ->
                console.log(error, projects)



    ################################################
    # Create a New Project
    ################################################
    $("#new_project-button").click((event) -> create_project.modal('show'))

    create_project = $("#projects-create_project")

    close_create_project = () -> create_project.modal('hide').find('input').val('')
        
    create_project.find(".close").click((event) -> console.log('foo'); close_create_project())
    
    $("#projects-create_project-button-cancel").click((event) -> close_create_project())
    
    create_project.on("shown", () -> $("#projects-create_project-title").focus())

    $("#projects-create_project-button-create_project").click (event) ->
        title = $("#projects-create_project-title").val()
        if title == ""
            title = "Untitled"
        salvus.conn.create_project
            title       : title
            description : $("#projects-create_project-description").val()
            public      : $("#projects-create_project-public").is(":checked")
            cb : (error, mesg) ->
                if error
                    alert_message("Error creating project: #{error}")
                else
                    projects.insert_project(mesg)
        close_create_project()

)()