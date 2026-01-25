// src/services/user.service.js (UPDATED with routeAccess)
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');
const emailService = require('../utils/email.util');

const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// Available routes that can be assigned to employees
const AVAILABLE_ROUTES = [
  { key: 'priceQuotes', label: 'Price Quotes', path: '/api/price-quotes' },
  { key: 'receipts', label: 'Receipts', path: '/api/receipts' },
  { key: 'cutting', label: 'Laser Cutting', path: '/api/cutting' },
  { key: 'rfqs', label: 'RFQs', path: '/api/rfqs' },
  { key: 'purchases', label: 'Purchase Orders', path: '/api/purchases' },
  { key: 'materials', label: 'Material Requests', path: '/api/materials' },
  { key: 'suppliers', label: 'Suppliers', path: '/api/suppliers' },
  { key: 'items', label: 'Items', path: '/api/items' },
  { key: 'userForms', label: 'User Forms', path: '/api/user-forms' }
];

class UserService {
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
            routeAccess: [], // Super admins don't need routeAccess
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        await atomicWrite(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('✅ Created users.json with default super admin');
        console.log('📧 Email: admin@laser.com | Password: admin123');
      }
    } catch (error) {
      console.error('❌ Error initializing users file:', error);
      throw error;
    }
  }

  async loadUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
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
      throw new Error('Failed to generate unique username after multiple attempts');
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

  async createUser(userData) {
    const users = await this.loadUsers();

    if (await this.emailExists(userData.email)) {
      throw new Error('Email already exists');
    }

    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(userData.role)) {
      throw new Error('Invalid role specified. Valid roles: super_admin, admin, employee, secretariat');
    }

    const username = await this.generateUniqueUsername(
      userData.name,
      userData.email,
      users
    );

    if (users.some(u => u.username === username)) {
      throw new Error('Username already exists - generation error occurred');
    }

    const systemAccess = userData.systemAccess || {
      laserCuttingManagement: false,
    };

    // Initialize routeAccess for employees
    let routeAccess = [];
    if (userData.role === 'employee') {
      routeAccess = userData.routeAccess || [];
      
      // Validate routeAccess
      const validRouteKeys = AVAILABLE_ROUTES.map(r => r.key);
      const invalidRoutes = routeAccess.filter(r => !validRouteKeys.includes(r));
      if (invalidRoutes.length > 0) {
        throw new Error(`Invalid route access keys: ${invalidRoutes.join(', ')}`);
      }
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
      routeAccess, // NEW FIELD
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

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateUser(id, updateData) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    if (updateData.email && updateData.email !== user.email) {
      if (await this.emailExists(updateData.email, id)) {
        throw new Error('Email already exists');
      }
    }

    if (updateData.role) {
      const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
      if (!validRoles.includes(updateData.role)) {
        throw new Error('Invalid role specified. Valid roles: super_admin, admin, employee, secretariat');
      }
    }

    if (updateData.name) user.name = updateData.name;
    if (updateData.email) user.email = updateData.email;
    if (updateData.password) user.password = updateData.password;
    if (updateData.role) user.role = updateData.role;
    if (updateData.active !== undefined) user.active = updateData.active;
    
    if (updateData.systemAccess !== undefined) {
      user.systemAccess = {
        ...user.systemAccess,
        ...updateData.systemAccess
      };
    }

    // Handle routeAccess updates for employees
    if (updateData.routeAccess !== undefined) {
      if (user.role === 'employee') {
        // Validate routeAccess
        const validRouteKeys = AVAILABLE_ROUTES.map(r => r.key);
        const invalidRoutes = updateData.routeAccess.filter(r => !validRouteKeys.includes(r));
        if (invalidRoutes.length > 0) {
          throw new Error(`Invalid route access keys: ${invalidRoutes.join(', ')}`);
        }
        user.routeAccess = updateData.routeAccess;
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
        throw new Error('Cannot delete the last super admin in the system');
      }
    }

    users.splice(userIndex, 1);
    await this.saveUsers(users);

    return { message: 'User deleted successfully' };
  }

  async updateUserRole(id, role) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    if (user.role === 'super_admin' && role !== 'super_admin') {
      const superAdmins = users.filter(u => u.role === 'super_admin');
      if (superAdmins.length === 1) {
        throw new Error('Cannot change the role of the last super admin in the system');
      }
    }

    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role specified. Valid roles: super_admin, admin, employee, secretariat');
    }

    user.role = role;
    
    // Reset routeAccess when changing role
    if (role !== 'employee') {
      user.routeAccess = [];
    } else if (!user.routeAccess) {
      user.routeAccess = [];
    }
    
    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
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

  async checkUsernameAvailability(username) {
    const users = await this.loadUsers();
    return !users.some(u => u.username === username.toLowerCase());
  }

  async updateUsername(id, newUsername) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const normalizedUsername = newUsername.toLowerCase().trim();

    const usernameExists = users.some(
      u => u.username === normalizedUsername && u.id !== id
    );

    if (usernameExists) {
      throw new Error('Username already exists');
    }

    const user = users[userIndex];
    user.username = normalizedUsername;
    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateSystemAccess(id, systemAccessUpdates) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    if (!user.systemAccess) {
      user.systemAccess = {};
    }

    user.systemAccess = {
      ...user.systemAccess,
      ...systemAccessUpdates
    };

    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * NEW: Update route access for employee users
   */
  async updateRouteAccess(id, routeAccessArray) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];

    if (user.role !== 'employee') {
      throw new Error('Route access can only be assigned to employees');
    }

    // Validate routeAccess
    const validRouteKeys = AVAILABLE_ROUTES.map(r => r.key);
    const invalidRoutes = routeAccessArray.filter(r => !validRouteKeys.includes(r));
    if (invalidRoutes.length > 0) {
      throw new Error(`Invalid route access keys: ${invalidRoutes.join(', ')}`);
    }

    user.routeAccess = routeAccessArray;
    user.updatedAt = new Date().toISOString();

    users[userIndex] = user;
    await this.saveUsers(users);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * NEW: Get available routes
   */
  getAvailableRoutes() {
    return AVAILABLE_ROUTES;
  }
}

module.exports = new UserService();