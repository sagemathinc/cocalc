/*
File Sync Services

There's a bunch of these running with access to all project files.
This is somewhat similar to the persist servers in architecture,
except this is to support sync editing of files.

These listen on this sticky subject:

    subject = sync.project-{project_id}.edit

User sends a message that contains the path to a file they want to edit.
The fact user can even send the message means they have read/write
privileges to the subject.


the path to a file in a project

OUTPUT: starts (or keeps running) the filesystem aware side of an editing session

*/

import type { Client, Message, Subscription } from "@cocalc/conat/core/client";
import { STICKY_QUEUE_GROUP } from "@cocalc/conat/core/client";
import { isValidUUID } from "@cocalc/util/misc";

interface SyncDoc {
  close: () => void;
}

export type SyncDocCreator = (opts: {
  project_id: string;
  path: string;
  doctype?: any;
}) => SyncDoc;

interface Options {
  client: Client;

  // projects = absolute path in filesystem to user projects, so join(projects, project_id)
  // is the path to project_id's files.
  projects: string;

  createSyncDoc: SyncDocCreator;
}

export async function init(opts: Options) {
  const syncServer = new SyncServer(
    opts.client,
    opts.projects,
    opts.createSyncDoc,
  );
  await syncServer.init();
  return syncServer;
}

interface Api {
  open: (opts: { path: string; doctype?: any }) => Promise<void>;
}

class SyncServer {
  private service?: Subscription;
  private syncDocs: { [key: string]: SyncDoc } = {};
  private interest: { [key: string]: number } = {};

  constructor(
    private client: Client,
    private projects: string,
    private createSyncDoc: SyncDocCreator,
  ) {}

  init = async () => {
    const self = this;
    this.service = await this.client.service<Api>(
      "sync.*.open",
      {
        async open({ path, doctype }) {
          const mesg: Message = this as any;
          self.open(mesg.subject, path, doctype);
        },
      },
      { queue: STICKY_QUEUE_GROUP },
    );
  };

  private key = (project_id, path) => {
    return `${project_id}/${path}`;
  };

  private open = (subject: string, path: string, doctype) => {
    const project_id = subject.split(".")[1]?.slice("project-".length);
    console.log("open", {
      subject,
      path,
      doctype,
      project_id,
      projects: this.projects,
    });
    if (!isValidUUID(project_id)) {
      throw Error("invalid subject");
    }
    const key = this.key(project_id, path);
    if (this.syncDocs[key] === undefined) {
      this.syncDocs[key] = this.createSyncDoc({ project_id, path, doctype });
    }
    this.interest[key] = Date.now();
  };

  close = () => {
    this.service?.close();
    delete this.service;
    for (const key in this.syncDocs) {
      this.syncDocs[key].close();
      delete this.syncDocs[key];
    }
  };
}
