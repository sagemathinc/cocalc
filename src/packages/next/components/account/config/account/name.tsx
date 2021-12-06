/*
Very bad experimental first account name configuration page.
This is extremely preliminary and just for experimentation.
*/

import { useEffect, useState } from "react";
import { Alert, Checkbox, Input, Space } from "antd";
import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";
import SaveButton from "components/misc/save-button";
import A from "components/misc/A";
import register from "../register";
import { Icon } from "@cocalc/frontend/components/icon";

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
when you edit collaboratively with other people.  We do NOT have
a policy that you must user your real name.`;

const unlistedDesc = `If you choose to be unlisted, then you can
only be added as a collaborator to a project by an exact email
address match.`;

register({
  path: "account/name",
  title: "Your Name",
  icon: "user-times",
  desc: "Configure your first name, last name, username and whether or not your account is unlisted.",
  search: `{firstNameDesc} {lastNameDesc} Your username provides a nice URL for content you share publicly. unlisted {unlistedDesc}"`,
  Component: () => {
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
      if (
        !get.loading &&
        original === undefined &&
        get.value.accounts != null
      ) {
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
        )}{" "}
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
                defaultOriginal={original}
                table="accounts"
              />
              <br />
              <b>First Name</b> {firstNameDesc}
              <Input
                addonBefore={"First name"}
                defaultValue={get.value.accounts.first_name}
                onChange={onChange("first_name")}
              />
              <br />
              <b>Last Name</b> {lastNameDesc}
              <Input
                addonBefore={"Last name"}
                defaultValue={get.value.accounts.last_name}
                onChange={onChange("last_name")}
              />
              <br />
              <b>Username</b>
              <div>
                Your username provides a{" "}
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
                    {" "}
                    (Changing your name could break links that you have shared.)
                  </>
                )}
              </div>
              <Input
                addonBefore={"Name"}
                defaultValue={get.value.accounts.name}
                onChange={onChange("name")}
              />
              <br />
              <b>
                <Icon name="user-secret" /> Unlisted
              </b>
              <div>{unlistedDesc}</div>
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
  },
});
