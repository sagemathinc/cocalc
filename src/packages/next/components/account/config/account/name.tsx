/*
Very bad experimental first account name configuration page.
This is extremely preliminary and just for experimentation.
*/

import { Alert, Checkbox, Input, Space } from "antd";
import { useEffect, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import SaveButton from "components/misc/save-button";
import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";
import register from "../register";

interface Data {
  first_name?: string;
  last_name?: string;
  name?: string;
  unlisted?: boolean;
}

const firstNameDesc = `Your name is used for interacting with
other users in chat, your cursor when editing, etc. The first
letter of your first name is used for your avatar if you do not
upload an image.`;

const lastNameDesc = `Your full name is used to label your cursor
when you edit collaboratively with other people, and to identify
you when you are @mentioned.   CoCalc does NOT have
a policy that you must user your real name, and you can change your
name at any time.`;

const unlistedDesc = `By default both your name and exact email address are
used when people search to add users as collaborators to projects.  There is
no way to do a search for partial email addresses, and your email address
is never revealed to other users.   If you choose to be unlisted, then you can
only be added as a collaborator to a project by an exact email
address match.`;

register({
  path: "account/name",
  title: "Your Name",
  icon: "user-times",
  desc: "Configure your first name, last name, username and whether or not your account is unlisted.",
  search: `{firstNameDesc} {lastNameDesc} Your username provides a nice URL for content you share publicly. unlisted {unlistedDesc}"`,
  Component: ConfigureName,
});

function ConfigureName() {
  const get = useDatabase({
    accounts: {
      first_name: null,
      last_name: null,
      name: null,
      unlisted: null,
    },
  });
  const [original, setOriginal] = useState<Data | undefined>(undefined);
  const [edited, setEdited] = useState<Data | undefined>(undefined);

  useEffect(() => {
    if (!get.loading && original === undefined && get.value.accounts != null) {
      setOriginal(get.value.accounts);
      setEdited(get.value.accounts);
    }
  }, [get.loading]);

  function onChange(field: string, value: string = "value") {
    return (e) => setEdited({ ...edited, [field]: e.target[value] });
  }

  if (original == null || edited == null) {
    return <Loading />;
  }

  return (
    <div>
      {get.error && (
        <Alert
          style={{ marginTop: "20px" }}
          message="Error loading data"
          description={get.error}
          type="error"
          showIcon
        />
      )}
      {get.loading ? (
        <Loading />
      ) : (
        <form>
          <Space
            direction="vertical"
            style={{ width: "100%", maxWidth: "500px" }}
          >
            <SaveButton
              edited={edited}
              original={original}
              setOriginal={setOriginal}
              table="accounts"
            />
            <br />
            <Paragraph>
              <Text strong>First Name</Text> {firstNameDesc}
            </Paragraph>
            <Input
              addonBefore={"First name"}
              defaultValue={get.value.accounts.first_name}
              onChange={onChange("first_name")}
            />
            <br />
            <Paragraph>
              <Text strong>Last Name</Text> {lastNameDesc}
            </Paragraph>
            <Input
              addonBefore={"Last name"}
              defaultValue={get.value.accounts.last_name}
              onChange={onChange("last_name")}
            />
            <br />
            <Paragraph>
              <Text strong>Username</Text> Your username provides a{" "}
              {edited.name ? (
                <A external href={`/${edited.name}`}>
                  nice URL
                </A>
              ) : (
                "nice URL"
              )}{" "}
              for content you share publicly.
              {original.name && (
                <>
                  Setting a username provides optional nicer URL's for shared
                  public documents. Your username can be between 1 and 39
                  characters, contain upper and lower case letters, numbers, and
                  dashes.
                  <br />
                  WARNING: If you change your username, existing links using the
                  previous username will no longer work (automatic redirects are
                  not implemented), so change with caution.
                </>
              )}
            </Paragraph>
            <Input
              addonBefore={"Name"}
              defaultValue={get.value.accounts.name}
              onChange={onChange("name")}
            />
            <br />
            <Paragraph>
              <Text strong>
                <Icon name="user-secret" /> Unlisted
              </Text>{" "}
              {unlistedDesc}
            </Paragraph>
            <Checkbox
              defaultChecked={get.value.accounts.unlisted}
              onChange={onChange("unlisted", "checked")}
            >
              Unlisted
            </Checkbox>
          </Space>
        </form>
      )}
    </div>
  );
}
