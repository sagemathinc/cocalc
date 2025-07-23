import bash from "@cocalc/backend/bash";
import { once } from "@cocalc/util/async-utils";

describe("test the bash child process spawner", () => {
  it("echos 'hi'", async () => {
    const child = await bash("echo 'hi'");
    let out = "";
    child.stdout.on("data", (data) => {
      out += data.toString();
    });
    await once(child, "exit");
    expect(out).toBe("hi\n");
  });

  it("runs a multiline bash script", async () => {
    const child = await bash(`
sum=0
for i in {1..100}; do
  sum=$((sum + i))
done
echo $sum
`);
    let out = "";
    child.stdout.on("data", (data) => {
      out += data.toString();
    });
    await once(child, "exit");
    expect(out).toBe("5050\n");
  });

  it("runs a bash script with ulimit to limit execution time", async () => {
    const child = await bash(`
ulimit -t 1
while : ; do : ; done  # infinite CPU 
`);
    const x = await once(child, "exit");
    expect(x[1]).toBe("SIGKILL");
  });
});
