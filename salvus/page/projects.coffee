( () ->

    update_project_list = () ->
        salvus.conn.get_projects
            cb: (error, projects) ->
                console.log(error, projects)

    
)()