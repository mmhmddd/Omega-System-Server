// src/utils/atomic-write.util.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Atomic file write utility
 * Writes to a temporary file first, then renames to prevent corruption
 */
class AtomicWrite {
  /**
   * Write data to file atomically (sync)
   * @param {string} filePath - Target file path
   * @param {string} data - Data to write
   */
  writeFileSync(filePath, data) {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const tempFilename = `.${filename}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    const tempPath = path.join(dir, tempFilename);

    try {
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temporary file
      fs.writeFileSync(tempPath, data, 'utf8');

      // Rename to target file (atomic operation)
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      // Clean up temporary file if it exists
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  /**
   * Write data to file atomically (async version)
   * @param {string} filePath - Target file path
   * @param {string} data - Data to write
   */
  async writeFile(filePath, data) {
    return new Promise((resolve, reject) => {
      try {
        this.writeFileSync(filePath, data);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Export both the instance and a direct function for backward compatibility
const atomicWriteInstance = new AtomicWrite();

// Export as function (for backward compatibility with existing code)
const atomicWrite = async (filePath, data) => {
  return atomicWriteInstance.writeFile(filePath, data);
};

// Also export sync version
atomicWrite.sync = (filePath, data) => {
  return atomicWriteInstance.writeFileSync(filePath, data);
};

// Export the instance methods
atomicWrite.writeFile = atomicWriteInstance.writeFile.bind(atomicWriteInstance);
atomicWrite.writeFileSync = atomicWriteInstance.writeFileSync.bind(atomicWriteInstance);

module.exports = atomicWrite;
module.exports.atomicWrite = atomicWrite;
module.exports.AtomicWrite = AtomicWrite;