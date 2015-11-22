{Map} = require('immutable')
exports.rootReducer = (state = Map(), action) ->
    switch action.type
        when 'GOT_ARCHIVE_CONTENTS'
            return state.merge Map
                error : action.error
                info : action.info
                contents : action.contents
                file_type : action.file_type
        when 'STARTED_EXTRACTING_ARCHIVE'
            return state.merge Map
                command : action.command
                loading : true
        when 'FINISHED_EXTRACTING_ARCHIVE'
            return state.merge Map
                error : action.error
                extract_output : action.extract_output
                loading : false
    return state