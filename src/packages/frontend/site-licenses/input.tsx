/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Inputing a site license, e.g., for a project, course, etc.

import { redux, useTypedRedux, useEffect } from "../app-framework";
import { Loading } from "../components";
import SelectLicense from "./select-license";

interface Props {
  onSave: (licenseId: string) => void;
  onCancel: () => void;
  exclude?: string[];
}

export function SiteLicenseInput({ onSave, onCancel, exclude }: Props) {
  const managedLicenses = useTypedRedux("billing", "managed_licenses");
  useEffect(() => {
    redux.getActions("billing").update_managed_licenses();
  }, []);

  if (managedLicenses == null) return <Loading />;

  return (
    <SelectLicense
      onSave={onSave}
      onCancel={onCancel}
      exclude={exclude}
      managedLicenses={managedLicenses.toJS() as any[]}
    />
  );
}
