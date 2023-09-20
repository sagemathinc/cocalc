/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  delete_local_storage,
  get_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { getDedicatedDiskKey, PRICES } from "@cocalc/util/upgrades/dedicated";
import apiPost from "lib/api/post";
import { LS_KEY_LICENSE_PROJECT } from "./util";
import { ALL_FIELDS } from "./quota-query-params";

// these are the hidden type fields of the forms
// regular and boost end up as "quota" types
// where the description.boost flag is true or false
export type LicenseTypeInForms = "regular" | "boost" | "vm" | "disk";

interface Props {
  form: any;
  router: any;
  setCartError: (msg: string) => void;
}

// this is used by the "addBox" and the thin "InfoBar" to add/modify the selected license configuration to the cart

export async function addToCart(props: Props) {
  const { form, setCartError, router } = props;

  // we make a copy, because otherwise this actually modifies the fields (user sees brief red errors)
  const description = {
    ...form.getFieldsValue(true),
  };

  // exclude extra fields that are for UI only. See https://github.com/sagemathinc/cocalc/issues/6258
  for (const field in description) {
    if (!ALL_FIELDS.has(field)) {
      delete description[field];
    }
  }

  // unload the type parameter
  switch (description.type) {
    case "boost":
      description.boost = true;
      description.type = "quota";
      break;

    case "vm":
      for (const k of ["disk-name", "disk-size_gb", "disk-speed"]) {
        delete description[k];
      }
      const machine = description["vm-machine"];
      if (PRICES.vms[machine] == null) {
        setCartError(`Unknown machine type ${machine}`);
        return;
      }
      description.dedicated_vm = {
        machine,
      };
      delete description["vm-machine"];
      description.type = "vm";
      break;

    case "disk":
      delete description["vm-machine"];

      const diskID = getDedicatedDiskKey({
        size_gb: description["disk-size_gb"],
        speed: description["disk-speed"],
      });
      const disk = PRICES.disks[diskID];
      if (disk == null) {
        setCartError(`Disk ${diskID} not found`);
        return;
      }
      description.dedicated_disk = {
        ...disk.quota.dedicated_disk,
        name: description["disk-name"],
      };
      for (const k of ["disk-name", "disk-size_gb", "disk-speed"]) {
        delete description[k];
      }

      description.type = "disk";
      break;

    case "regular":
    default:
      description.type = "quota";
      description.boost = false;
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
        product: "site-license",
        description,
        project_id,
      });
    }
    router.push("/store/cart");
  } catch (err) {
    setCartError(err.message);
  }
}
