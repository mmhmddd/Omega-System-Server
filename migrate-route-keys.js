// migrate-route-keys.js
// This script converts old kebab-case route keys to new camelCase format in users.json

const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, './data/users/users.json');

// ✅ Mapping from old keys to new keys
const ROUTE_KEY_MAPPING = {
  'items-control': 'itemsControl',
  'files-control': 'filesControl',
  'price-quotes': 'priceQuotes',
  'material-requests': 'materialRequests',
  'empty-receipt': 'emptyReceipt',
  'Proforma-invoice': 'proformaInvoice',
  'costing-sheet': 'costingSheet',
  'secretariat-user': 'secretariatUserManagement',
  
  // These stay the same (already correct)
  'dashboard': 'dashboard',
  'users': 'users',
  'suppliers': 'suppliers',
  'rfqs': 'rfqs',
  'purchases': 'purchases',
  'receipts': 'receipts',
  'cutting': 'cutting',
  'secretariat': 'secretariat',
  'analysis': 'analysis'
};

async function migrateRouteKeys() {
  try {
    console.log('🔄 Starting route key migration...');

    // Read users file
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(data);

    console.log(`📊 Found ${users.length} users`);

    let changesCount = 0;

    // Update each user's routeAccess
    users.forEach(user => {
      if (user.routeAccess && Array.isArray(user.routeAccess)) {
        const oldRouteAccess = [...user.routeAccess];
        
        // Convert old keys to new keys
        const newRouteAccess = user.routeAccess.map(oldKey => {
          const newKey = ROUTE_KEY_MAPPING[oldKey] || oldKey;
          if (newKey !== oldKey) {
            console.log(`  ✅ ${user.name}: "${oldKey}" → "${newKey}"`);
            changesCount++;
          }
          return newKey;
        });

        // Remove duplicates
        user.routeAccess = [...new Set(newRouteAccess)];

        if (JSON.stringify(oldRouteAccess) !== JSON.stringify(user.routeAccess)) {
          console.log(`  📝 Updated ${user.name}:`, {
            old: oldRouteAccess,
            new: user.routeAccess
          });
        }
      } else if (user.role === 'employee' && !user.routeAccess) {
        // Ensure employees have routeAccess array
        user.routeAccess = [];
        console.log(`  ➕ Added empty routeAccess for ${user.name}`);
      }
    });

    // Save updated users
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));

    console.log('✅ Migration complete!');
    console.log(`📊 Total changes: ${changesCount}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateRouteKeys();