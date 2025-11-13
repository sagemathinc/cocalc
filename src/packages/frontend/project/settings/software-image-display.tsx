/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import {
  compute_image2basename,
  compute_image2name,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { COLORS } from "@cocalc/util/theme";

interface DisplayProps {
  image?: string;
}

// this is also used for standard images !!!
// in course/configuration/custom-software-environment
export function SoftwareImageDisplay({ image }: DisplayProps) {
  const images = useTypedRedux("compute_images", "images");
  const software = useTypedRedux("customize", "software");
  const compute_images = useMemo(
    () => software?.get("environments"),
    [software],
  );
  if (images == null) {
    return <Loading />;
  }
  if (!image) {
    return <>Default</>;
  }
  if (!is_custom_image(image)) {
    const img = compute_images.get(image);
    if (img == null) {
      return <>{image}</>;
    } else {
      return <>{img.get("title")}</>;
    }
  } else {
    const name = compute_image2name(image);
    const img_id = compute_image2basename(image);
    const img_data = images.get(img_id);
    if (img_data == undefined) {
      // this is quite unlikely, use ID as fallback
      return <>{img_id}</>;
    } else {
      return (
        <>
          {img_data.get("display")}{" "}
          <span style={{ color: COLORS.GRAY, fontFamily: "monospace" }}>
            ({name})
          </span>
        </>
      );
    }
  }
}
