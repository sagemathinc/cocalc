/*
Select a site license, either by pasting one in, or
from a list of all of the licenses the signed in user
is a manager of.
*/

import { Alert } from "antd";
import SelectLicense, {
  License,
} from "@cocalc/frontend/site-licenses/select-license";
import useQuery from "lib/hooks/database";
import Loading from "components/share/loading";

interface Props {
  onChange: (licenseId: string) => void; // called with '' if user doesn't want to select a license
  defaultLicenseId?: string;
}

export default function SelectSiteLicense({
  onChange,
  defaultLicenseId,
}: Props) {
  const { error, value, loading } = useQuery({
    manager_site_licenses: [
      { id: null, expires: null, title: null, quota: null },
    ],
  });
  if (loading || value == null) {
    return <Loading />;
  }
  if (error) {
    return <Alert type="error" message={error} />;
  }
  const managedLicenses: { [id: string]: License } = {};
  console.log("value = ", value);
  for (const license of value.manager_site_licenses) {
    managedLicenses[license.id] = license;
  }
  return (
    <SelectLicense
      onChange={onChange}
      defaultLicenseId={defaultLicenseId}
      managedLicenses={managedLicenses}
      confirmLabel={"Use This Site License"}
    />
  );
}
