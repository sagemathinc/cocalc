import { Button, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import register from "../register";

register({
  path: "account/sign-out",
  title: "Sign Out",
  icon: "sign-out-alt",
  desc: "Sign out of your account on this computer or everywhere.",
  Component: () => {
    const router = useRouter();
    return (
      <Space direction="vertical">
        Sign out of your account:
        <Button
          type="primary"
          onClick={async () => {
            await apiPost("/accounts/sign-out", { all: false });
            router.push("/");
          }}
        >
          <Icon name="sign-out-alt" /> Sign Out
        </Button>
        <br />
        Sign out on all devices that are authenticated:
        <Button
          onClick={async () => {
            await apiPost("/accounts/sign-out", { all: true });
            router.push("/");
          }}
        >
          <Icon name="sign-out-alt" /> Sign Out Everywhere
        </Button>
      </Space>
    );
  },
});
