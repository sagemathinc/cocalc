###
Define a jQuery plugin that processes links.  This is temporary, and will go away
when we fully switch to react.
###

misc = require('smc-util/misc')

projects_load_target = require('./app-framework').redux.getActions('projects').load_target

load_target = (target, switch_to) ->
    # get rid of "?something" in "path/file.ext?something"
    i = target.lastIndexOf('/')
    if i > 0 and '?' in target[i..]
        j = target[i..].indexOf('?')
        target = target[...(i + j)]
    projects_load_target(target, switch_to)

# make all links open internally or in a new tab; etc.
# opts={project_id:?, file_path:path that contains file}
starts_with_cloud_url = (href) ->
    is_samedomain = misc.startswith(href, document.location.origin)
    is_formersmc  = document.location.origin == 'https://cocalc.com' and misc.startswith(href, "https://cloud.sagemath.com")
    return is_samedomain or is_formersmc

exports.starts_with_cloud_url = starts_with_cloud_url

$.fn.process_smc_links = (opts={}) ->
    @each ->
        e = $(this)
        # part #1: process <a> tags
        a = e.find('a')
        for x in a
            y = $(x)
            href = y.attr('href')
            if href?
                if href[0] == '#'
                    # CASE: internal link on same document - do not touch (e.g., sections in jupyter/sagews)
                    continue
                if misc.startswith(href, 'mailto:')
                    continue
                if opts.href_transform?
                    # special option; used, e.g., for Jupyter's attachment: url's
                    href = opts.href_transform(href)
                if starts_with_cloud_url(href) and href.indexOf('/projects/') != -1
                    # CASE: Link inside a specific browser tab.
                    # target starts with cloud URL or is absolute, and has /projects/ in it, so we open the
                    # link directly inside this browser tab.
                    # WARNING: there are cases that could be wrong via this heuristic, e.g., a raw link that happens
                    # to have /projects/ in it -- deal with them someday...
                    y.click (e) ->
                        url = $(@).attr('href')
                        i = url.indexOf('/projects/')
                        target = url.slice(i + '/projects/'.length)
                        load_target(decodeURI(target), not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false

                else if href.indexOf('http://') != 0 and href.indexOf('https://') != 0  # does not start with http
                    # internal link
                    y.click (e) ->
                        target = $(@).attr('href')
                        # if DEBUG then console.log "target", target
                        if target.indexOf('/projects/') == 0
                            # fully absolute (but without https://...)
                            target = decodeURI(target.slice('/projects/'.length))
                        else if target[0] == '/' and target[37] == '/' and misc.is_valid_uuid_string(target.slice(1,37))
                            # absolute path with /projects/ omitted -- /..project_id../files/....
                            target = decodeURI(target.slice(1))  # just get rid of leading slash
                        else if target[0] == '/' and opts.project_id
                            # absolute inside of project -- we CANNOT use join here
                            # since it is critical to **keep** the slash to get
                            #   .../files//path/to/somewhere
                            # Otherwise, there is now way to represent an absolute path.
                            # A URL isn't just a unix path in general.
                            target = opts.project_id + '/files/' + decodeURI(target)
                        else if opts.project_id and opts.file_path?
                            # realtive to current path
                            target = misc.normalized_path_join(opts.project_id, 'files', opts.file_path ? '', decodeURI(target) ? '')
                        load_target(target, not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false
                else
                    # make links open in a new tab by default
                    a.attr("target","_blank")
                    a.attr("rel", "noopener")

        # part #2: process <img>, <object> and <video>/<source> tags
        # make relative links to images use the raw server
        if opts.project_id and opts.file_path?
            for [tag, attr] in [['img', 'src'], ['object', 'data'], ['video', 'src'], ['source', 'src']]
                for x in e.find(tag)
                    y = $(x)
                    src = y.attr(attr)
                    if not src?
                        continue
                    if opts.href_transform?
                        src = opts.href_transform(src)
                    if src[0] == '/' or src.slice(0,5) == 'data:'
                        # absolute path or data: url
                        new_src = src
                    else
                        i = src.indexOf('/projects/')
                        j = src.indexOf('/files/')
                        if starts_with_cloud_url(href) and i != -1 and j != -1 and j > i
                            # the href is inside the app, points to the current project or another one
                            # j-i should be 36, unless we ever start to have different (vanity) project_ids
                            path = src.slice(j + '/files/'.length)
                            project_id = src.slice(i + '/projects/'.length, j) ? ''
                            new_src = misc.normalized_path_join('/', window.app_base_url, project_id, 'raw', path)
                            y.attr(attr, new_src)
                            continue
                        if src.indexOf('://') != -1
                            # link points somewhere else
                            continue
                        # we do not have an absolute url, hence we assume it is a relative URL to a file in a project
                        new_src = misc.normalized_path_join('/', window.app_base_url, opts.project_id, 'raw', opts.file_path, src)
                    y.attr(attr, new_src)

        return e
