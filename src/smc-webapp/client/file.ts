import * as message from "smc-util/message";
import { AsyncCall } from "./client";
import { redux } from "../app-framework";

export class FileClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  // Currently only used for testing and development in the console.
  public async syncdoc_history(
    string_id: string,
    patches?: boolean
  ): Promise<any> {
    return (
      await this.async_call({
        message: message.get_syncdoc_history({
          string_id,
          patches,
        }),
        allow_post: false,
      })
    ).history;
  }

  // Returns true if the given file in the given project is currently marked as deleted.
  public is_deleted(filename: string, project_id: string): boolean {
    return !!redux
      .getProjectStore(project_id)
      ?.get_listings()
      ?.is_deleted(filename);
  }

  public set_deleted(_filename, _project_id): void {
    throw Error("set_deleted doesn't make sense for the frontend");
  }

  public async remove_blob_ttls(
    uuids: string[] // list of sha1 hashes of blobs stored in the blobstore
  ) {
    if (uuids.length === 0) return;
    await this.async_call({
      message: message.remove_blob_ttls({ uuids }),
    });
  }
}
