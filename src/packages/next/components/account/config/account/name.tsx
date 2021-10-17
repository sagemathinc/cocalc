//import { useEffect, useState } from "react";
import { Input, Space } from "antd";
//import apiPost from "lib/api/post";

export default function AccountName() {
//   const [data, setData] = useState<any>(undefined);
//   const [error, setError] = useState<string>("");

//   useEffect(() => {
//     (async () => {
//       const result = await apiPost("/query", {
//         accounts: { first_name: null, last_name: null, user_name: null },
//       });
//       if (result.error) {
//         setError(result.error);
//       } else {
//         setData(result.data);
//       }
//     })();
//   }, []);

  return (
    <div>
      <form>
        <Space
          direction="vertical"
          style={{ width: "100%", maxWidth: "500px" }}
        >
          <b>Your first name</b> The first letter of your first name is used for
          your avatar if you do not upload an image.
          <Input addonBefore={"First name"} />
          <b>Your last name</b> Your full name is used to label your cursor when
          you edit collaboratively with other poeple.
          <Input addonBefore={"Last name"} />
          <br />
          <b>Your username</b> Your username provides a nice URL for content you
          share publicly.
          <Input addonBefore={"Username"} />
        </Space>
      </form>
    </div>
  );
}
