/* 
Frontend react component that enables any user to edit the parameters
of a license **they purchased**.  They may have to pay for changes they 
make, or get a refund. 
*/

import { Alert, Button, Divider, Spin } from "antd";
import { useState } from "react";
import { getLicense } from "./api";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  license_id: string;
}

interface License {
  account_id: string;
  info: string;
  number_running: number;
  title: string;
  description: string;
}
export default function EditLicense({ license_id }: Props) {
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fetchLicense = async () => {
    try {
      setLoading(true);
      setLicense(await getLicense(license_id));
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
      {license != null && <pre>{JSON.stringify(license, undefined, 2)}</pre>}
    </div>
  );
}
