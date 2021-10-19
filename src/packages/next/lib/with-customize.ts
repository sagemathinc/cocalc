import getCustomize from "@cocalc/backend/server-settings/customize";
import getAccountId from "lib/account/get-account";

const revalidate = 30;

export default async function get(obj: {
  props?: any;
  revalidate?: number;
  context: any;
}) {
  let customize;
  try {
    customize = await getCustomize();
  } catch (_err) {
    // fallback to be empty; during static build
    // this happens.
    customize = {};
  }

  if (obj.context?.req != null) {
    const account_id = await getAccountId(obj.context.req);
    if (account_id) {
      customize.account = { account_id };
    }
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
  delete obj.context;
  return obj;
}
