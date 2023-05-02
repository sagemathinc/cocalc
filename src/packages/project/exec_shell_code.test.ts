// jest test if calling "date" works

import { exec_shell_code } from "@cocalc/project/exec_shell_code";

test("exec_shell_code", (done) => {
  const mesg = {
    id: "abf3b9ca-47e3-4d77-a0f7-eec04952c684",
    event: "project_exec",
    command: "echo '2 * 21' | bc",
    bash: true,
  };

  // make socket a mock object with a method write_mesg
  const socket = {
    write_mesg: (type, mesg) => {
      //console.log("type", type, "mesg", mesg);
      expect(type).toBe("json");
      expect(mesg).toEqual({
        event: "project_exec_output",
        id: mesg.id,
        stdout: expect.any(String),
        stderr: "",
        exit_code: 0,
      });
      expect(mesg.stdout).toBe("42\n");
      done();
    },
  };

  exec_shell_code(socket as any, mesg);
});
