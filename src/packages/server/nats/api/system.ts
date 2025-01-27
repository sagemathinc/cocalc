import getCustomize from "@cocalc/database/settings/customize";
export { getCustomize };

export function ping() {
  return { now: Date.now() };
}
