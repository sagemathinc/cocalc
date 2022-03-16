/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Inputing a site license, e.g., for a project, course, etc.

import {
  React,
  redux,
  useTypedRedux,
  useEffect,
  CSS,
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

interface Props {
  onSave: (licenseId: string) => void;
  onCancel: () => void;
  exclude?: string[];
  style?: CSS;
}

export const SiteLicenseInput: React.FC<Props> = (props: Props) => {
  const { onSave, onCancel, exclude, style } = props;

  const managedLicenses = useManagedLicenses();

  if (managedLicenses == null) return <Loading />;

  return (
    <SelectLicense
      onSave={onSave}
      onCancel={onCancel}
      exclude={exclude}
      managedLicenses={managedLicenses.toJS() as { [id: string]: License }}
      confirmLabel={"Apply License"}
      style={style}
    />
  );
};
