import { useEffect, useRef, useState } from "react";
import { Checkbox, Spin } from "antd";
import type { ComputeServerTemplate } from "@cocalc/util/db-schema/compute-servers";
import { setTemplate } from "@cocalc/frontend/compute/api";
import { delay } from "awaiting";

export default function Template({
  id,
  template,
}: {
  id: number;
  template?: ComputeServerTemplate;
}) {
  const [saving, setSaving] = useState<boolean>(false);
  const changedRef = useRef<boolean>(false);
  useEffect(() => {
    changedRef.current = true;
    setSaving(false);
  }, [template]);
  if (!id) {
    // can't make it a template if it doesn't exist yet.
    return null;
  }
  return (
    <div>
      <Checkbox
        disabled={saving}
        checked={!!template?.enabled}
        onChange={async (e) => {
          try {
            setSaving(true);
            changedRef.current = false;
            await setTemplate({ id, template: { enabled: e.target.checked } });
          } finally {
            // just in case template doesn't change, we set this back manually
            await delay(5000);
            if (!changedRef.current) {
              setSaving(false);
            }
          }
        }}
      >
        Use as Template {saving ? <Spin /> : undefined}
      </Checkbox>
    </div>
  );
}
