const path = require('path');

const backendRoot = path.resolve(__dirname, '..', '..');
const projectRoot = path.resolve(backendRoot, '..');

const paths = {
  projectRoot,
  backendRoot,
  customWebuiDir: path.join(projectRoot, 'custom-webui'),
  nanobotDistDir: path.join(backendRoot, 'nanobot', 'web', 'dist'),
  dataDir: path.join(backendRoot, 'data'),
  databaseFile: path.join(backendRoot, 'data', 'app.db'),
  importReportsDir: path.join(backendRoot, 'data', 'import-reports'),
  logsDir: path.join(backendRoot, 'logs'),
  startEnvFile: path.join(backendRoot, 'start.env'),
  startEnvExampleFile: path.join(backendRoot, 'start.env.example'),
};

module.exports = paths;
