/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  delete_local_storage,
  get_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import apiPost from "lib/api/post";
import { LS_KEY_LICENSE_PROJECT } from "./util";
import { ALL_FIELDS } from "./quota-query-params";

// these are the hidden type fields of the forms
// regular and boost end up as "quota" types
// where the description.boost flag is true or false
export type LicenseTypeInForms = "regular" | "boost";

interface Props {
  form: any;
  router: any;
  setCartError: (msg: string) => void;
}

// this is used by the "addBox" and the thin "InfoBar" to add/modify the selected license configuration to the cart
// If something goes wrong it throws an error *and* also calls setCartError.
export async function addToCart({ form, setCartError, router }: Props) {
  // we make a copy, because otherwise this actually modifies the fields (user sees brief red errors)
  const description = {
    ...form.getFieldsValue(true),
  };
  let product;
  if (description.numVouchers != null) {
    product = "cash-voucher";
  } else {
    product = "site-license";
  }

  if (product == "site-license") {
    // exclude extra fields that are for UI only. See https://github.com/sagemathinc/cocalc/issues/6258
    for (const field in description) {
      if (!ALL_FIELDS.has(field)) {
        delete description[field];
      }
    }
    description.type = "quota";
    description.boost = false;
  } else {
    description.type = "cash-voucher";
  }

  try {
    setCartError("");
    if (router.query.id != null) {
      await apiPost("/shopping/cart/edit", {
        id: router.query.id,
        description,
      });
    } else {
      // we get the project_id from local storage and save it to the new/edited license
      const project_id = get_local_storage(LS_KEY_LICENSE_PROJECT);
      delete_local_storage(LS_KEY_LICENSE_PROJECT);

      await apiPost("/shopping/cart/add", {
        product,
        description,
        project_id,
      });
    }
    router.push("/store/cart");
  } catch (err) {
    setCartError(err.message);
    throw err;
  }
}
