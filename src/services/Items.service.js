// src/services/Items.service.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');

const ITEMS_FILE = path.join(__dirname, '../../data/items/index.json');
const ITEMS_DIR = path.join(__dirname, '../../data/items');

class ItemsService {
  async initialize() {
    try {
      if (!fsSync.existsSync(ITEMS_DIR)) {
        await fs.mkdir(ITEMS_DIR, { recursive: true });
      }

      if (!fsSync.existsSync(ITEMS_FILE)) {
        await atomicWrite.writeFile(ITEMS_FILE, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error initializing items:', error);
      throw error;
    }
  }

  async loadItems() {
    try {
      await this.initialize();
      const data = await fs.readFile(ITEMS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading items:', error);
      return [];
    }
  }

  async saveItems(items) {
    await atomicWrite.writeFile(ITEMS_FILE, JSON.stringify(items, null, 2));
  }

  async generateItemId() {
    const items = await this.loadItems();
    
    if (items.length === 0) return 'IT0001';

    const numbers = items.map(item => {
      const match = item.id.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    });

    const maxNumber = Math.max(...numbers);
    return `IT${(maxNumber + 1).toString().padStart(4, '0')}`;
  }

  async createItem(itemData, createdBy) {
    const items = await this.loadItems();

    // Validate required fields
    if (!itemData.name || itemData.name.trim().length === 0) {
      throw new Error('اسم الصنف مطلوب');
    }

    // Check if item with same name already exists
    const existingItem = items.find(
      item => item.name.toLowerCase() === itemData.name.toLowerCase()
    );

    if (existingItem) {
      throw new Error('يوجد صنف بنفس الاسم بالفعل');
    }

    const itemId = await this.generateItemId();

    const newItem = {
      id: itemId,
      name: itemData.name.trim(),
      description: itemData.description ? itemData.description.trim() : null,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(newItem);
    await this.saveItems(items);

    return newItem;
  }

  async getAllItems(filters = {}) {
    let items = await this.loadItems();

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        (item.description && item.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort by creation date (newest first)
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedItems = items.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(items.length / limit),
        totalItems: items.length,
        limit
      }
    };
  }

  async getItemById(id) {
    const items = await this.loadItems();
    const item = items.find(i => i.id === id);

    if (!item) {
      throw new Error('الصنف غير موجود');
    }

    return item;
  }

  async updateItem(id, updateData, updatedBy) {
    const items = await this.loadItems();
    const itemIndex = items.findIndex(i => i.id === id);

    if (itemIndex === -1) {
      throw new Error('الصنف غير موجود');
    }

    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new Error('اسم الصنف مطلوب');
      }

      // Check if another item with same name exists
      const existingItem = items.find(
        item => item.id !== id && item.name.toLowerCase() === updateData.name.toLowerCase()
      );

      if (existingItem) {
        throw new Error('يوجد صنف آخر بنفس الاسم');
      }
    }

    // Update fields
    if (updateData.name !== undefined) {
      items[itemIndex].name = updateData.name.trim();
    }

    if (updateData.description !== undefined) {
      items[itemIndex].description = updateData.description ? updateData.description.trim() : null;
    }

    items[itemIndex].updatedBy = updatedBy;
    items[itemIndex].updatedAt = new Date().toISOString();

    await this.saveItems(items);

    return items[itemIndex];
  }

  async deleteItem(id) {
    const items = await this.loadItems();
    const itemIndex = items.findIndex(i => i.id === id);

    if (itemIndex === -1) {
      throw new Error('الصنف غير موجود');
    }

    const deletedItem = items[itemIndex];
    items.splice(itemIndex, 1);
    await this.saveItems(items);

    return { message: 'تم حذف الصنف بنجاح', item: deletedItem };
  }

  async getAllItemsSimple() {
    const items = await this.loadItems();
    return items.map(item => ({
      id: item.id,
      name: item.name
    }));
  }
}

module.exports = new ItemsService();