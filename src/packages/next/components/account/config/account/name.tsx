/*
Very bad experimental first account name configuration page.
This is extremely preliminary and just for experimentation.
*/

import { Alert, Input, Space } from "antd";
import Loading from "components/share/loading";
import Saving from "components/share/saving";
import useDatabase from "lib/hooks/database";

export default function AccountName() {
  const get = useDatabase({
    accounts: { first_name: null, last_name: null, name: null },
  });
  const set = useDatabase();

  function save(field: string) {
    return (e) => {
      const { value } = e.target;
      if (value) {
        set.query({ accounts: { [field]: value } });
      }
    };
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
            <b>Your first name</b> The first letter of your first name is used
            for your avatar if you do not upload an image.
            <Input
              addonBefore={"First name"}
              defaultValue={get.value.accounts.first_name}
              onChange={save("first_name")}
            />
            <b>Your last name</b> Your full name is used to label your cursor
            when you edit collaboratively with other poeple.
            <Input
              addonBefore={"Last name"}
              defaultValue={get.value.accounts.last_name}
              onChange={save("last_name")}
            />
            <br />
            <b>Your username</b> Your username provides a nice URL for content
            you share publicly.
            <Input
              addonBefore={"Username"}
              defaultValue={get.value.accounts.name}
              onChange={save("name")}
            />
          </Space>
        </form>
      )}
    </div>
  );
}
