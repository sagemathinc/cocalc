import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import type {
  Architecture,
  Images,
  GoogleCloudImages,
} from "@cocalc/util/db-schema/compute-servers";
import { useEffect } from "react";
import type { CustomizeActions } from "@cocalc/frontend/customize";

type Name = "compute_servers_images" | "compute_servers_images_google";

export async function reloadImages(name: Name, reload?: boolean) {
  const actions = redux.getActions("customize") as CustomizeActions;
  switch (name) {
    case "compute_servers_images":
      await actions.updateComputeServerImages(reload);
      return;
    case "compute_servers_images_google":
      await actions.updateComputeServerImagesGoogle(reload);
      return;
    default:
      // non-fatal, since reloading something uknown is trivial.
      console.warn(`uknown images -- "${name}"`);
  }
}

export async function forceRefreshImages() {
  await reloadImages("compute_servers_images", true);
  await reloadImages("compute_servers_images_google", true);
}

function useImages0(name: Name) {
  const IMAGES = useTypedRedux("customize", name);
  useEffect(() => {
    if (IMAGES == null) {
      reloadImages(name);
    }
  }, []);

  if (IMAGES == null) {
    return [null, null];
  }
  if (typeof IMAGES == "string") {
    return [
      null,
      <ShowError
        error={`Error loading ${name} -- ${IMAGES}`}
        setError={reloadImages}
      />,
    ];
  }
  if (name == "compute_servers_images") {
    return [IMAGES.toJS() as Images, null];
  } else if (name == "compute_servers_images_google") {
    return [IMAGES.toJS() as GoogleCloudImages, null];
  } else {
    throw Error("bug");
  }
}

export function useImages(): [Images | null, React.JSX.Element | null] {
  const [images, error] = useImages0("compute_servers_images");
  if (error != null) {
    return [null, error as React.JSX.Element];
  } else if (images == null) {
    return [images as null, error as null];
  } else {
    return [images as Images, error as null];
  }
}

// tag, arch, etc., are first through makeValidGoogleName
type GoogleImages = {
  [image: string]: {
    [tag: string]: { arch: Architecture; tested?: boolean };
  };
};

export function useGoogleImages(): [GoogleImages | null, React.JSX.Element | null] {
  const [images, error] = useImages0("compute_servers_images_google");
  if (error != null) {
    return [null, error as React.JSX.Element];
  } else if (images == null) {
    return [images as null, error as null];
  } else {
    const x: GoogleImages = {};
    for (const name in images) {
      const { labels } = images[name];
      if (x[labels.image] == null) {
        x[labels.image] = {};
      }
      x[labels.image][`${labels.tag}-${labels.arch}`] = labels;
    }
    return [x, error as null];
  }
}
