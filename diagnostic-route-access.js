// DIAGNOSTIC SCRIPT - Run this in your backend to check route access setup
// Save as: diagnostic-route-access.js
// Run with: node diagnostic-route-access.js

const fs = require('fs');
const path = require('path');

console.log('==========================================');
console.log('🔍 ROUTE ACCESS DIAGNOSTIC TOOL');
console.log('==========================================\n');

// Read users.json
const usersPath = path.join(__dirname, 'data/users/users.json');
let users = [];

try {
  const usersData = fs.readFileSync(usersPath, 'utf8');
  users = JSON.parse(usersData);
  console.log(`✅ Loaded ${users.length} users from database\n`);
} catch (error) {
  console.error('❌ Error loading users:', error.message);
  process.exit(1);
}

// Expected route keys for employees (11 routes)
const EXPECTED_EMPLOYEE_ROUTES = [
  'suppliers',              // إدارة الموردين
  'itemsControl',           // إدارة الأصناف
  'receipts',               // إيصالات الاستلام
  'rfqs',                   // طلبات عروض الأسعار
  'purchases',              // أوامر الشراء
  'materialRequests',       // طلبات المواد
  'priceQuotes',            // عروض الأسعار
  'proformaInvoice',        // فاتورة مُقدمة
  'costingSheet',           // كشف التكاليف
  'secretariatUserManagement', // نماذج الموظف
  'filesControl'            // إدارة الملفات
];

console.log('📋 EXPECTED EMPLOYEE ROUTES (11 total):');
EXPECTED_EMPLOYEE_ROUTES.forEach((route, index) => {
  console.log(`  ${index + 1}. ${route}`);
});
console.log('');

// Check each user
users.forEach((user, index) => {
  console.log('==========================================');
  console.log(`USER ${index + 1}: ${user.name} (${user.username})`);
  console.log('==========================================');
  console.log('ID:', user.id);
  console.log('Role:', user.role);
  console.log('Active:', user.active);
  console.log('');

  // Check systemAccess
  console.log('🔧 SYSTEM ACCESS:');
  if (!user.systemAccess) {
    console.log('  ❌ systemAccess is MISSING');
    console.log('  ⚠️  FIX: Should be: { laserCuttingManagement: false }');
  } else {
    console.log('  ✅ systemAccess exists');
    console.log('  laserCuttingManagement:', user.systemAccess.laserCuttingManagement || false);
  }
  console.log('');

  // Check routeAccess
  console.log('🛣️  ROUTE ACCESS:');
  if (!user.routeAccess) {
    console.log('  ❌ routeAccess is MISSING');
    console.log('  ⚠️  FIX: Should be an array');
  } else if (!Array.isArray(user.routeAccess)) {
    console.log('  ❌ routeAccess is NOT AN ARRAY');
    console.log('  ⚠️  Type:', typeof user.routeAccess);
    console.log('  ⚠️  FIX: Should be an array like []');
  } else {
    console.log('  ✅ routeAccess is an array');
    console.log(`  📊 Count: ${user.routeAccess.length} routes`);
    
    if (user.role === 'employee') {
      console.log('');
      console.log('  EMPLOYEE ROUTE ANALYSIS:');
      
      // Check for invalid routes
      const invalidRoutes = user.routeAccess.filter(
        route => !EXPECTED_EMPLOYEE_ROUTES.includes(route)
      );
      
      if (invalidRoutes.length > 0) {
        console.log('  ❌ INVALID ROUTES FOUND:', invalidRoutes.length);
        invalidRoutes.forEach(route => {
          console.log(`     - "${route}" (not in allowed list)`);
        });
      }
      
      // Check for missing routes
      const missingRoutes = EXPECTED_EMPLOYEE_ROUTES.filter(
        route => !user.routeAccess.includes(route)
      );
      
      if (missingRoutes.length > 0) {
        console.log(`  ⚠️  MISSING ROUTES: ${missingRoutes.length} of 11`);
        missingRoutes.forEach(route => {
          console.log(`     - ${route}`);
        });
      }
      
      // Show granted routes
      console.log('');
      console.log('  ✅ GRANTED ROUTES:');
      const validRoutes = user.routeAccess.filter(
        route => EXPECTED_EMPLOYEE_ROUTES.includes(route)
      );
      if (validRoutes.length === 0) {
        console.log('     (none)');
      } else {
        validRoutes.forEach(route => {
          console.log(`     ✓ ${route}`);
        });
      }
    } else {
      console.log(`  ℹ️  Not an employee - routeAccess not required for ${user.role}`);
      if (user.routeAccess.length > 0) {
        console.log('  ⚠️  Note: Non-employees should have empty routeAccess array');
      }
    }
  }
  console.log('');
});

// Summary
console.log('==========================================');
console.log('📊 SUMMARY');
console.log('==========================================');

const employeeUsers = users.filter(u => u.role === 'employee');
const usersWithMissingSystemAccess = users.filter(u => !u.systemAccess);
const usersWithMissingRouteAccess = users.filter(u => !u.routeAccess);
const usersWithInvalidRouteAccess = users.filter(u => u.routeAccess && !Array.isArray(u.routeAccess));

console.log(`Total users: ${users.length}`);
console.log(`Employees: ${employeeUsers.length}`);
console.log(`Users missing systemAccess: ${usersWithMissingSystemAccess.length}`);
console.log(`Users missing routeAccess: ${usersWithMissingRouteAccess.length}`);
console.log(`Users with invalid routeAccess (not array): ${usersWithInvalidRouteAccess.length}`);
console.log('');

if (usersWithMissingSystemAccess.length > 0) {
  console.log('⚠️  WARNING: Some users are missing systemAccess');
  console.log('   Run the fix script to initialize missing fields');
}

if (usersWithMissingRouteAccess.length > 0) {
  console.log('⚠️  WARNING: Some users are missing routeAccess');
  console.log('   Run the fix script to initialize missing fields');
}

if (usersWithInvalidRouteAccess.length > 0) {
  console.log('❌ ERROR: Some users have invalid routeAccess (not an array)');
  console.log('   Run the fix script to correct this');
}

console.log('');
console.log('==========================================');
console.log('💡 NEXT STEPS:');
console.log('==========================================');
console.log('1. Review the output above');
console.log('2. If issues found, run: node fix-route-access.js');
console.log('3. Check the users-control component in frontend');
console.log('4. Verify middleware is using checkRouteAccess()');
console.log('==========================================');