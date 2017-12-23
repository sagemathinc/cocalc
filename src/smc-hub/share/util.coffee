# redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
exports.redirect_to_directory = (req, res) ->
    query = req.url.slice(req.path.length)
    res.redirect(301, req.baseUrl + req.path + '/' + query)

# this read the google analytics token from disk -- or returns undefined
exports.google_analytics_token = ->
    filename = (process.env.SMC_ROOT ? '.') + '/data/secrets/google_analytics'
    ga = undefined
    try
        fs = require('fs')
        ga = fs.readFileSync(filename).toString().trim()
    console.log("share/util/google_analytics_token: #{ga}")
    return ga

exports.path_to_files = (path, project_id) ->
    return path.replace('[project_id]', project_id)

