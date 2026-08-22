const app = require('./app');
const { startJobs } = require('./jobs');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startJobs();
});
