###
Terminal support from the hub

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###

# Map from project_id-session_id to session streams.
sessions = {}

# Return an object that is just like the stream in the project,
# but is proxied over the socket connection to the local_hub
# using a binary channel.

exports.get_session = (local_hub, session_id, term_opts, cb) ->