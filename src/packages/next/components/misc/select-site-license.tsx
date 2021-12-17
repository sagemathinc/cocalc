/*
Select a site license, either by pasting one in, or
from a list of all of the licenses the signed in user
is a manager of.
*/
import { useMemo } from "react";
import { Alert } from "antd";
import SelectLicense, {
  License,
} from "@cocalc/frontend/site-licenses/select-license";
import useQuery from "lib/hooks/database";
import Loading from "components/share/loading";

interface Props {
  onChange: (licenseId: string | undefined) => void; // called with undefined if user doesn't want to select a license
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
  const managedLicenses: { [id: string]: License } = useMemo(() => {
    const x: { [id: string]: License } = {};
    if (!value?.manager_site_licenses) return x;
    for (const license of value.manager_site_licenses) {
      if (license.expires) {
        // comes back from database as ISO string.
        license.expires = new Date(license.expires);
      }
      x[license.id] = license;
    }
    return x;
  }, [value]);

  if (loading || value == null) {
    return <Loading />;
  }
  if (error) {
    return <Alert type="error" message={error} />;
  }
  return (
    <SelectLicense
      onChange={onChange}
      defaultLicenseId={defaultLicenseId}
      managedLicenses={managedLicenses}
    />
  );
}
