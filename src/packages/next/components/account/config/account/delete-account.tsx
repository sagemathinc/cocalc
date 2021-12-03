import { Button, Input, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import A from "components/misc/A";
import { useState } from "react";
import useCustomize from "lib/use-customize";

export default function DeleteAccount() {
  const { siteName } = useCustomize();
  const [name, setName] = useState<string>("");
  const router = useRouter();
  const fullName = "William A. Stein";
  return (
    <Space direction="vertical">
      <h2>
        Are you sure you want to <b>delete your {siteName} account</b>?
      </h2>
      <p>
        You will immediately lose access to all of <A external href="/projects">your projects</A>, and any
        purchased subscriptions will be canceled.
      </p>
      <p>
        Do NOT delete your account if you are{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues/3243">
          a current student in a course...
        </A>
      </p>
      <p>
        To <b>DELETE YOUR ACCOUNT</b>, first type your full name "
        <tt>{fullName}</tt>" below (without quotes):
        <br/>
        <Input
          style={{ marginTop: "15px", maxWidth: `${2*fullName.length}ex` }}
          placeholder={"Full name"}
          onChange={(e) => setName(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            return false;
          }}
        />
      </p>
      <Button
        disabled={name != fullName}
        type="primary"
        danger
        onClick={async () => {
          await apiPost("/accounts/delete");
          router.push("/");
        }}
      >
        <Icon name="trash" /> Permenantly Delete My {siteName} Account
        {name != fullName && <>&nbsp;(type your full name above)</>}
      </Button>
      <br />
    </Space>
  );
}
