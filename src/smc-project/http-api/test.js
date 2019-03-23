require("ts-node").register({
  project: __dirname + "/../tsconfig.json",
  cacheDirectory: "/tmp"
});

require("coffeescript/register");

const client = {
  secret_token: "secret",
  project_id: "e11c1abe-52a0-4959-ac1a-391e14088bf5",
  async get_syncdoc_history(string_id, patches) {
    return [{ string_id, this_is_fake: true }];
  },
  dbg(name) {
    return (...args) => {
      console.log(name, ...args);
    };
  }
};

async function start() {
  try {
    await require("./server.ts").start_server({
      port: 8080,
      port_path: "/tmp/port",
      client
    });
  } catch (err) {
    console.log(`EXCEPTION -- ${err}`);
    console.trace();
  }
}

start();
