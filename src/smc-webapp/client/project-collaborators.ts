/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "smc-util/message";
import { AsyncCall } from "./client";

export class ProjectCollaborators {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  private async call(message: object): Promise<any> {
    return await this.async_call({ message });
  }

  public async invite_noncloud(opts: {
    project_id: string;
    title: string;
    link2proj: string;
    replyto?: string;
    replyto_name?: string;
    to: string;
    email: string; // body in HTML format
    subject?: string;
  }): Promise<any> {
    return await this.call(message.invite_noncloud_collaborators(opts));
  }

  public async invite(opts: {
    project_id: string;
    account_id: string;
    title?: string;
    link2proj?: string;
    replyto?: string;
    replyto_name?: string;
    email?: string;
    subject?: string;
  }): Promise<any> {
    return await this.call(message.invite_collaborator(opts));
  }

  public async remove(opts: {
    project_id: string;
    account_id: string;
  }): Promise<any> {
    return await this.call(message.remove_collaborator(opts));
  }

  // Directly add one (or more) collaborators to (one or more) projects via
  // a single API call.  There is no invite process, etc.
  public async add_collaborator(
    opts:
      | {
          project_id: string;
          account_id: string;
        }
      | { project_id: string[]; account_id: string[] } // for adding more than one at once
  ): Promise<any> {
    return await this.call(message.add_collaborator(opts));
  }
}
