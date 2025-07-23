/*
Hook that provides all files in a directory via a Conat FilesystemClient.
This automatically updates when files change.

TESTS: See packages/test/project/listing/

*/

import useAsyncEffect from "use-async-effect";
import { useState } from "react";
import { throttle } from "lodash";
import { type Files } from "@cocalc/conat/files/listing";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type ConatError } from "@cocalc/conat/core/client";

const DEFAULT_THROTTLE_FILE_UPDATE = 500;

export default function useFiles({
  fs,
  path,
  throttleUpdate = DEFAULT_THROTTLE_FILE_UPDATE,
}: {
  fs: FilesystemClient;
  path: string;
  throttleUpdate?: number;
}): { files: Files | null; error: null | ConatError; refresh: () => void } {
  const [files, setFiles] = useState<Files | null>(null);
  const [error, setError] = useState<any>(null);
  const [counter, setCounter] = useState<number>(0);

  useAsyncEffect(async () => {
    let listing;
    try {
      listing = await fs.listing(path);
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

    return () => {
      listing.close();
    };
  }, [fs, path, counter]);

  return { files, error, refresh: () => setCounter(counter + 1) };
}
