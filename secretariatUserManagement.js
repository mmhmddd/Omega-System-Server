// scripts/add-secretariat-access-to-employee.js
// Run this script ONCE to add secretariatUserManagement access to a specific employee

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, './data/users/users.json');

async function addSecretariatAccessToEmployee() {
  try {
    // Read users file
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(data);

    console.log('\n📋 Current Employees:');
    console.log('==================');
    
    const employees = users.filter(u => u.role === 'employee');
    
    if (employees.length === 0) {
      console.log('❌ No employees found in the system');
      return;
    }

    employees.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name} (${emp.username}) - ${emp.email}`);
      console.log(`   Current routeAccess: ${JSON.stringify(emp.routeAccess || [])}`);
    });

    console.log('\n🔧 Adding secretariatUserManagement to ALL employees...\n');

    // Update all employees
    let updated = 0;
    users.forEach(user => {
      if (user.role === 'employee') {
        // Initialize routeAccess if it doesn't exist
        if (!user.routeAccess) {
          user.routeAccess = [];
        }

        // Add secretariatUserManagement if not already present
        if (!user.routeAccess.includes('secretariatUserManagement')) {
          user.routeAccess.push('secretariatUserManagement');
          user.updatedAt = new Date().toISOString();
          updated++;
          console.log(`✅ Added access to: ${user.name} (${user.username})`);
        } else {
          console.log(`ℹ️  Already has access: ${user.name} (${user.username})`);
        }
      }
    });

    // Save updated users
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    console.log(`\n✅ Success! Updated ${updated} employee(s)`);
    console.log('\n📌 Next steps:');
    console.log('1. Employee users need to LOG OUT and LOG IN again');
    console.log('2. This will refresh their JWT token with the new routeAccess');
    console.log('3. Then they can access /secretariat-user route\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the function
addSecretariatAccessToEmployee();