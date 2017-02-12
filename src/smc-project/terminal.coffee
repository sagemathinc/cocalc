###
Terminal support inside a project

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###

# Map from uuid's to sessions
sessions = {}

exports.get_session = (socket, mesg) ->

