import { Button } from "antd";
import { useState } from "react";

import { Impersonate as OldImpersonate } from "@cocalc/frontend/admin/users/impersonate";
import { Icon } from "@cocalc/frontend/components";

export default function Impersonate(props) {
  const [impersonate, setImpersonate] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setImpersonate(!impersonate)}>
        <Icon name="user-secret" /> Impersonate...
      </Button>
      {impersonate && <OldImpersonate {...props} />}
    </div>
  );
}
