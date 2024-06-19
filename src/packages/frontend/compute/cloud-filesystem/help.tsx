import { Modal } from "antd";

export function HelpModal({ open, setOpen }) {
  return (
    <Modal
      width={700}
      open={open}
      onOk={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <HelpText />
    </Modal>
  );
}

export function HelpText() {
  return (
    <div>
      <h2>Filesystem Commands</h2>
      Type <code>cocalc -h</code> in a terminal running on a compute server to
      see the options for the cocalc command. This command has several helpful
      subcommands for working with Cloud Filesystems:
      <ul style={{ marginTop: "15px" }}>
        <li>
          <strong>
            <code>cocalc stats &lt;path&gt;</code>:
          </strong>{" "}
          Show realtime performance statistics of a Cloud Filesystem. In
          particular, you can see what objects are being uploaded or downloaded
          to better understand network usage, and whether any data is not yet
          uploaded before turning off a compute server.
        </li>

        <li>
          <strong>
            <code>cocalc sync &lt;source&gt; &lt;dest&gt;</code>:
          </strong>{" "}
          Efficiently sync files from a source directory to a dest directory.
          This is similar to rsync but potentially much faster since it is aware
          of how Cloud Filesystem stores data. It's also an efficient way to get
          data into and out of your Cloud Filesystem.
        </li>

        <li>
          <strong>
            <code>cocalc warmup &lt;path&gt;</code>:
          </strong>{" "}
          Downloads all the chunks for the given path to the local disk cache
          for much faster subsequent access. The disk cache (which is in
          <code>/data/.cloud-filesystem/cache/</code>) uses up to 90% of your
          disk and survives reboots but not deprovisioning. You may get much
          better performance with a Cloud Filesystem by enlarging your compute
          servers main disk (which is easy to do at any time), since then more
          of it can be used for cache.
        </li>
      </ul>
    </div>
  );
}
