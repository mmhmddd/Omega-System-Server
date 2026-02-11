// src/services/user.service.js (COMPLETE FIX - All Issues Resolved)
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');

const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ Complete list of allowed routes for employees (11 routes)
const AVAILABLE_ROUTES = [
  // Management
  { 
    key: 'itemsControl',
    label: 'إدارة الأصناف', 
    path: '/items-control',
    category: 'management'
  },
  { 
    key: 'filesControl',
    label: 'إدارة الملفات', 
    path: '/files-control',
    category: 'management'
  },

  // Procurement
  { 
    key: 'suppliers', 
    label: 'إدارة الموردين', 
    path: '/suppliers',
    category: 'procurement'
  },
  { 
    key: 'rfqs', 
    label: 'طلبات عروض الأسعار', 
    path: '/rfqs',
    category: 'procurement'
  },
  { 
    key: 'priceQuotes',
    label: 'عروض الأسعار', 
    path: '/price-quotes',
    category: 'procurement'
  },
  { 
    key: 'purchases', 
    label: 'أوامر الشراء', 
    path: '/purchases',
    category: 'procurement'
  },

  // Inventory
  { 
    key: 'materialRequests',
    label: 'طلبات المواد', 
    path: '/material-requests',
    category: 'inventory'
  },
  { 
    key: 'receipts', 
    label: 'إيصالات الاستلام', 
    path: '/receipts',
    category: 'inventory'
  },

  // Operations
  { 
    key: 'proformaInvoice',
    label: 'فاتورة مُقدمة', 
    path: '/Proforma-invoice',
    category: 'operations'
  },
  { 
    key: 'costingSheet',
    label: 'كشف التكاليف', 
    path: '/costing-sheet',
    category: 'operations'
  },
  { 
    key: 'secretariatUserManagement',
    label: 'نماذج الموظف', 
    path: '/secretariat-user',
    category: 'operations'
  }
];

const VALID_ROUTE_KEYS = AVAILABLE_ROUTES.map(r => r.key);


class UserService {
  /**
   * ✅ CRITICAL: Initialize missing fields for a user
   */
  _initializeUserFields(user) {
    // Initialize systemAccess
    if (!user.systemAccess || typeof user.systemAccess !== 'object') {
      user.systemAccess = {
        laserCuttingManagement: false
      };
      console.log('⚠️ Initialized missing systemAccess for user:', user.username);
    }

    // Ensure all systemAccess fields exist
    if (user.systemAccess.laserCuttingManagement === undefined) {
      user.systemAccess.laserCuttingManagement = false;
    }

    // Initialize routeAccess
    if (!Array.isArray(user.routeAccess)) {
      user.routeAccess = [];
      console.log('⚠️ Initialized missing routeAccess for user:', user.username);
    }

    // Filter out invalid route keys
    const validRoutes = user.routeAccess.filter(key => VALID_ROUTE_KEYS.includes(key));
    if (validRoutes.length !== user.routeAccess.length) {
      console.log(`⚠️ Removed ${user.routeAccess.length - validRoutes.length} invalid routes for user:`, user.username);
      user.routeAccess = validRoutes;
    }

    return user;
  }

  async initializeUsersFile() {
    try {
      const usersDir = path.dirname(USERS_FILE);
      try {
        await fs.access(usersDir);
      } catch {
        await fs.mkdir(usersDir, { recursive: true });
        console.log('✅ Created users directory');
      }

      try {
        await fs.access(USERS_FILE);
      } catch {
        const defaultUsers = [
          {
            id: "USER-0001",
            username: "admin.super",
            name: "Super Admin",
            email: "admin@laser.com",
            password: "admin123",
            role: "super_admin",
            active: true,
            systemAccess: {
              laserCuttingManagement: true,
            },
            routeAccess: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        await atomicWrite(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('✅ Created users.json with default super admin');
      }
    } catch (error) {
      console.error('❌ Error initializing users file:', error);
      throw error;
    }
  }

  async loadUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      
      // ✅ Initialize missing fields for all users
      let updated = false;
      users.forEach((user, index) => {
        const before = JSON.stringify(user);
        this._initializeUserFields(user);
        const after = JSON.stringify(user);
        
        if (before !== after) {
          updated = true;
          console.log('✅ Fixed user data:', user.username);
        }
      });

      // Save if any users were updated
      if (updated) {
        await this.saveUsers(users);
        console.log('✅ Saved corrected user data');
      }

      return users;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.initializeUsersFile();
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
      }
      throw error;
    }
  }

