exports.search_matches = (search, desc) ->
    if not search? or search.length == 0 # empty search matches everything
        return true
    if not desc # empty desc fails ALL nontrivial searches.
        return false
    t = desc.toLowerCase()
    for s in search
        if t.indexOf(s) == -1
            return false
        else if s[0] == '#'
            reg = new RegExp("#{s}(|\s|[^A-Za-z0-9_\-])")
            if not t.match(reg)
                return false
    return true
