const fs = require('fs');
const path = require('path');

function logResults(data) {
  const logPath = path.resolve(__dirname, '../../logs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Create logs directory if not exists
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath);
  }

  const logFile = path.join(logPath, `results-${timestamp}.json`);

  // Save results to a JSON file
  fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
  console.log(`Results logged to: ${logFile}`);
}

module.exports = { logResults };
