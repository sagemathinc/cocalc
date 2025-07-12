import type { ClientFs as ClientFsType } from "@cocalc/sync/client/types";
import Client, { Role } from "./index";
import { FileSystemClient } from "@cocalc/backend/sync-doc/client-fs";

export class ClientFs extends Client implements ClientFsType {
  private filesystemClient = new FileSystemClient();

  write_file = this.filesystemClient.write_file;
  path_read = this.filesystemClient.path_read;
  path_stat = this.filesystemClient.path_stat;
  path_exists = this.filesystemClient.path_exists;
  file_size_async = this.filesystemClient.file_size_async;
  file_stat_async = this.filesystemClient.file_stat_async;
  watch_file = this.filesystemClient.watch_file;
  path_access = this.filesystemClient.path_access;

  constructor({
    project_id,
    client_id,
    home,
    role,
  }: {
    project_id: string;
    client_id?: string;
    home?: string;
    role: Role;
  }) {
    super({ project_id, client_id, role });
    this.filesystemClient.setHome(home ?? process.env.HOME ?? "/home/user");
  }
}
