// fix-user-routes.js - Run this ONCE to fix all users' route access data
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, './data/users/users.json');

// Mapping of old camelCase keys to new kebab-case keys
const ROUTE_KEY_MAPPING = {
  'priceQuotes': 'price-quotes',
  'materialRequests': 'material-requests',
  'proformaInvoice': 'Proforma-invoice',
  'secretariatUser': 'secretariat-user',
  'itemsControl': 'items-control',
  'filesControl': 'files-control'
};

function fixUserRoutes() {
  try {
    console.log('==========================================');
    console.log('🔧 FIXING USER ROUTE ACCESS DATA');
    console.log('==========================================');

    // Read users file
    const usersData = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);

    console.log(`📋 Total users: ${users.length}`);

    let fixedCount = 0;

    // Fix each user
    users.forEach(user => {
      if (user.routeAccess && Array.isArray(user.routeAccess) && user.routeAccess.length > 0) {
        console.log(`\n👤 Checking user: ${user.name} (${user.id})`);
        console.log(`   Current routeAccess:`, user.routeAccess);

        const fixedRoutes = user.routeAccess.map(route => {
          // Check if this route needs to be converted
          if (ROUTE_KEY_MAPPING[route]) {
            console.log(`   ✅ Converting: ${route} → ${ROUTE_KEY_MAPPING[route]}`);
            fixedCount++;
            return ROUTE_KEY_MAPPING[route];
          }
          return route;
        });

        // Remove duplicates
        user.routeAccess = [...new Set(fixedRoutes)];
        console.log(`   Updated routeAccess:`, user.routeAccess);
      } else {
        // Ensure routeAccess exists for employees
        if (user.role === 'employee' && !user.routeAccess) {
          user.routeAccess = [];
          console.log(`   ✅ Added empty routeAccess for employee: ${user.name}`);
        }
      }
    });

    // Save back to file
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

    console.log('\n==========================================');
    console.log(`✅ COMPLETED!`);
    console.log(`✅ Fixed ${fixedCount} route keys`);
    console.log(`✅ Users file updated successfully`);
    console.log('==========================================');

  } catch (error) {
    console.error('❌ Error fixing user routes:', error);
    process.exit(1);
  }
}

// Run the fix
fixUserRoutes();