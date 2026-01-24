// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// Import routes
const routes = require('./src/routes');
const errorMiddleware = require('./src/middleware/error.middleware');

// Create required directories
const directories = [
  'data',
  'data/users',
  'data/files',
  'data/files/physical',
  'data/receipts',
  'data/rfqs',
  'data/materials-requests',
  'data/purchases',
  'data/secretariat-forms',
  'data/cutting-jobs',
  'data/settings',
  'logs',
  'data/quotations',
  'data/quotations/pdfs',
];

console.log('\n🚀 Initializing Laser Backend System...\n');

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Create users.json with default admin if it doesn't exist
const usersFile = path.join(__dirname, 'data/users/users.json');
if (!fs.existsSync(usersFile)) {
  const defaultUsers = [
    {
      id: "USER-0001",
      username: "admin.super",
      name: "Super Admin",
      email: "admin@laser.com",
      password: "admin123",
      role: "super_admin",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
  console.log('✅ Created users.json with default super admin');
  console.log('📧 Default Login - Email: admin@laser.com | Password: admin123');
}

// Create empty data files if they don't exist
const dataFiles = [
  { path: 'data/employees.json', content: [] },
  { path: 'data/files/index.json', content: [] },
  { path: 'data/quotations/index.json', content: [] },
  { path: 'data/receipts/index.json', content: [] },
  { path: 'data/rfqs/index.json', content: [] },
  { path: 'data/materials-requests/index.json', content: [] },
  { path: 'data/purchases/index.json', content: [] },
  { path: 'data/secretariat-forms/index.json', content: [] },
  { path: 'data/cutting-jobs/index.json', content: [] },
  {
    path: 'data/settings/config.json',
    content: {
      materials: ['Stainless Steel', 'Aluminum', 'Mild Steel', 'Copper', 'Brass'],
      machines: ['Laser Cutter 1', 'Laser Cutter 2', 'CNC Machine 1', 'CNC Machine 2'],
      leaveTypes: ['Annual Leave', 'Sick Leave', 'Emergency Leave', 'Unpaid Leave'],
      departments: ['Production', 'Quality Control', 'Maintenance', 'Administration', 'Sales']
    }
  }
];

dataFiles.forEach(file => {
  const filePath = path.join(__dirname, file.path);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(file.content, null, 2));
    console.log(`✅ Created: ${file.path}`);
  }
});

// Create log files
const logFiles = ['logs/app.log', 'logs/error.log'];
logFiles.forEach(logFile => {
  const logPath = path.join(__dirname, logFile);
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
    console.log(`✅ Created: ${logFile}`);
  }
});

console.log('\n✨ System initialization completed!\n');

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (uploaded files)
app.use('/uploads', express.static(path.join(__dirname, 'data/files/physical')));

// Logging middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Laser Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler (must be last)
app.use(errorMiddleware);

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}/api`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  console.log('='.repeat(60));
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n📝 Default Super Admin Credentials:');
    console.log('   Email: admin@laser.com');
    console.log('   Password: admin123');
    console.log('\n⚠️  Please change the default password after first login!');
  }
  console.log('\n✅ Server is ready to accept requests\n');
});

// Graceful shutdown handlers
process.on('unhandledRejection', (err) => {
  console.error('\n❌ Unhandled Promise Rejection:', err);
  console.log('⚠️  Server shutting down...\n');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught Exception:', err);
  console.log('⚠️  Server shutting down...\n');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;