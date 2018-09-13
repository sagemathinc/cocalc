matches = (s, desc) ->
    if desc.indexOf(s) == -1
        return false
    if s[0] == '#'
        # only match hashtag at end of word (the \b), so #fo does not match #foo.
        if desc.search(new RegExp(s + '\\b')) == -1
            return false
    return true

exports.search_matches = (search, desc) ->
    if not search? or search.length == 0 # empty search matches everything
        return true
    if not desc # empty desc fails ALL nontrivial searches.
        return false
    desc = desc.toLowerCase()
    for s in search
        if s == '-'
            # a minus by itself should just be ignored...
            return true
        else if s[0] == '-'
            # negated search
            if matches(s.slice(1), desc)
                return false
        else
            if not matches(s, desc)
                return false
    return true

exports.get_search = (view, relevant_tags) =>
    if not view?
        return ''
    search = view.get('search') ? ''
    view.get('selected_hashtags')?.forEach (state, tag) ->
        if not relevant_tags[tag]
            return
        if state == 1
            search += ' #'  + tag + ' '
        else if state == -1
            search += ' -#' + tag + ' '
        return

    return search

