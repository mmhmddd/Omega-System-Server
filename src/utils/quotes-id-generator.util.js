// src/utils/quotes-id-generator.util.js

/**
 * Generate unique ID with prefix
 * @param {string} prefix - ID prefix (e.g., 'USER', 'QUOTE', 'RFQ')
 * @returns {string} - Generated ID (e.g., 'USER-0001', 'QUOTE-0001')
 */
function generateId(prefix = 'ID') {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}${random}`;
}

/**
 * Generate sequential ID with prefix
 * @param {string} prefix - ID prefix
 * @param {number} number - Sequential number
 * @returns {string} - Generated ID (e.g., 'USER-0001')
 */
function generateSequentialId(prefix, number) {
  const paddedNumber = number.toString().padStart(4, '0');
  return `${prefix}-${paddedNumber}`;
}

/**
 * Parse ID to extract prefix and number
 * @param {string} id - ID to parse (e.g., 'USER-0001')
 * @returns {object} - { prefix: 'USER', number: 1 }
 */
function parseId(id) {
  const parts = id.split('-');
  return {
    prefix: parts[0],
    number: parts[1] ? parseInt(parts[1]) : null
  };
}

module.exports = {
  generateId,
  generateSequentialId,
  parseId
};