import getCustomize from "@cocalc/util-node/server-settings/customize";

const revalidate = 30;

export default async function get(obj?: object) {
  const customize = await getCustomize();
  if (obj == null) {
    return { props: { customize }, revalidate };
  }
  if (obj["revalidate"] == null) {
    obj["revalidate"] = revalidate;
  } else {
    obj["revalidate"] = Math.min(revalidate, obj["revalidate"]);
  }
  if (obj["props"] == null) {
    obj["props"] = { customize };
  } else {
    obj["props"]["customize"] = customize;
  }
  return obj;
}
