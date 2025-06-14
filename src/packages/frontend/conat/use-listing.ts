/*
React Hook to provide access to directory listings in a project.

This is NOT used yet, but seems like the right way to do directly listings in a modern
clean dynamic way.  It would be used like this:

import useListing from "@cocalc/frontend/conat/use-listing";
function ListingTest({ path, compute_server_id }) {
  const listing = useListing({ path, compute_server_id });
  return <div>{JSON.stringify(listing)}</div>;
}

*/

import { useEffect, useRef, useState } from "react";
import {
  listingsClient,
  type ListingsClient,
  type Listing,
} from "@cocalc/conat/service/listings";
import { useAsyncEffect } from "use-async-effect";
import { useProjectContext } from "@cocalc/frontend/project/context";

export default function useListing({
  path = "",
  compute_server_id = 0,
}: {
  path: string;
  compute_server_id: number;
}): Listing | undefined {
  const { project_id } = useProjectContext();
  const [listing, setListing] = useState<Listing | undefined>(undefined);
  const listingsRef = useRef<undefined | ListingsClient>(undefined);
  const pathRef = useRef<string>(path);

  useAsyncEffect(async () => {
    setListing(undefined);
    if (!project_id) {
      return;
    }
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
