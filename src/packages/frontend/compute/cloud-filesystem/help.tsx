import { Modal } from "antd";
import { A } from "@cocalc/frontend/components";

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
      <p>
        Type <code>cocalc -h</code> in a terminal running on a compute server to
        see the options for working with Cloud File Systems. In most cases you
        should run the <code>cocalc</code> command in a terminal from in a
        directory in the cloud file system (similar to how git is aware of the
        repo you are in).
      </p>
      <p>
        The <code>cocalc warmup</code> command is especially important to know
        about.
      </p>
      <ul style={{ marginTop: "15px" }}>
        <li>
          <strong>
            <code>cocalc warmup </code>:
          </strong>{" "}
          Downloads chunks for the current working directory to the local disk
          cache for much faster subsequent access. The disk cache (which is in
          <code>/data/.cloud-filesystem/cache/</code>) uses up to 90% of your
          disk and survives reboots but not deprovisioning. You may get much
          better performance with a Cloud File System by enlarging a compute
          server's disk (which is easy to do at any time), since then more of it
          can be used for cache.
        </li>
        <li>
          <strong>
            <code>cocalc backup</code>:{" "}
          </strong>
          Create and manage incremental backups. Run this command with no
          arguments from within the cloud file system to make a backup that is
          stored inside of the cloud file system itself. You can also make
          backups to other cloud file systems or directories.
        </li>
        <li>
          <strong>
            <code>cocalc sync &lt;source&gt; &lt;dest&gt;</code>:
          </strong>{" "}
          Efficiently sync files from a source directory to a dest directory.
          This is similar to rsync but potentially much faster since it is aware
          of how Cloud File Systems store data. It's also an efficient way to get
          data into and out of your Cloud File System.
        </li>
        <li>
          <strong>
            <code>cocalc cloudfs stat</code>:
          </strong>{" "}
          Show realtime performance statistics of a Cloud File System. In
          particular, you can see what objects are being uploaded or downloaded
          to better understand network usage, and whether any data is not yet
          uploaded before turning off a compute server.
        </li>
      </ul>
      Cloud File Systems use <A href="https://juicefs.com/en/">JuiceFS</A> under
      the hood, and there is also a{" "}
      <A href="https://juicefs.com/docs/community/command_reference">
        juicefs command
      </A>{" "}
      that you can explore.
    </div>
  );
}
