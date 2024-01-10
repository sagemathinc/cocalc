import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import type { Images } from "@cocalc/util/db-schema/compute-servers";
import { useEffect } from "react";
import type { CustomizeActions } from "@cocalc/frontend/customize";

export async function reloadImages() {
  const actions = redux.getActions("customize") as CustomizeActions;
  await actions.updateComputeServerImages();
}

export function useImages(): {
  IMAGES: null | undefined | Images;
  ImagesError: null | JSX.Element;
} {
  const IMAGES = useTypedRedux("customize", "compute_servers_images");
  useEffect(() => {
    if (IMAGES == null) {
      reloadImages();
    }
  }, []);

  if (IMAGES == null) {
    return { IMAGES: null, ImagesError: null };
  }
  if (typeof IMAGES == "string") {
    return {
      IMAGES: null,
      ImagesError: <ShowError error={IMAGES} setError={reloadImages} />,
    };
  }
  return { IMAGES: IMAGES.toJS() as Images, ImagesError: null };
}
