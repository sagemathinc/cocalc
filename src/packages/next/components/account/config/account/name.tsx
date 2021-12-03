/*
Very bad experimental first account name configuration page.
This is extremely preliminary and just for experimentation.
*/

import { useEffect, useState } from "react";
import { Alert, Input, Space } from "antd";
import Loading from "components/share/loading";
import Saving from "components/share/saving";
import useDatabase from "lib/hooks/database";
import SaveButton from "components/misc/save-button";
import A from "components/misc/A";

interface Data {
  first_name?: string;
  last_name?: string;
  name?: string;
}
export default function AccountName() {
  const get = useDatabase({
    accounts: { first_name: null, last_name: null, name: null },
  });
  const set = useDatabase();

  const [original, setOriginal] = useState<Data | undefined>(undefined);
  const [edited, setEdited] = useState<Data | undefined>(undefined);

  useEffect(() => {
    if (!get.loading && original === undefined && get.value.accounts != null) {
      setOriginal(get.value.accounts);
      setEdited(get.value.accounts);
    }
  }, [get.loading]);

  function onChange(field: string) {
    return (e) => {
      setEdited({ ...edited, [field]: e.target.value });
    };
  }

  if (original == null || edited == null) {
    return <Loading />;
  }

  return (
    <div>
      {set.error && (
        <Alert
          style={{ marginTop: "20px" }}
          message="Error saving data"
          description={set.error}
          type="error"
          showIcon
        />
      )}{" "}
      {get.error && (
        <Alert
          style={{ marginTop: "20px" }}
          message="Error loading data"
          description={get.error}
          type="error"
          showIcon
        />
      )}{" "}
      {set.loading && <Saving />}
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
            <b>Your first name</b> Your name is used for interacting with other
            users in chat, your cursor when editing, etc. The first letter of
            your first name is used for your avatar if you do not upload an
            image.
            <Input
              addonBefore={"First name"}
              defaultValue={get.value.accounts.first_name}
              onChange={onChange("first_name")}
            />
            <br />
            <b>Your last name</b> Your full name is used to label your cursor
            when you edit collaboratively with other poeple.
            <Input
              addonBefore={"Last name"}
              defaultValue={get.value.accounts.last_name}
              onChange={onChange("last_name")}
            />
            <br />
            <b>Your username</b>
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
          </Space>
        </form>
      )}
    </div>
  );
}