  async saveUsers(users) {
    // ✅ Ensure all users have proper fields before saving
    users.forEach(user => this._initializeUserFields(user));
    await atomicWrite(USERS_FILE, JSON.stringify(users, null, 2));
  }

  async generateUniqueUsername(name, email, users) {
    const emailPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    let cleanName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
      .join('.');
    
    if (!cleanName) {
      cleanName = emailPrefix;
    }
    
    let username = cleanName;
    
    if (!users.some(u => u.username === username)) {
      return username;
    }
    
    username = `${cleanName}.${emailPrefix}`;
    if (!users.some(u => u.username === username)) {
      return username;
    }
    
    let suffix = 1;
    let attempts = 0;
    const maxAttempts = 1000;
    
    while (attempts < maxAttempts) {
      const paddedSuffix = suffix.toString().padStart(3, '0');
      username = `${cleanName}.${paddedSuffix}`;
      
      if (!users.some(u => u.username === username)) {
        return username;
      }
      
      suffix++;
      attempts++;
    }
    
    const timestamp = Date.now().toString().slice(-6);
    username = `${cleanName}.${timestamp}`;
    
    if (users.some(u => u.username === username)) {
      throw new Error('Failed to generate unique username');
    }
    
    return username;
  }

  async emailExists(email, excludeId = null) {
    const users = await this.loadUsers();
    return users.some(u => u.email === email && u.id !== excludeId);
  }

  async usernameExists(username, excludeId = null) {
    const users = await this.loadUsers();
    return users.some(u => u.username === username && u.id !== excludeId);
  }

  validateRouteKeys(routeKeys) {
    if (!Array.isArray(routeKeys)) {
      throw new Error('Route access must be an array');
    }

    const invalidKeys = routeKeys.filter(key => !VALID_ROUTE_KEYS.includes(key));
    
    if (invalidKeys.length > 0) {
      console.error('❌ Invalid route keys:', invalidKeys);
      console.log('✅ Valid route keys:', VALID_ROUTE_KEYS);
      throw new Error(`Invalid route keys: ${invalidKeys.join(', ')}`);
    }

    return true;
  }

  async createUser(userData) {
    const users = await this.loadUsers();

    if (await this.emailExists(userData.email)) {
      throw new Error('Email already exists');
    }

    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(userData.role)) {
      throw new Error('Invalid role specified');
    }

    const username = await this.generateUniqueUsername(
      userData.name,
      userData.email,
      users
    );

    // ✅ Initialize systemAccess properly
    const systemAccess = {
      laserCuttingManagement: false,
      ...(userData.systemAccess || {})
    };

    // ✅ Initialize routeAccess for employees only
    let routeAccess = [];
    if (userData.role === 'employee') {
      routeAccess = userData.routeAccess || [];
      
      if (routeAccess.length > 0) {
        this.validateRouteKeys(routeAccess);
      }
      
      routeAccess = [...new Set(routeAccess)];
      console.log('✅ Creating employee with routeAccess:', routeAccess);
    }

