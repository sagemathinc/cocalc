#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

clients = {}

exports.get_clients = () ->
    return clients

exports.push_to_client = (mesg) ->
    clients[mesg.client_id]?.push_to_client(mesg)