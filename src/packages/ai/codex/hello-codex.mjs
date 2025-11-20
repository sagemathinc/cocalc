/*
A little "hello world" to verify codex is authenticated
on a given computer.
*/

import { Codex } from "@openai/codex-sdk";

async function main() {
  const codex = new Codex();
  const thread = codex.startThread({
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true, // drop this if you’re inside a git repo
  });

  const turn = await thread.run("Say hello from Codex!");
  console.log("Thread ID:", thread.id);
  console.log("Final response:\n", turn.finalResponse);
}

main().catch((err) => {
  console.error("Codex error:", err);
  process.exit(1);
});
