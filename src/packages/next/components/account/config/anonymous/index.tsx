/*
The config page for anonymous users.  An anonymous user *is* signed in using a full account.
This page does belong in configuration -- it's about taking the steps to convert their
anonymous account into a full account so they won't lose their work.  Most important
is an email address or SSO sign on link.

Non-anonymous users get the layout page.
*/
import SiteName from "components/share/site-name";
import A from "components/misc/A";
import { Button, Popconfirm } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import Upgrade from "./upgrade";

export default function Anonymous() {
  const router = useRouter();
  return (
    <div
      style={{
        margin: "auto",
        padding: "30px",
        maxWidth: "800px",
        background: "white",
      }}
    >
      <Popconfirm
        title={
          <div style={{ maxWidth: "50ex" }}>
            Are you sure you want to sign out <b>losing everything</b> you just did
            anonymously?
          </div>
        }
        onConfirm={async () => {
          await apiPost("/accounts/sign-out", { all: true });
          router.push("/");
        }}
        okText={"Yes, discard everything"}
        cancelText={"Cancel"}
      >
        <Button danger style={{ float: "right" }} size="large">
          <Icon name="sign-out-alt" /> Sign Out
        </Button>
      </Popconfirm>
      <h2>
        Thank you for trying <SiteName />!
      </h2>
      <h3>
        Ensure you can sign in later instead of <b>losing all of your work</b>
      </h3>
      Getting a normal account is free and easy, prevents losing your work,
      and{" "}
      <A href="https://doc.cocalc.com" external>
        <b>
          <i>unlocks many additional features</i>
        </b>
      </A>
      .
      <Upgrade style={{ margin: "15px 0px" }} />
    </div>
  );
}
