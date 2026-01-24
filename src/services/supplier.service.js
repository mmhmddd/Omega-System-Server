// ============================================
// src/services/supplier.service.js
// ============================================

const fs = require('fs').promises;
const path = require('path');

class SupplierService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data/suppliers');
    this.suppliersFile = path.join(this.dataDir, 'index.json');
  }

  // Initialize suppliers directory and file
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      try {
        await fs.access(this.suppliersFile);
      } catch {
        await this.atomicWrite([]);
        console.log('Suppliers file initialized');
      }
    } catch (err) {
      console.error('Failed to initialize suppliers:', err);
      throw new Error(`Failed to initialize suppliers: ${err.message}`);
    }
  }

  // Atomic write to prevent data corruption
  async atomicWrite(data) {
    const tempFile = this.suppliersFile + '.tmp';
    try {
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempFile, this.suppliersFile);
    } catch (err) {
      try {
        await fs.unlink(tempFile);
      } catch {}
      throw err;
    }
  }

  // Generate sequential ID (SUP0001, SUP0002, etc.)
  async generateId() {
    const suppliers = await this.readSuppliers();
    
    if (suppliers.length === 0) {
      return 'SUP0001';
    }

    // Extract all numeric IDs
    const numericIds = suppliers
      .map(s => {
        const match = s.id.match(/SUP(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(id => id > 0);

    // Get the maximum ID and increment
    const maxId = Math.max(...numericIds, 0);
    const newId = maxId + 1;
    
    // Format with leading zeros (SUP0001, SUP0002, etc.)
    return `SUP${String(newId).padStart(4, '0')}`;
  }

  // Read suppliers from JSON file
  async readSuppliers() {
    try {
      const data = await fs.readFile(this.suppliersFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read suppliers:', err);
      throw new Error(`Failed to read suppliers: ${err.message}`);
    }
  }

  // Write suppliers to JSON file
  async writeSuppliers(suppliers) {
    try {
      await this.atomicWrite(suppliers);
    } catch (err) {
      console.error('Failed to write suppliers:', err);
      throw new Error(`Failed to write suppliers: ${err.message}`);
    }
  }

  // Get all suppliers with optional filters
  async getAllSuppliers(filters = {}) {
    try {
      let suppliers = await this.readSuppliers();
      
      // Apply status filter
      if (filters.status) {
        suppliers = suppliers.filter(s => s.status === filters.status);
      }
      
      // Apply material type filter
      if (filters.materialType) {
        suppliers = suppliers.filter(s => 
          s.materialTypes && s.materialTypes.includes(filters.materialType)
        );
      }

      // Apply country filter
      if (filters.country) {
        suppliers = suppliers.filter(s => s.country === filters.country);
      }

      // Apply city filter
      if (filters.city) {
        suppliers = suppliers.filter(s => s.city === filters.city);
      }

      // Apply minimum rating filter
      if (filters.minRating) {
        const minRating = parseFloat(filters.minRating);
        suppliers = suppliers.filter(s => s.rating >= minRating);
      }
      
      console.log(`Retrieved ${suppliers.length} suppliers`);
      return suppliers;
    } catch (err) {
      console.error('Failed to get suppliers:', err);
      throw err;
    }
  }

  // Get supplier by ID
  async getSupplierById(id) {
    try {
      const suppliers = await this.readSuppliers();
      const supplier = suppliers.find(s => s.id === id);
      
      if (!supplier) {
        throw new Error('Supplier not found');
      }
      
      console.log(`Retrieved supplier: ${id}`);
      return supplier;
    } catch (err) {
      console.error(`Failed to get supplier ${id}:`, err);
      throw err;
    }
  }

  // Add new supplier
  async addSupplier(supplierData) {
    try {
      const suppliers = await this.readSuppliers();
      
      // Check for duplicate email
      const existingEmail = suppliers.find(s => s.email.toLowerCase() === supplierData.email.toLowerCase());
      if (existingEmail) {
        throw new Error('Supplier with this email already exists');
      }

      // Check for duplicate phone
      const existingPhone = suppliers.find(s => s.phone === supplierData.phone);
      if (existingPhone) {
        throw new Error('Supplier with this phone number already exists');
      }
      
      const newSupplier = {
        id: await this.generateId(),
        name: supplierData.name,
        companyName: supplierData.companyName || supplierData.name,
        contactPerson: supplierData.contactPerson,
        email: supplierData.email.toLowerCase(),
        phone: supplierData.phone,
        secondaryPhone: supplierData.secondaryPhone || null,
        address: supplierData.address || null,
        city: supplierData.city || null,
        country: supplierData.country || null,
        postalCode: supplierData.postalCode || null,
        website: supplierData.website || null,
        taxId: supplierData.taxId || null,
        materialTypes: Array.isArray(supplierData.materialTypes) ? supplierData.materialTypes : [],
        rating: parseFloat(supplierData.rating) || 0,
        paymentTerms: supplierData.paymentTerms || null,
        deliveryTime: supplierData.deliveryTime || null,
        minimumOrder: supplierData.minimumOrder || null,
        currency: supplierData.currency || 'EGP',
        status: supplierData.status || 'active',
        notes: supplierData.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: supplierData.createdBy || null
      };

      suppliers.push(newSupplier);
      await this.writeSuppliers(suppliers);
      
      console.log(`Supplier added: ${newSupplier.id}`);
      return newSupplier;
    } catch (err) {
      console.error('Failed to add supplier:', err);
      throw err;
    }
  }

  // Update supplier
  async updateSupplier(id, updateData) {
    try {
      const suppliers = await this.readSuppliers();
      const index = suppliers.findIndex(s => s.id === id);
      
      if (index === -1) {
        throw new Error('Supplier not found');
      }

      // Check for duplicate email if email is being updated
      if (updateData.email && updateData.email.toLowerCase() !== suppliers[index].email.toLowerCase()) {
        const existingEmail = suppliers.find(s => s.email.toLowerCase() === updateData.email.toLowerCase());
        if (existingEmail) {
          throw new Error('Supplier with this email already exists');
        }
      }

      // Check for duplicate phone if phone is being updated
      if (updateData.phone && updateData.phone !== suppliers[index].phone) {
        const existingPhone = suppliers.find(s => s.phone === updateData.phone);
        if (existingPhone) {
          throw new Error('Supplier with this phone number already exists');
        }
      }

      // Prepare update object
      const updatedFields = { ...updateData };
      
      // Normalize email if provided
      if (updatedFields.email) {
        updatedFields.email = updatedFields.email.toLowerCase();
      }

      // Parse rating if provided
      if (updatedFields.rating !== undefined) {
        updatedFields.rating = parseFloat(updatedFields.rating);
      }

      // Update supplier
      suppliers[index] = {
        ...suppliers[index],
        ...updatedFields,
        id: suppliers[index].id,
        createdAt: suppliers[index].createdAt,
        createdBy: suppliers[index].createdBy,
        updatedAt: new Date().toISOString(),
        updatedBy: updateData.updatedBy || null
      };

      await this.writeSuppliers(suppliers);
      
      console.log(`Supplier updated: ${id}`);
      return suppliers[index];
    } catch (err) {
      console.error(`Failed to update supplier ${id}:`, err);
      throw err;
    }
  }

  // Delete supplier
  async deleteSupplier(id) {
    try {
      const suppliers = await this.readSuppliers();
      const index = suppliers.findIndex(s => s.id === id);
      
      if (index === -1) {
        throw new Error('Supplier not found');
      }

      const deletedSupplier = suppliers.splice(index, 1)[0];
      await this.writeSuppliers(suppliers);
      
      console.log(`Supplier deleted: ${id}`);
      return deletedSupplier;
    } catch (err) {
      console.error(`Failed to delete supplier ${id}:`, err);
      throw err;
    }
  }

  // Search suppliers
  async searchSuppliers(query) {
    try {
      const suppliers = await this.readSuppliers();
      const lowerQuery = query.toLowerCase().trim();
      
      if (!lowerQuery) {
        return suppliers;
      }

      const results = suppliers.filter(s => 
        (s.name && s.name.toLowerCase().includes(lowerQuery)) ||
        (s.companyName && s.companyName.toLowerCase().includes(lowerQuery)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(lowerQuery)) ||
        (s.email && s.email.toLowerCase().includes(lowerQuery)) ||
        (s.phone && s.phone.includes(lowerQuery)) ||
        (s.city && s.city.toLowerCase().includes(lowerQuery)) ||
        (s.country && s.country.toLowerCase().includes(lowerQuery)) ||
        (s.materialTypes && s.materialTypes.some(m => m.toLowerCase().includes(lowerQuery))) ||
        (s.notes && s.notes.toLowerCase().includes(lowerQuery))
      );
      
      console.log(`Search found ${results.length} suppliers for query: ${query}`);
      return results;
    } catch (err) {
      console.error('Failed to search suppliers:', err);
      throw err;
    }
  }

  // Get supplier statistics
  async getStatistics() {
    try {
      const suppliers = await this.readSuppliers();
      
      const stats = {
        total: suppliers.length,
        active: suppliers.filter(s => s.status === 'active').length,
        inactive: suppliers.filter(s => s.status === 'inactive').length,
        pending: suppliers.filter(s => s.status === 'pending').length,
        byMaterial: {},
        byCountry: {},
        byCity: {},
        averageRating: 0,
        topRated: [],
        recentlyAdded: []
      };

      // Count by material type
      suppliers.forEach(s => {
        if (s.materialTypes && Array.isArray(s.materialTypes)) {
          s.materialTypes.forEach(material => {
            stats.byMaterial[material] = (stats.byMaterial[material] || 0) + 1;
          });
        }
      });

      // Count by country
      suppliers.forEach(s => {
        if (s.country) {
          stats.byCountry[s.country] = (stats.byCountry[s.country] || 0) + 1;
        }
      });

      // Count by city
      suppliers.forEach(s => {
        if (s.city) {
          stats.byCity[s.city] = (stats.byCity[s.city] || 0) + 1;
        }
      });

      // Calculate average rating
      const totalRating = suppliers.reduce((sum, s) => sum + (s.rating || 0), 0);
      stats.averageRating = suppliers.length > 0 ? parseFloat((totalRating / suppliers.length).toFixed(2)) : 0;

      // Get top rated suppliers (rating >= 4)
      stats.topRated = suppliers
        .filter(s => s.rating >= 4)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map(s => ({
          id: s.id,
          name: s.name,
          rating: s.rating
        }));

      // Get recently added suppliers (last 5)
      stats.recentlyAdded = suppliers
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(s => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt
        }));

      return stats;
    } catch (err) {
      console.error('Failed to get supplier statistics:', err);
      throw err;
    }
  }

  // Get suppliers by material type
  async getSuppliersByMaterial(materialType) {
    try {
      const suppliers = await this.readSuppliers();
      return suppliers.filter(s => 
        s.materialTypes && s.materialTypes.includes(materialType)
      );
    } catch (err) {
      console.error('Failed to get suppliers by material:', err);
      throw err;
    }
  }

  // Update supplier status
  async updateSupplierStatus(id, status) {
    try {
      const validStatuses = ['active', 'inactive', 'pending', 'suspended'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status. Must be one of: ' + validStatuses.join(', '));
      }

      return await this.updateSupplier(id, { status });
    } catch (err) {
      console.error('Failed to update supplier status:', err);
      throw err;
    }
  }

  // Bulk import suppliers
  async bulkImportSuppliers(suppliersData, createdBy = null) {
    try {
      const results = {
        success: [],
        failed: []
      };

      for (const supplierData of suppliersData) {
        try {
          const supplier = await this.addSupplier({ ...supplierData, createdBy });
          results.success.push({ id: supplier.id, name: supplier.name });
        } catch (err) {
          results.failed.push({ 
            name: supplierData.name || 'Unknown', 
            error: err.message 
          });
        }
      }

      console.log(`Bulk import completed: ${results.success.length} success, ${results.failed.length} failed`);
      return results;
    } catch (err) {
      console.error('Failed to bulk import suppliers:', err);
      throw err;
    }
  }
}

module.exports = new SupplierService();