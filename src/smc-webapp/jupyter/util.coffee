###
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!
###

exports.get_server_url = (project_id) ->
    return "#{window?.smc_base_url ? ''}/#{project_id}/raw/.smc/jupyter"

exports.get_blob_url = (project_id, extension, sha1) ->
    return "#{exports.get_server_url(project_id)}/blobs/a.#{extension}?sha1=#{sha1}"

exports.get_logo_url = (project_id, kernel) ->
    return "#{exports.get_server_url(project_id)}/kernelspecs/#{kernel}/logo-64x64.png"
