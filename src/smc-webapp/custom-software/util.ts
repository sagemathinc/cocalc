/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join as path_join } from "path";
import { COLORS } from "../r_misc";

export const RESET_ICON = "redo-alt";

export type NAME_TYPE = "compute_images";
export const NAME = "compute_images" as NAME_TYPE;

export const CUSTOM_IMG_PREFIX = "custom/";

export const CUSTOM_SOFTWARE_HELP_URL =
  "https://doc.cocalc.com/software.html#custom-environments";

export function compute_image2name(compute_image: string): string {
  const name = compute_image.slice(CUSTOM_IMG_PREFIX.length);
  return name.replace("/", ":");
}

export function compute_image2basename(compute_image: string): string {
  const name = compute_image.slice(CUSTOM_IMG_PREFIX.length);
  return name.split("/")[0];
}

export const title_style: React.CSSProperties = Object.freeze({
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as "nowrap",
  overflow: "hidden",
  paddingLeft: "10px",
  margin: "5px 10px",
  color: COLORS.GRAY,
});

export function props2img(props: {
  project_map?;
  project_id: string;
  images?;
}) {
  if (props.project_map == null) return null;
  const ci = props.project_map.getIn([props.project_id, "compute_image"]);
  if (ci == null) return null;
  if (!ci.startsWith(CUSTOM_IMG_PREFIX)) return null;
  return props.images?.get(compute_image2basename(ci));
}

// derive the actual compute image name (which will be set in the DB) from the selected ID.
export function custom_image_name(id: string): string {
  let tag: string;
  if (id.indexOf(":") >= 0) {
    [id, tag] = id.split(":");
  } else {
    tag = "latest";
  }
  return path_join(CUSTOM_IMG_PREFIX, id, tag);
}
