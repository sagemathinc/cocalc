/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Inputting a site license, e.g., for a project, course, etc.

import {
  redux,
  useEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import SelectLicense, { License } from "./select-license";

export function useManagedLicenses() {
  const managedLicenses = useTypedRedux("billing", "managed_licenses");

  useEffect(() => {
    redux.getActions("billing").update_managed_licenses();
  }, []);

  return managedLicenses;
}

export function SiteLicenseInput(props) {
  const managedLicenses = useManagedLicenses();

  if (managedLicenses == null) {
    return <Loading />;
  }

  return (
    <SelectLicense
      managedLicenses={managedLicenses.toJS() as { [id: string]: License }}
      confirmLabel="Apply License"
      {...props}
    />
  );
}
