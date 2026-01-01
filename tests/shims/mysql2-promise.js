const createConnectionStub = () => ({
  async query() {
    return [[], []];
  },
  async beginTransaction() {
    return;
  },
  async commit() {
    return;
  },
  async rollback() {
    return;
  },
  release() {
    return;
  },
});

const createPool = () => ({
  async query() {
    return [[], []];
  },
  async getConnection() {
    return createConnectionStub();
  },
});

module.exports = {
  createPool,
};
