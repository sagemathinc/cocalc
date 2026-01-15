/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getCustomize from "@cocalc/database/settings/customize";
import getAccountId from "lib/account/get-account";
import { getName } from "lib/share/get-account-info";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { getSoftwareEnvironments } from "@cocalc/server/software-envs";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";

import { CustomizeType } from "./customize";

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
  options: Options = {},
) {
  let customize: CustomizeType;
  try {
    // NOTE: important to make a (shallow) copy, since customize gets mutated below.
    customize = { ...(await getCustomize()) };
  } catch (_err) {
    // fallback to be empty; during static build
    // this happens.
    customize = {} as CustomizeType;
  }

  if (obj.context?.req != null) {
    const account_id = await getAccountId(obj.context.req);
    customize.isAuthenticated = !!account_id;
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
  } else {
    customize.isAuthenticated = false;
  }

  customize.onCoCalcCom = customize.kucalc === KUCALC_COCALC_COM;
  customize.noindex = obj.props?.unlisted ?? false;
  customize.imprintOrPolicies =
    (customize.imprint ?? "") + (customize.policies ?? "") != "";
  customize.serverTime = Date.now();

  // this is used for creating new projects from a share
  const softwareEnvs = await getSoftwareEnvironments("server");
  customize.defaultComputeImage =
    softwareEnvs?.default ?? DEFAULT_COMPUTE_IMAGE;

  customize.enabledPages = {
    about: {
      index: customize.landingPages,
      events: customize.isCommercial,
      team: customize.landingPages,
    },
    compute: customize.computeServersEnabled,
    contact: !!customize.contactEmail,
    features: customize.landingPages,
    info: true,
    legal: !customize.landingPages && !!customize.termsOfServiceURL,
    licenses: customize.isCommercial,
    news: true,
    onPrem: customize.onCoCalcCom,
    organization: !!customize.organizationURL,
    policies: {
      index: customize.landingPages || customize.imprintOrPolicies,
      imprint: !!customize.imprint,
    },
    pricing: customize.isCommercial,
    share: customize.shareServer,
    software: customize.landingPages,
    store: customize.landingPages && customize.isCommercial,
    support: true, // always enabled, but for on-prem && settings.support, we render a different page
    systemActivity: true,
    status: customize.onCoCalcCom,
    termsOfService: !customize.landingPages && !!customize.termsOfServiceURL,
    liveDemo: !!customize.supportVideoCall && customize.isCommercial,
  };

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
