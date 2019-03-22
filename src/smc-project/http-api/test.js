require("ts-node").register({
  project: __dirname + "/../tsconfig.json",
  cacheDirectory: "/tmp"
});

require("coffeescript/register");

const client = {
  secret_token: "secret",
  project_id: "e11c1abe-52a0-4959-ac1a-391e14088bf5"
};

require("./server.ts").start_server({
  port: 8080,
  port_path: "/tmp/port",
  client
});
