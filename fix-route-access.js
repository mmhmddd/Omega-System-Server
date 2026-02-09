// FIX SCRIPT - Initializes missing systemAccess and routeAccess fields
// Save as: fix-route-access.js
// Run with: node fix-route-access.js

const fs = require('fs');
const path = require('path');

console.log('==========================================');
console.log('🔧 ROUTE ACCESS FIX SCRIPT');
console.log('==========================================\n');

// Read users.json
const usersPath = path.join(__dirname, 'data/users/users.json');
const backupPath = path.join(__dirname, 'data/users/users.backup.json');
let users = [];

try {
  const usersData = fs.readFileSync(usersPath, 'utf8');
  users = JSON.parse(usersData);
  console.log(`✅ Loaded ${users.length} users from database\n`);
} catch (error) {
  console.error('❌ Error loading users:', error.message);
  process.exit(1);
}

// Create backup
try {
  fs.copyFileSync(usersPath, backupPath);
  console.log(`✅ Backup created: ${backupPath}\n`);
} catch (error) {
  console.error('❌ Error creating backup:', error.message);
  process.exit(1);
}

// Expected route keys for employees
const VALID_EMPLOYEE_ROUTES = [
  'suppliers',
  'itemsControl',
  'receipts',
  'rfqs',
  'purchases',
  'materialRequests',
  'priceQuotes',
  'proformaInvoice',
  'costingSheet',
  'secretariatUserManagement',
  'filesControl'
];

let fixedCount = 0;

// Fix each user
users.forEach((user, index) => {
  let userFixed = false;
  
  console.log(`Checking user ${index + 1}: ${user.name} (${user.role})`);
  
  // Fix systemAccess
  if (!user.systemAccess || typeof user.systemAccess !== 'object') {
    console.log(`  ⚠️  Initializing systemAccess`);
    user.systemAccess = {
      laserCuttingManagement: false
    };
    userFixed = true;
  } else {
    // Ensure laserCuttingManagement exists
    if (user.systemAccess.laserCuttingManagement === undefined) {
      console.log(`  ⚠️  Adding laserCuttingManagement to systemAccess`);
      user.systemAccess.laserCuttingManagement = false;
      userFixed = true;
    }
  }
  
  // Fix routeAccess
  if (!user.routeAccess) {
    console.log(`  ⚠️  Initializing routeAccess as empty array`);
    user.routeAccess = [];
    userFixed = true;
  } else if (!Array.isArray(user.routeAccess)) {
    console.log(`  ❌ Converting routeAccess to array (was ${typeof user.routeAccess})`);
    user.routeAccess = [];
    userFixed = true;
  } else {
    // Filter out invalid routes for employees
    if (user.role === 'employee') {
      const beforeCount = user.routeAccess.length;
      user.routeAccess = user.routeAccess.filter(route => 
        VALID_EMPLOYEE_ROUTES.includes(route)
      );
      const afterCount = user.routeAccess.length;
      
      if (beforeCount !== afterCount) {
        console.log(`  ⚠️  Removed ${beforeCount - afterCount} invalid routes`);
        userFixed = true;
      }
      
      // Remove duplicates
      const uniqueRoutes = [...new Set(user.routeAccess)];
      if (uniqueRoutes.length !== user.routeAccess.length) {
        console.log(`  ⚠️  Removed ${user.routeAccess.length - uniqueRoutes.length} duplicate routes`);
        user.routeAccess = uniqueRoutes;
        userFixed = true;
      }
    } else {
      // Non-employees should have empty routeAccess
      if (user.routeAccess.length > 0) {
        console.log(`  ⚠️  Clearing routeAccess for non-employee`);
        user.routeAccess = [];
        userFixed = true;
      }
    }
  }
  
  if (userFixed) {
    fixedCount++;
    console.log(`  ✅ User fixed\n`);
  } else {
    console.log(`  ✓ User OK\n`);
  }
});

// Save updated users
if (fixedCount > 0) {
  try {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
    console.log('==========================================');
    console.log(`✅ FIXED ${fixedCount} USERS`);
    console.log('==========================================');
    console.log(`Updated file: ${usersPath}`);
    console.log(`Backup saved: ${backupPath}`);
    console.log('');
    console.log('⚠️  IMPORTANT: You must restart your backend server!');
    console.log('==========================================\n');
  } catch (error) {
    console.error('❌ Error saving users:', error.message);
    console.log('\n⚠️  Restoring from backup...');
    try {
      fs.copyFileSync(backupPath, usersPath);
      console.log('✅ Backup restored');
    } catch (restoreError) {
      console.error('❌ Error restoring backup:', restoreError.message);
    }
    process.exit(1);
  }
} else {
  console.log('==========================================');
  console.log('✅ ALL USERS OK - NO FIXES NEEDED');
  console.log('==========================================\n');
}

// Show summary
console.log('📊 SUMMARY OF CHANGES:');
console.log('==========================================');
users.forEach(user => {
  console.log(`${user.name} (${user.role})`);
  console.log(`  systemAccess: ${JSON.stringify(user.systemAccess)}`);
  console.log(`  routeAccess: [${user.routeAccess.length} routes]`);
  if (user.role === 'employee' && user.routeAccess.length > 0) {
    user.routeAccess.forEach(route => {
      console.log(`    - ${route}`);
    });
  }
  console.log('');
});
console.log('==========================================');