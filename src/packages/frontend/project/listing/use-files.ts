/*
Hook that provides all files in a directory via a Conat FilesystemClient.
This automatically updates when files change.

TESTS: See packages/test/project/listing/

*/

import useAsyncEffect from "use-async-effect";
import { useRef, useState } from "react";
import { throttle } from "lodash";
import { type Files } from "@cocalc/conat/files/listing";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type ConatError } from "@cocalc/conat/core/client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

const DEFAULT_THROTTLE_FILE_UPDATE = 500;

export default function useFiles({
  fs,
  path,
  throttleUpdate = DEFAULT_THROTTLE_FILE_UPDATE,
}: {
  // fs = undefined is supported and just waits until you provide a fs that is defined
  fs?: FilesystemClient | null;
  path: string;
  throttleUpdate?: number;
}): { files: Files | null; error: null | ConatError; refresh: () => void } {
  const [files, setFiles] = useState<Files | null>(null);
  const [error, setError] = useState<any>(null);
  const { val: counter, inc: refresh } = useCounter();
  const listingRef = useRef<any>(null);

  useAsyncEffect(
    async () => {
      if (fs == null) {
        setError(null);
        setFiles(null);
        return;
      }
      let listing;
      try {
        listing = await fs.listing(path);
        listingRef.current = listing;
        setError(null);
      } catch (err) {
        setError(err);
        setFiles(null);
        return;
      }

      const update = () => {
        setFiles({ ...listing.files });
      };
      update();

      listing.on(
        "change",
        throttle(update, throttleUpdate, { leading: true, trailing: true }),
      );
    },
    () => {
      listingRef.current?.close();
      delete listingRef.current;
    },
    [fs, path, counter],
  );

  return { files, error, refresh };
}
