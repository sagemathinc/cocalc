export function init({ Server }) {
  const io = new Server({});

  io.on("connection", (socket) => {
    console.log("got connection", socket.id);

    socket.on("publish", ({ subject, data }) => {
      // TODO: auth check
      console.log("publishing", { subject, data });
      io.to(subject).emit(subject, data);
    });

    socket.on("subscribe", ({ subject }) => {
      // TODO: auth check
      console.log("join ", { subject });
      socket.join(subject);
    });

    socket.on("unsubscribe", ({ subject }) => {
      socket.leave(subject);
    });
  });

  io.listen(3000);
  console.log("server listening on port 3000");
  return io;
}
