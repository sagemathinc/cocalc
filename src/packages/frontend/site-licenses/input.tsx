/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Inputing a site license, e.g., for a project, course, etc.

import {
  CSS,
  React,
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

interface Props {
  onSave?: (licenseId: string) => void;
  onCancel?: () => void;
  onChange?: (licenseId: string) => void;
  confirmLabel?: string;
  exclude?: string[];
  style?: CSS;
  extra?: React.ReactNode;
  extraButtons?: React.ReactNode;
}

export const SiteLicenseInput: React.FC<Props> = (props: Props) => {
  const {
    onSave,
    onCancel,
    onChange,
    exclude,
    style,
    confirmLabel = "Apply License",
    extra,
    extraButtons,
  } = props;

  const managedLicenses = useManagedLicenses();

  if (managedLicenses == null) return <Loading />;

  return (
    <SelectLicense
      onSave={onSave}
      onCancel={onCancel}
      onChange={onChange}
      exclude={exclude}
      managedLicenses={managedLicenses.toJS() as { [id: string]: License }}
      confirmLabel={confirmLabel}
      style={style}
      extra={extra}
      extraButtons={extraButtons}
    />
  );
};
