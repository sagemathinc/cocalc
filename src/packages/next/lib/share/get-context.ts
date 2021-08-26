import getCustomize from "@cocalc/util-node/server-settings/customize";

const revalidate = 30;

export default async function get(obj?: { props?: any; revalidate?: number }) {
  let customize;
  try {
    customize = await getCustomize();
  } catch (_err) {
    // fallback to be empty; during static build
    // this happens.
    customize = {};
  }
  if (obj == null) {
    return { props: { customize } };
  }
  if (obj.revalidate != null) {
    obj.revalidate = Math.min(revalidate, obj.revalidate);
  }
  if (obj.props == null) {
    obj.props = { customize };
  } else {
    obj.props.customize = customize;
  }
  return obj;
}
