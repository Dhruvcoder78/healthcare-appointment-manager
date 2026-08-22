// Serializable transactions can spuriously abort with P2034 when Postgres
// detects a conflicting concurrent transaction; retrying is the documented
// way to resolve that (the losing transaction just re-runs from scratch).
async function withSerializableRetry(fn, { retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const isTransactionConflict = err.code === 'P2034';
      if (!isTransactionConflict || attempt === retries) {
        throw err;
      }
    }
  }
  return undefined;
}

module.exports = { withSerializableRetry };
