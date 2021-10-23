import getCustomize from "@cocalc/backend/server-settings/customize";
import getAccountId from "lib/account/get-account";
import { getName } from "lib/share/get-account-info";

const revalidate = 30;

interface Options {
  name?: boolean; // if true and user is signed in, also puts their first_name,
  // last_name, name(=username), email_address in the account field. This is one more db query.
}

export default async function get(
  obj: {
    props?: any;
    revalidate?: number;
    context: any;
  },
  options: { name?: boolean } = {}
) {
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
      customize.account = {
        account_id,
        ...(options.name ? await getName(account_id) : undefined),
      };
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
