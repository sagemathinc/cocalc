/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
PDFWatcher - Watches a PDF file in the file system and calls a callback when it changes

ATTN: don't forget to call the "close()" method for cleanup!
*/

import { listings, type Listings } from "@cocalc/frontend/conat/listings";
import { path_split } from "@cocalc/util/misc";
import type { DirectoryListingEntry } from "@cocalc/util/types/directory-listing";

export class PDFWatcher {
  private project_id: string;
  private pdf_path: string;
  private directory_listings?: Listings;
  private last_pdf_mtime?: number;
  private watch_dir: string;
  private pdf_filename: string;
  private on_change: (mtime: number, force: boolean) => void;

  constructor(
    project_id: string,
    pdf_path: string,
    on_change: (mtime: number, force: boolean) => void,
  ) {
    this.project_id = project_id;
    this.pdf_path = pdf_path;
    this.on_change = on_change;

    const { head: directory, tail: pdfFilename } = path_split(this.pdf_path);
    this.watch_dir = directory || ".";
    this.pdf_filename = pdfFilename;
  }

  async init(): Promise<void> {
    try {
      this.directory_listings = listings(this.project_id, 0);
      await this.directory_listings.watch(this.watch_dir);

      // Get initial mtime
      const files = await this.directory_listings.get(this.watch_dir);
      const pdfFile = files?.find((f) => f.name === this.pdf_filename);
      if (pdfFile?.mtime) {
        this.last_pdf_mtime = pdfFile.mtime;
      }

      // Listen for directory changes
      this.directory_listings.on("change", async (paths: string[]) => {
        if (paths.includes(this.watch_dir)) {
          try {
            const updatedFiles: DirectoryListingEntry[] | undefined =
              await this.directory_listings!.get(this.watch_dir);
            const updatedPdfFile = updatedFiles?.find(
              (f) => f.name === this.pdf_filename,
            );

            if (updatedPdfFile?.mtime) {
              if (
                this.last_pdf_mtime !== undefined &&
                this.last_pdf_mtime !== updatedPdfFile.mtime
              ) {
                // PDF file changed - trigger callback
                this.on_change(updatedPdfFile.mtime, false);
              }
              this.last_pdf_mtime = updatedPdfFile.mtime;
            }
          } catch (err) {
            // Ignore errors reading directory (file might be temporarily unavailable)
          }
        }
      });
    } catch (err) {
      // Ignore initialization errors (directory might not exist yet)
    }
  }

  close(): void {
    if (this.directory_listings != null) {
      this.directory_listings.removeAllListeners();
      this.directory_listings.close();
      this.directory_listings = undefined;
    }
  }
}
