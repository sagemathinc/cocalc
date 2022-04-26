/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import {
  compute_image2basename,
  compute_image2name,
  CUSTOM_IMG_PREFIX,
} from "@cocalc/frontend/custom-software/util";
import { COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG } from "@cocalc/util/compute-images";
import { COLORS } from "@cocalc/util/theme";
import { fromJS } from "immutable";
const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG); // only because that's how all the ui code was written.

interface DisplayProps {
  image?: string;
}

// this is also used for standard images !!!
// in course/configuration/custom-software-environment
export const SoftwareImageDisplay: React.FC<DisplayProps> = ({ image }) => {
  const images = useTypedRedux("compute_images", "images");
  if (images == null) {
    return <Loading />;
  }
  if (!image) {
    return <>Default</>;
  }
  if (!image.startsWith(CUSTOM_IMG_PREFIX)) {
    const img = COMPUTE_IMAGES.get(image);
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
};
