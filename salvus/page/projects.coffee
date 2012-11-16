

update_project_list = undefined

controller.on "show_page_projects", () ->
    update_project_list?()
    $("#projects-find-input").focus()


( () ->

    project_list = undefined

    update_project_list = () ->
        salvus.conn.get_projects
            cb: (error, mesg) ->
                if not error and mesg.event == 'all_projects'
                    project_list = mesg.projects
                    project_list = project_list.concat(project_list)
                    project_list = project_list.concat(project_list)
                    project_list = project_list.concat(project_list)                                        
                    update_project_view()

    # keyup would do live "search as you type"; however, it is simply too slow on some devices.
    #$("#projects-find-input").keyup((event) -> update_project_view())

    page = 0
    $("#projects-find-input").change((event) -> page = 0; update_project_view())
    $("#projects").find(".form-search").find("button").click((event) -> page=0; update_project_view(); return false;)

    $("#projects-pager-previous").click((event) ->
        page = page-1
        if page < 0
            page = 0
        update_project_view()
        return false
    )
    
    $("#projects-pager-next").click((event) ->
        page = page+1
        update_project_view()        
        return false
    )


    update_project_view = () ->
        MAX_SHOW = 15
        if not project_list?
            return
        X = $("#projects-project_list")
        X.empty()
        $("#projects-count").html(project_list.length)
        find_text = $("#projects-find-input").val().toLowerCase()
        n = 0
        for project in project_list
            if find_text and (project.title+project.description).toLowerCase().indexOf(find_text) == -1
                continue
            n += 1
            if n < page*MAX_SHOW or n >= (page+1)*MAX_SHOW
                continue
            template = $("#projects-project_list_item_template")
            item = template.clone().show().data("project", project)
            if project.public
                $('#projects-public-icon').clone().show().prependTo(item)
            else
                $('#projects-private-icon').clone().show().prependTo(item)
                item.addClass("private-project")
                
            item.find("a").text(project.title)
            item.find(".lighten").text(project.description)
            item.click (event) ->
                open_project ($(@).data("project"))
                return false
            item.appendTo(X)

        $("#projects-more_projects").text(if n >= MAX_SHOW then "#{n-MAX_SHOW} more matching projects not shown..." else "")
        
    open_project = (project) ->
        console.log("STUB: open #{project.title}")
                

    ################################################
    # Create a New Project
    ################################################
    $("#new_project-button").click((event) -> create_project.modal('show'))

    create_project = $("#projects-create_project")

    close_create_project = () ->
        create_project.modal('hide').find('input').val('')
        
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
                    update_project_list()
        close_create_project()

)()