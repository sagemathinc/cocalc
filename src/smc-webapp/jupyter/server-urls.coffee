###
Functions for getting or formatting url's for various backend endpoints
###

exports.get_server_url = (project_id) ->
    return "#{window?.app_base_url ? ''}/#{project_id}/raw/.smc/jupyter"

exports.get_blob_url = (project_id, extension, sha1) ->
    return "#{exports.get_server_url(project_id)}/blobs/a.#{extension}?sha1=#{sha1}"

exports.get_logo_url = (project_id, kernel) ->
    return "#{exports.get_server_url(project_id)}/kernelspecs/#{kernel}/logo-64x64.png"

exports.get_complete_url = (project_id, path, code, cursor_pos) ->
    s = "#{exports.get_server_url(project_id)}/kernels/complete?code=#{encodeURIComponent(code)}&path=#{encodeURIComponent(path)}"
    if cursor_pos?
        s += "&cursor_pos=#{encodeURIComponent(cursor_pos)}"
    return s

exports.get_introspect_url = (project_id, path, code, cursor_pos, level) ->
    s = "#{exports.get_server_url(project_id)}/kernels/introspect?code=#{encodeURIComponent(code)}&path=#{encodeURIComponent(path)}"
    if cursor_pos?
        s += "&cursor_pos=#{encodeURIComponent(cursor_pos)}"
    if level?
        s += "&level=#{encodeURIComponent(level)}"
    return s

exports.get_store_url = (project_id, path, key, value) ->
    s = "#{exports.get_server_url(project_id)}/kernels/store?key=#{encodeURIComponent(JSON.stringify(key))}&path=#{encodeURIComponent(path)}"
    if value?
        s += "value=#{encodeURIComponent(JSON.stringify(value))}"
    return s

# signal should be SIGINT or SIGKILL (see https://nodejs.org/api/process.html#process_process_kill_pid_signal)
exports.get_signal_url = (project_id, path, signal) ->
    return "#{exports.get_server_url(project_id)}/kernels/signal/#{signal}?path=#{encodeURIComponent(path)}"

exports.get_kernel_info_url = (project_id, path) ->
    return "#{exports.get_server_url(project_id)}/kernels/kernel_info?path=#{encodeURIComponent(path)}"

# get more output messages for the given id
exports.get_more_output_url = (project_id, path, id) ->
    return "#{exports.get_server_url(project_id)}/kernels/more_output?path=#{encodeURIComponent(path)}&id=#{encodeURIComponent(id)}"

