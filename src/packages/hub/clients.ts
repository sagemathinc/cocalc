//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

const clients: { [id: string]: any } = {};

export function getClients() {
  return clients;
}

export function pushToClient(mesg: { client_id: string }): void {
  clients[mesg.client_id]?.push_to_client(mesg);
}
