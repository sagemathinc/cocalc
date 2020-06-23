#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

BASE_URL = ''

exports.init = (base_url) ->
    BASE_URL = base_url
    # make sure base_url doesn't end in slash
    while BASE_URL and BASE_URL[BASE_URL.length-1] == '/'
        BASE_URL = BASE_URL.slice(0, BASE_URL.length-1)
    return BASE_URL

exports.base_url = ->
    return BASE_URL