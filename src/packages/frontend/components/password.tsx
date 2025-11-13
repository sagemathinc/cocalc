/*

This is like Antd's Input.Password but the input does NOT have type='password'
The motivation is that we want to store lots of information in admin config
that is displayed like a password, i.e., hidden by default, but if you have
an input with type='password', then your password manager may aggressively
autofill your password into these fields, thus leaking your personal top
secret password... which is VERY VERY VERY BAD.

If you really are actually creating a react component to enter the usual
password, e.g., a sign in page, then use antd's Input.Password, not this.

NOTE: A huge advantage of this is that we have another component here
PasswordTextArea that works like a multiline text area, but also allows
hiding the input like a password, which is somethign that Input.Password
doesn't provide, as is useful for any secret config that is multiline,
e.g., a service account json blob.
*/

import { useState } from "react";
import { Input, Space } from "antd";
import { EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";

export default function Password(props0) {
  const visibilityToggle = props0.visibilityToggle;
  const [visible, setVisible] = useState<boolean>(false);
  const props: any = {};
  for (const key in props0) {
    if (key != "visibilityToggle") {
      props[key] = props0[key];
    }
  }

  return (
    <Input
      {...props}
      style={{
        ...props.style,
        ...(visible
          ? {}
          : {
              // see https://stackoverflow.com/questions/17769429/get-input-type-text-to-look-like-type-password
              WebkitTextSecurity: "disc",
            }),
      }}
      suffix={
        visibilityToggle ? (
          <VisibilityToggle visible={visible} setVisible={setVisible} />
        ) : undefined
      }
    />
  );
}

function VisibilityToggle({
  visible,
  setVisible,
  label,
}: {
  visible;
  setVisible;
  label?;
}) {
  const handleClick = () => {
    setVisible(!visible);
  };
  return (
    <span onClick={handleClick} style={{ cursor: "pointer" }}>
      {visible ? (
        <EyeOutlined style={{ color: "rgba(0,0,0,.45)" }} />
      ) : (
        <EyeInvisibleOutlined style={{ color: "rgba(0,0,0,.45)" }} />
      )}
      {label && (
        <span style={{ color: "rgba(0,0,0,.45)", marginLeft: "5px" }}>
          {visible ? "Hide" : "Show"}
        </span>
      )}
    </span>
  );
}

export function PasswordTextArea(props0) {
  const visibilityToggle = props0.visibilityToggle;
  const [visible, setVisible] = useState<boolean>(false);
  const props: any = {};
  for (const key in props0) {
    if (key != "visibilityToggle") {
      props[key] = props0[key];
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Input.TextArea
        {...props}
        style={{
          ...props.style,
          ...(visible
            ? {}
            : {
                // see https://stackoverflow.com/questions/17769429/get-input-type-text-to-look-like-type-password
                WebkitTextSecurity: "disc",
              }),
        }}
      />
      {visibilityToggle ? (
        <div style={{ float: "right" }}>
          <VisibilityToggle visible={visible} setVisible={setVisible} label />
        </div>
      ) : undefined}
    </Space>
  );
}
