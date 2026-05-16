function createAzureSqlReplayJobStore() {
  throw new Error(
    'Azure SQL replay job store is not implemented yet. Use LIGHTHOUSE_JOB_STORE=sqlite.'
  );
}

module.exports = {
  createAzureSqlReplayJobStore,
};
