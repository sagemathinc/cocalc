const { COLORS } = require("../r_misc");

export const RESET_ICON = "redo-alt";

export const CUSTOM_IMG_PREFIX = "custom/";

export const CUSTOM_SOFTWARE_HELP_URL =
  "https://doc.cocalc.com/software/custom.html";

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
  color: COLORS.GRAY
});

export function props2img() {
  if (this.props.project_map == null) return null;
  const ci = this.props.project_map.getIn([
    this.props.project_id,
    "compute_image"
  ]);
  if (ci == null) return null;
  if (!ci.startsWith(CUSTOM_IMG_PREFIX)) return null;
  if (this.props.images == null) return null;
  const img = this.props.images.get(compute_image2basename(ci));
  return img;
}
