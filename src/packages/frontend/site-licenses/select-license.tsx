/*
Select a license or enter a license code.

Component takes as input data that describes a license.

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
import { CallToSupport } from "@cocalc/frontend/project/call-to-support";

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
  extraButtons?: ReactNode;
  requireValid?: boolean;
  requireLicense?: boolean;
  requireMessage?: ReactNode;
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
    extraButtons,
    requireValid,
    requireLicense,
    requireMessage = "A license is required.",
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
  const [showCall, setShowCall] = useState<boolean>(false);

  const options: React.JSX.Element[] = useMemo(() => {
    const v: React.JSX.Element[] = [];
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
                  {expires && (
                    <span>, Paid until {expires.toLocaleString()}</span>
                  )}
                </span>
              </>
            }
          />
        </Option>,
      );
    }
    return v;
  }, [managedLicenses, licenseIds]);

  const valid = isValidUUID(licenseId);

  function wrapConfirm(button: React.JSX.Element): React.JSX.Element {
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
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
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
            </Button>,
          )}
        {extraButtons != null ? (
          <span style={{ paddingLeft: "20px" }}>{extraButtons}</span>
        ) : null}
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
        {!requireValid &&
          (showAll || licenseIds.length < len(managedLicenses)) && (
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
          style={{
            width: "100%",
            height: licenseId ? "100px" : undefined,
            flex: "1 1 0",
            marginRight: "10px",
          }}
          status={requireLicense && !licenseId ? "error" : undefined}
          placeholder={
            `Enter${requireValid ? " valid " : " "}license code ` +
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
        {requireLicense && !licenseId ? (
          <Alert
            style={{ marginTop: "10px" }}
            type="warning"
            showIcon
            message={requireMessage}
            description={
              <div>
                {showCall ? (
                  <CallToSupport onClose={() => setShowCall(false)} />
                ) : (
                  <Button
                    style={{ marginLeft: "15px" }}
                    onClick={() => setShowCall(true)}
                  >
                    Why?
                  </Button>
                )}
              </div>
            }
          />
        ) : undefined}
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
