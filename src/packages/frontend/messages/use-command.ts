import { useEffect, useRef } from "react";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function useCommand(commands: { [name: string]: Function }) {
  const firstMountRef = useRef<boolean>(true);
  const command = useTypedRedux("messages", "command");
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    const name = command.get("name");
    commands[name]?.();
  }, [command]);
}
