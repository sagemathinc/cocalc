import { Alert, Button, Input, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import A from "components/misc/A";
import { useEffect, useState } from "react";
import useCustomize from "lib/use-customize";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";
import register from "../register";

register({
  path: "account/delete",
  title: "Delete Account",
  icon: "trash",
  desc: "Delete your account.",
  Component: () => {
    const { loading, value } = useDatabase({
      accounts: { first_name: null, last_name: null },
    });
    const { siteName } = useCustomize();
    const [name, setName] = useState<string>("");
    const [fullName, setFullName] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [deleting, setDeleting] = useState<boolean>(false);
    const router = useRouter();

    useEffect(() => {
      if (!loading) {
        setFullName(
          (value.accounts.first_name + " " + value.accounts.last_name).trim()
        );
      }
    }, [loading]);

    if (loading) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        <h2>
          Are you sure you want to <b>delete your {siteName} account</b>?
        </h2>
        <p>
          You will immediately lose access to all of{" "}
          <A external href="/projects">
            your projects
          </A>
          , and any purchased subscriptions will be canceled.
        </p>
        <p>
          Do NOT delete your account if you are{" "}
          <A href="https://github.com/sagemathinc/cocalc/issues/3243">
            a current student in a course...
          </A>
        </p>
        <p>
          To <b>DELETE YOUR ACCOUNT</b>, first type your full name "{fullName}"
          below (without quotes):
          <br />
          <Input
            style={{ marginTop: "15px", maxWidth: `${2 * fullName.length}ex` }}
            placeholder={"Type your full name here..."}
            onChange={(e) => setName(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              return false;
            }}
          />
        </p>
        <Button
          disabled={name != fullName || deleting}
          type="primary"
          danger
          onClick={async () => {
            try {
              setError("");
              setDeleting(true);
              await apiPost("/accounts/delete");
              router.push("/");
            } catch (err) {
              setError(err.message);
            } finally {
              setDeleting(false);
            }
          }}
        >
          {deleting && <Loading>Deleting Your Account...</Loading>}
          {!deleting && (
            <>
              <Icon name="trash" /> Permenantly Delete My {siteName} Account
              {name != fullName && <>&nbsp;(type your full name above)</>}
            </>
          )}
        </Button>
        <br />
        {error && <Alert type="error" message={error} showIcon />}
      </Space>
    );
  },
});
