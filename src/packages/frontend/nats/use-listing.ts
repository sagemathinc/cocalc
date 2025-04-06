/*
React Hook to provide access to directory listings in a project.
*/

import { useEffect, useRef, useState } from "react";
import {
  listingsClient,
  type ListingsClient,
  type Listing,
} from "@cocalc/nats/service/listings";
import { useAsyncEffect } from "use-async-effect";

export default function useListing({
  project_id,
  path = "",
  compute_server_id = 0,
}: {
  project_id: string;
  path: string;
  compute_server_id: number;
}): Listing | undefined {
  const [listing, setListing] = useState<Listing | undefined>(undefined);
  const listingsRef = useRef<undefined | ListingsClient>(undefined);
  const pathRef = useRef<string>(path);

  useAsyncEffect(async () => {
    setListing(undefined);
    listingsRef.current = await listingsClient({
      project_id,
      compute_server_id,
    });
    const handleChange = (path) => {
      if (path == pathRef.current) {
        setListing(listingsRef.current?.get(pathRef.current));
      }
    };
    listingsRef.current.on("change", handleChange);

    return () => {
      listingsRef.current?.removeListener("change", handleChange);
      listingsRef.current?.close();
      listingsRef.current = undefined;
    };
  }, [project_id, compute_server_id]);

  useEffect(() => {
    pathRef.current = path;
    setListing(listingsRef.current?.get(pathRef.current));
  }, [path]);

  return listing;
}
