/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space } from "antd";
import { useEffect, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useDatabase from "lib/hooks/database";
import useCustomize from "lib/use-customize";
import { useRouter } from "next/router";
import register from "../register";

register({
  path: "account/delete",
  title: "Delete Account",
  icon: "trash",
  desc: "Delete your account.",
  danger: true,
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
        <Title level={3}>
          Are you sure you want to <i>delete your {siteName} account</i>?
        </Title>
        <Paragraph>
          You will immediately lose access to all of{" "}
          <A external href="/projects">
            your projects
          </A>
          , and any purchased subscriptions will be canceled.
        </Paragraph>
        <Paragraph>
          Do NOT delete your account if you are{" "}
          <A href="https://github.com/sagemathinc/cocalc/issues/3243">
            a current student in a course...
          </A>
        </Paragraph>
        <Paragraph>
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
        </Paragraph>
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
              <Icon name="trash" /> Permanently Delete My {siteName} Account
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
