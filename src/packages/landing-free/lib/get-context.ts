import getCustomize from "@cocalc/util-node/server-settings/customize";

export default async function get(obj?: { props?: { customize?: any } }) {
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
  if (obj.props == null) {
    obj.props = { customize };
  } else {
    obj.props.customize = customize;
  }
  return obj;
}
