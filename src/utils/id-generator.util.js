// src/utils/id-generator.util.js
const fs = require('fs');
const path = require('path');

const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');

/**
 * Generate unique sequential ID for entities
 * @param {string} prefix - Prefix for the ID (e.g., 'USER', 'FILE', 'QU')
 * @returns {string} Generated ID (e.g., 'USER-0001')
 */
function generateId(prefix) {
  let counters = {};

  // Read existing counters
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, 'utf8');
      counters = JSON.parse(data);
    }
  } catch (error) {
    console.log('Creating new counters file');
  }

  // Initialize counter for this prefix if it doesn't exist
  if (!counters[prefix]) {
    counters[prefix] = 0;
  }

  // Increment counter
  counters[prefix]++;

  // Save counters back to file
  try {
    // Ensure directory exists
    const dir = path.dirname(COUNTER_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters, null, 2));
  } catch (error) {
    console.error('Error saving counter:', error);
  }

  // Format ID with padding (e.g., USER-0001)
  const paddedNumber = counters[prefix].toString().padStart(4, '0');
  return `${prefix}-${paddedNumber}`;
}

module.exports = { generateId };