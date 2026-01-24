// src/services/reset.service.js
const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util'); // ✅ Fixed

const USERS_FILE = path.join(__dirname, '../../data/users/users.json');
const COUNTERS_FILE = path.join(__dirname, '../../data/counters.json');

class ResetService {
  async areAllUsersDeleted() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      return users.length === 0;
    } catch (error) {
      return true;
    }
  }

  async resetUserCounter() {
    try {
      let counters = {};
      
      try {
        const data = await fs.readFile(COUNTERS_FILE, 'utf8');
        counters = JSON.parse(data);
      } catch (error) {
        // File doesn't exist
      }

      counters.USER = 0;

      // ✅ Fixed: Use as function
      await atomicWrite(COUNTERS_FILE, JSON.stringify(counters, null, 2));
      
      console.log('✅ User counter reset to start from USER-0001');
      return true;
    } catch (error) {
      console.error('❌ Error resetting counter:', error);
      throw error;
    }
  }

  async recreateDefaultAdmin() {
    const defaultAdmin = {
      id: "USER-0001",
      username: "admin.super",
      name: "Super Admin",
      email: "admin@laser.com",
      password: "admin123",
      role: "super_admin",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // ✅ Fixed: Use as function
    await atomicWrite(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
    
    let counters = {};
    try {
      const data = await fs.readFile(COUNTERS_FILE, 'utf8');
      counters = JSON.parse(data);
    } catch (error) {
      // Ignore
    }
    
    counters.USER = 1;
    await atomicWrite(COUNTERS_FILE, JSON.stringify(counters, null, 2));
    
    console.log('✅ Default super admin recreated');
    return defaultAdmin;
  }

  async fullReset() {
    console.log('🔄 Starting full system reset...');
    
    await this.resetUserCounter();
    const admin = await this.recreateDefaultAdmin();
    
    console.log('✅ System reset complete');
    
    return {
      success: true,
      message: 'System reset successfully',
      defaultAdmin: {
        email: admin.email,
        password: admin.password
      }
    };
  }

  async reindexUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      let users = JSON.parse(data);

      if (users.length === 0) {
        await this.resetUserCounter();
        return {
          success: true,
          message: 'No users to reindex, counter reset',
          totalUsers: 0
        };
      }

      users = users.map((user, index) => {
        const newId = `USER-${String(index + 1).padStart(4, '0')}`;
        return {
          ...user,
          id: newId,
          updatedAt: new Date().toISOString()
        };
      });

      // ✅ Fixed: Use as function
      await atomicWrite(USERS_FILE, JSON.stringify(users, null, 2));

      let counters = {};
      try {
        const counterData = await fs.readFile(COUNTERS_FILE, 'utf8');
        counters = JSON.parse(counterData);
      } catch (error) {
        // Ignore
      }

      counters.USER = users.length;
      await atomicWrite(COUNTERS_FILE, JSON.stringify(counters, null, 2));

      console.log(`✅ Reindexed ${users.length} users`);

      return {
        success: true,
        message: 'Users reindexed successfully',
        totalUsers: users.length,
        newCounter: users.length
      };
    } catch (error) {
      console.error('❌ Error reindexing users:', error);
      throw error;
    }
  }

  async getSystemStats() {
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(usersData);

      let counter = 0;
      try {
        const counterData = await fs.readFile(COUNTERS_FILE, 'utf8');
        const counters = JSON.parse(counterData);
        counter = counters.USER || 0;
      } catch (error) {
        // Counter file doesn't exist
      }

      const roleCount = {
        super_admin: 0,
        admin: 0,
        employee: 0
      };

      let activeCount = 0;
      let inactiveCount = 0;

      users.forEach(user => {
        if (roleCount[user.role] !== undefined) {
          roleCount[user.role]++;
        }
        if (user.active) {
          activeCount++;
        } else {
          inactiveCount++;
        }
      });

      return {
        totalUsers: users.length,
        currentCounter: counter,
        isCounterInSync: users.length === counter,
        activeUsers: activeCount,
        inactiveUsers: inactiveCount,
        byRole: roleCount,
        needsReindex: users.length !== counter || this.hasDuplicateIds(users)
      };
    } catch (error) {
      return {
        totalUsers: 0,
        currentCounter: 0,
        isCounterInSync: true,
        activeUsers: 0,
        inactiveUsers: 0,
        byRole: {
          super_admin: 0,
          admin: 0,
          employee: 0
        },
        needsReindex: false
      };
    }
  }

  hasDuplicateIds(users) {
    const ids = users.map(u => u.id);
    return new Set(ids).size !== ids.length;
  }
}

module.exports = new ResetService();