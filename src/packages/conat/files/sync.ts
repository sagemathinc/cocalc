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

// import { type Client } from "@cocalc/conat/core/client";

interface SyncDoc {
  close: () => void;
}

export type SyncDocCreator = (opts: {
  project_id: string;
  path: string;
  doctype?: any;
}) => SyncDoc;

/*
interface Options {
  client: Client;

  // projects = absolute path in filesystem to user projects, so join(projects, project_id)
  // is the path to project_id's files.
  projects: string;

  createSyncDoc: SyncDocCreator;
}

export function init(opts: Options) {
  return new SyncServer(opts.client, opts.projects, opts.createSyncDocs);
}

interface Api {
  open: (opts: { path: string; doctype?: any }) => Promise<void>;
}

class SyncServer {
  constructor(client: Client, projects: string, createSyncDoc: SyncDocCreator) {
    this.client.service = await client1.service<Api>("arith.*", {
      add: async (a, b) => a + b,
      mul: async (a, b) => a * b,
      // Here we do NOT use an arrow => function and this is
      // bound to the calling mesg, which lets us get the subject.
      // Because user identity and permissions are done via wildcard
      // subjects, having access to the calling message is critical
      async open({ path, doctype }) {
        const mesg: Message = this as any;
        console.log(mesg.subject);
      },
    });
  }
}
*/
