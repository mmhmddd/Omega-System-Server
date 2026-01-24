// src/utils/logger.util.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class Logger {
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    
    // Console
    console.log(logMessage.trim());
    
    // File
    fs.appendFileSync(APP_LOG, logMessage);
  }

  error(message, error) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ERROR] ${message}\n${error?.stack || ''}\n`;
    
    // Console
    console.error(logMessage.trim());
    
    // File
    fs.appendFileSync(ERROR_LOG, logMessage);
  }

  info(message) {
    this.log(message, 'INFO');
  }

  warn(message) {
    this.log(message, 'WARN');
  }
}

module.exports = new Logger();