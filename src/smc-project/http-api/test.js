require("ts-node").register({
  project: __dirname + "/../tsconfig.json",
  cacheDirectory: "/tmp"
});

require('coffeescript/register');

require("./server.ts").start_server({port:8080,port_path:'/tmp/port'});
