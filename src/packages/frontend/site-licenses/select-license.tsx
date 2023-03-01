/*
Select a license or enter a license code.

Component takes as input data that describes a licens.

IMPORTANT: this component must work in *both* from nextjs and static.
*/

import { Alert, Button, Checkbox, Popconfirm, Select, Space } from "antd";
import { keys } from "lodash";
import { ReactNode, useMemo, useRef, useState } from "react";

import { CSS, Rendered } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { describe_quota as describeQuota } from "@cocalc/util/licenses/describe-quota";
import { days_ago as daysAgo, isValidUUID, len } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const { Option } = Select;

export interface License {
  expires?: Date;
  title?: string;
  quota?: object;
}

interface Props {
  onSave?: (licenseId: string) => void;
  onChange?: (licenseId: string | undefined) => void; // called with licensed id or undefined when cleared.
  onCancel?: () => void;
  exclude?: string[];
  managedLicenses: { [id: string]: License };
  defaultLicenseId?: string;
  confirmLabel?: ReactNode;
  style?: CSS;
  extra?: ReactNode; // plain-text node is ok
}

export default function SelectLicense(props: Props) {
  const {
    defaultLicenseId,
    onSave,
    onChange,
    onCancel,
    exclude,
    managedLicenses,
    confirmLabel,
    style,
    extra,
  } = props;
  const isBlurredRef = useRef<boolean>(true);
  const [licenseId, setLicenseId] = useState<string>(defaultLicenseId ?? "");
  const [showAll, setShowAll] = useState<boolean>(false);
  const licenseIds: string[] = useMemo(() => {
    if (showAll) {
      return keys(managedLicenses);
    }
    const yesterday = daysAgo(1);
    const v: string[] = [];
    for (const id in managedLicenses) {
      const { expires } = managedLicenses[id] ?? {};
      if (expires == null || expires >= yesterday) {
        v.push(id);
      }
    }
    return v;
  }, [managedLicenses, showAll]);

  const options: JSX.Element[] = useMemo(() => {
    const v: JSX.Element[] = [];
    for (const id of licenseIds) {
      if (exclude?.includes(id)) continue;
      const { title, quota, expires } = managedLicenses[id] ?? {};
      v.push(
        <Option key={id} value={id}>
          <Alert
            style={{
              marginRight: "15px",
              padding:
                "3px 15px" /* padding is so it looks centered *after* being selected.*/,
            }}
            type={expires && expires <= new Date() ? "error" : "warning"}
            message={
              <>
                <span style={{ fontFamily: "monospace" }}>{id}</span>
                <span style={{ color: COLORS.GRAY_M }}>
                  {title ? " - " + title : ""}
                  <br />
                  <span style={{ whiteSpace: "normal" }}>
                    {quota && describeQuota(quota, true)}
                  </span>
                  {expires && <span>, Expires {expires.toLocaleString()}</span>}
                </span>
              </>
            }
          />
        </Option>
      );
    }
    return v;
  }, [managedLicenses, licenseIds]);

  const valid = isValidUUID(licenseId);

  function wrapConfirm(button: JSX.Element): JSX.Element {
    if (extra == null || onSave == null) return button;

    return (
      <Popconfirm
        title="Are you sure you want to apply this license?"
        description={<div style={{ maxWidth: "500px" }}>{extra}</div>}
        onConfirm={() => onSave(licenseId)}
        okText="Yes, apply license"
        cancelText="No, cancel"
      >
        {button}
      </Popconfirm>
    );
  }

  function renderButton(): Rendered {
    if (!(onSave || onCancel)) return;

    return (
      <Space>
        {onSave &&
          wrapConfirm(
            <Button
              disabled={!valid}
              type="primary"
              onClick={() => {
                extra == null && onSave(licenseId);
              }}
            >
              <Icon name="check" /> {confirmLabel ?? "Apply License"}
            </Button>
          )}
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </Space>
    );
  }

  return (
    <Space
      direction="vertical"
      size={"large"}
      style={{ width: "100%", ...style }}
    >
      <div>
        {(showAll || licenseIds.length < len(managedLicenses)) && (
          <Checkbox
            style={{
              flex: "1 0 0",
              margin: "5px 0",
              color: COLORS.GRAY_M,
              whiteSpace: "nowrap",
            }}
            checked={showAll}
            onChange={() => setShowAll(!showAll)}
          >
            Show expired
          </Checkbox>
        )}{" "}
        <Select
          style={{ width: "100%", flex: "1 1 0", marginRight: "10px" }}
          placeholder={
            "Enter license code " +
            (options.length > 0
              ? `or select from the ${options.length} licenses you manage`
              : "")
          }
          value={licenseId ? licenseId : undefined}
          onBlur={() => {
            isBlurredRef.current = true;
          }}
          onFocus={() => {
            isBlurredRef.current = false;
          }}
          onChange={(value) => {
            onChange?.(value);
            setLicenseId(value);
          }}
          onSearch={(value) => {
            // we **abuse** search to let user enter any license key they want!
            if (isBlurredRef.current) return; // hack since blur when text is not in list clears things.
            onChange?.(value);
            setLicenseId(value);
          }}
          notFoundContent={null}
          showSearch
          allowClear
        >
          {options}
        </Select>
      </div>
      {!valid && licenseId && (
        <Alert
          type="error"
          message="Valid license keys are 36 characters long."
        />
      )}
      {extra != null && (
        <Alert
          type="warning"
          description={extra}
          style={{ padding: "10px 15px 0 15px" }}
        />
      )}
      {renderButton()}
    </Space>
  );
}
