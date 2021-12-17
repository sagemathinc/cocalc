import getCustomize from "@cocalc/server/settings/customize";
import getAccountId from "lib/account/get-account";
import { getName } from "lib/share/get-account-info";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const revalidate = 30;

interface Options {
  name?: boolean; // if true and user is signed in, also puts their first_name,
  // last_name, name(=username), email_address, and is_anonymous in the account field.
  // This is one more db query.
}

export default async function withCustomize(
  obj: {
    props?: any;
    revalidate?: number;
    context: any;
  },
  options: Options = {}
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

      // Also, if a project id is in the props and account_id is set, it's very
      // useful to know if the user is a collaborator on the project, since that
      // can impact a lot about how we display things.  This is typically used
      // for the share pages.
      const project_id = obj.props?.project_id;
      if (project_id) {
        customize.isCollaborator = await isCollaborator({
          account_id,
          project_id,
        });
      }
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
