/* 
Frontend react component that enables any user to edit the parameters
of a license **they purchased**.  They may have to pay for changes they 
make, or get a refund. 
*/

import { Alert, Button, Divider, Spin } from "antd";
import { useState } from "react";
import { getLicense } from "./api";
import { Icon } from "@cocalc/frontend/components/icon";
import LicenseEditor from "./license-editor";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";

interface Props {
  license_id: string;
}

interface License {
  account_id: string;
  info: PurchaseInfo;
  number_running: number;
  title: string;
  description: string;
}
export default function EditLicense({ license_id }: Props) {
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [modifiedInfo, setModifiedInfo] = useState<PurchaseInfo | null>(null);
  const [info, setInfo] = useState<PurchaseInfo | null>(null);

  const fetchLicense = async () => {
    try {
      setLoading(true);
      const license = await getLicense(license_id);
      console.log(license);
      setLicense(license);
      const info = license.info?.purchased ?? null;
      if (info != null) {
        if (info.start != null) {
          info.start = new Date(info.start);
        }
        if (info.end != null) {
          info.end = new Date(info.end);
        }
      }
      setInfo(info);
      setModifiedInfo(info);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return <Alert type="error" message="Error" description={error} />;
  }
  return (
    <div>
      <Divider>
        <Button
          disabled={loading}
          onClick={() => {
            if (license) {
              setLicense(null);
            } else {
              fetchLicense();
            }
          }}
        >
          <Icon name="pencil" /> Edit{license != null ? "ing" : ""} License...{" "}
          {loading && <Spin />}
        </Button>
      </Divider>
      {modifiedInfo != null && (
        <LicenseEditor
          info={modifiedInfo}
          onChange={setModifiedInfo}
          style={{ maxWidth: "600px", margin: "auto" }}
        />
      )}
    </div>
  );
}
