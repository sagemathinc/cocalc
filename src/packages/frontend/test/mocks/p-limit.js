function createLimit() {
  const limit = (fn) => Promise.resolve().then(fn);
  limit.clearQueue = () => {};
  limit.pendingCount = 0;
  limit.activeCount = 0;
  return limit;
}

module.exports = createLimit;
module.exports.default = createLimit;
