/*
This must be in plain Javascript because it is used
by index.js.  Alternatively, we would have to introduce
an `npm run build` step, which is annoying.

This script will run `npm run build` if it hasn't
already been run with the same CUSTOMIZE variable.

NOTE: Of course this is not for development! We assume
that none of the tsx files, etc., have changed since
the last build.
*/

const { spawn } = require("child_process");
const { readFile } = require("fs");
const { join } = require("path");
const { promisify } = require("util");

async function needToBuild(customize) {
  // If build ran before, it creates ./next/required-server-files.json
  // which has the field config.env.customize.
  // So we just check that file exists and has the correct value.
  try {
    const json = (
      await promisify(readFile)(
        join(__dirname, "..", ".next", "required-server-files.json")
      )
    ).toString();
    const { config } = JSON.parse(json);
    // we just compare using stringify, which could in theory be different
    // even though there is no change, which is fine.
    return config.env.CUSTOMIZE != JSON.stringify(customize);
  } catch (err) {
    // console.log("required-server-files.json not found ", err);
    // missing or corrupt file -- no problem, this is expected to happen first time.
    return true;
  }
}

async function build(customize) {
  // Do a build with BASE_PATH and CUSTOMIZE env vars set.
  const env = {
    ...process.env,
    CUSTOMIZE: JSON.stringify(customize),
    BASE_PATH: customize.basePath,
  };
  const cwd = join(__dirname, "..");
  console.log(`\n*******\n\nBuilding nextjs production app in "${cwd}"\n\n*******\n\n`);
  await promisify((cb) => {
    spawn("npx", ["next", "build"], { env, cwd, stdio: "inherit" }).on(
      "close",
      cb
    );
  })();
}

module.exports = async function (customize) {
  if (await needToBuild(customize)) {
    await build(customize);
  } else {
    console.log("next app already built");
  }
};
