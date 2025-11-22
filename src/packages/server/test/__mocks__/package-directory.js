module.exports = async function packageDirectory() {
  return process.cwd();
};
module.exports.packageDirectory = async function ({ cwd } = {}) {
  return cwd || process.cwd();
};
