{IS_MOBILE} = require("feature")

templates = $(".salvus-course-templates")

exports.course = (project_id, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(project_id, filename, element)
    return element


class Course
    constructor : (@project_id, @filename, @element) ->
        @element.data('course', @)

    show: () =>
        if not IS_MOBILE
            @element.maxheight()
