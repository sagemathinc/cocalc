/*
Very bad experimental first account name configuration page.
This is extremely preliminary and just for experimentation.
*/

import { useEffect, useState } from "react";
import { Alert, Input, Space } from "antd";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";

export default function AccountName() {
  const [data, setData] = useState<any>(undefined);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const result = await apiPost("/user-query", {
        query: {
          accounts: { first_name: null, last_name: null, name: null },
        },
      });
      if (result.error || !result.query) {
        setError(result.error);
      } else {
        setData(result.query.accounts);
      }
    })();
  }, []);

  function save(field: string): (e) => Promise<void> {
    return async (e) => {
      const result = await apiPost("/user-query", {
        query: { accounts: { [field]: e.target.value } },
      });
      if (result.error) {
        setError(result.error);
      }
    };
  }

  return (
    <div>
      {error && (
        <Alert
          style={{ marginTop: "20px" }}
          message="Error"
          description={error}
          type="error"
          showIcon
        />
      )}{" "}
      {!data ? (
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
              defaultValue={data.first_name}
              onChange={save("first_name")}
            />
            <b>Your last name</b> Your full name is used to label your cursor
            when you edit collaboratively with other poeple.
            <Input
              addonBefore={"Last name"}
              defaultValue={data.last_name}
              onChange={save("last_name")}
            />
            <br />
            <b>Your username</b> Your username provides a nice URL for content
            you share publicly.
            <Input
              addonBefore={"Username"}
              defaultValue={data.name}
              onChange={save("name")}
            />
          </Space>
        </form>
      )}
    </div>
  );
}
