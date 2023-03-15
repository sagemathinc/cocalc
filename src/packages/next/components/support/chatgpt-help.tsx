import { Input } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { CSSProperties, useState } from "react";
import apiPost from "lib/api/post";

export default function ChatGPTHelp({ style }: { style?: CSSProperties }) {
  const [focus, setFocus] = useState<boolean>(false);
  return (
    <Input.Search
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={style}
      placeholder="What do you want to do using CoCalc?"
      allowClear
      enterButton={
        <>
          <OpenAIAvatar size={18} backgroundColor="transparent" />
          {!focus && <> ChatGPT</>}
        </>
      }
      onSearch={async (value) => {
        console.log(value);
        const input = "How can I do the following using CoCalc? " + value;
        const output = await apiPost("/openai/chatgpt", { input });
        console.log("output = ", output);
      }}
    />
  );
}
