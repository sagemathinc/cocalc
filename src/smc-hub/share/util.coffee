# redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
exports.redirect_to_directory = (req, res) ->
    query = req.url.slice(req.path.length)
    res.redirect(301, req.baseUrl + req.path + '/' + query)