    const newUser = {
      id: generateId('USER'),
      username,
      name: userData.name,
      email: userData.email,
      password: userData.password,
      role: userData.role,
      active: true,
      systemAccess,
      routeAccess,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(newUser);
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  async getAllUsers(filters = {}) {
    let users = await this.loadUsers();

    if (filters.role) {
      users = users.filter(u => u.role === filters.role);
    }

    if (filters.active !== undefined) {
      users = users.filter(u => u.active === filters.active);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      users = users.filter(u => 
        u.name.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower) ||
        u.username.toLowerCase().includes(searchLower)
      );
    }

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedUsers = users.slice(startIndex, endIndex);
    const usersWithoutPasswords = paginatedUsers.map(({ password, ...user }) => user);

    return {
      users: usersWithoutPasswords,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(users.length / limit),
        totalUsers: users.length,
        limit
      }
    };
  }

  async getUserById(id) {
    const users = await this.loadUsers();
    const user = users.find(u => u.id === id);

    if (!user) {
      throw new Error('User not found');
    }

    // ✅ Initialize missing fields
    this._initializeUserFields(user);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * ✅ FIXED: Update user with proper handling of systemAccess and routeAccess
   */
  async updateUser(id, updateData) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    // Validate email if changed
    if (updateData.email && updateData.email !== user.email) {
      if (await this.emailExists(updateData.email, id)) {
        throw new Error('Email already exists');
      }
    }

    // Validate role if provided
    if (updateData.role) {
      const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
      if (!validRoles.includes(updateData.role)) {
        throw new Error('Invalid role specified');
      }
    }

    // Update basic fields
    if (updateData.name) user.name = updateData.name;
    if (updateData.email) user.email = updateData.email;
    if (updateData.password) user.password = updateData.password;
    if (updateData.role) user.role = updateData.role;
    if (updateData.active !== undefined) user.active = updateData.active;
    
    // ✅ CRITICAL FIX: Update systemAccess properly
    if (updateData.systemAccess !== undefined) {
      // Validate that systemAccess is an object
      if (typeof updateData.systemAccess !== 'object' || updateData.systemAccess === null) {
        throw new Error('systemAccess must be an object');
      }

      // Merge with existing systemAccess, don't replace
      user.systemAccess = {
        ...user.systemAccess,
        ...updateData.systemAccess
      };

      console.log('✅ Updated systemAccess:', user.systemAccess);
    }

    // ✅ CRITICAL FIX: Update routeAccess properly
    if (updateData.routeAccess !== undefined) {
      const currentRole = updateData.role || user.role;
      
      if (currentRole === 'employee') {
        // Validate that routeAccess is an array
        if (!Array.isArray(updateData.routeAccess)) {
          throw new Error('routeAccess must be an array');
        }

        // Validate route keys
        this.validateRouteKeys(updateData.routeAccess);
        
        // Remove duplicates and assign
        user.routeAccess = [...new Set(updateData.routeAccess)];
        
        console.log('✅ Updated employee routeAccess:', user.routeAccess);
      } else {
        // Non-employees don't use routeAccess
        user.routeAccess = [];
      }
    }

    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async deleteUser(id) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];
    if (user.role === 'super_admin') {
      const superAdmins = users.filter(u => u.role === 'super_admin');
      if (superAdmins.length === 1) {
        throw new Error('Cannot delete the last super admin');
      }
    }

    users.splice(userIndex, 1);
    await this.saveUsers(users);

    return { message: 'User deleted successfully' };
  }

  async toggleUserActive(id) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    if (user.role === 'super_admin' && user.active) {
      const activeSuperAdmins = users.filter(u => u.role === 'super_admin' && u.active);
      if (activeSuperAdmins.length === 1) {
        throw new Error('Cannot deactivate the last active super admin');
      }
    }

    user.active = !user.active;
    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async isUsernameAvailable(username) {
    const users = await this.loadUsers();
    return !users.some(u => u.username.toLowerCase() === username.toLowerCase());
  }

  getAvailableRoutes() {
    return AVAILABLE_ROUTES;
  }

  async getUserStats() {
    const users = await this.loadUsers();

    return {
      total: users.length,
      active: users.filter(u => u.active).length,
      inactive: users.filter(u => !u.active).length,
      byRole: {
        super_admin: users.filter(u => u.role === 'super_admin').length,
        admin: users.filter(u => u.role === 'admin').length,
        employee: users.filter(u => u.role === 'employee').length,
        secretariat: users.filter(u => u.role === 'secretariat').length
      }
    };
  }
}

module.exports = new UserService();