import { Writable } from "stream";
import { delay } from "awaiting";

export { type Writable };

export function createPtyWritable(pty): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      try {
        // Normalize: always pass a string to pty.write
        const str = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
        pty.write(str);
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
}

export async function writeToWritablePty(
  writable: Writable,
  data: string,
  chunkSize = 1024, // 1 KB chunks by default
): Promise<void> {
  let offset = 0;

  while (offset < data.length) {
    const chunk = data.slice(offset, offset + chunkSize);
    offset += chunkSize;

    const ok = writable.write(chunk);
    if (!ok) {
      // Wait until PTY drains before writing the next chunk
      await waitForDrain(writable);
    }
    await delay(1);
  }
}

function waitForDrain(stream: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    function onDrain() {
      cleanup();
      resolve();
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    function onClose() {
      cleanup();
      reject(new Error("Stream closed before drain"));
    }
    function cleanup() {
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
    }

    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}
