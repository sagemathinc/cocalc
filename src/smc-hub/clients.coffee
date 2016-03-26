clients = {}

exports.get_clients = () ->
    return clients

exports.push_to_client = (mesg) ->
    clients[mesg.client_id]?.push_to_client(mesg)