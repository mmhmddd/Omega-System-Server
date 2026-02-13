// ============================================
// src/services/Items.service.js - COMPLETE WITH EXCEL EXPORT
// ============================================

const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

class ItemsService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data/items');
    this.itemsFile = path.join(this.dataDir, 'index.json');
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      try {
        await fs.access(this.itemsFile);
      } catch {
        await this.atomicWrite([]);
        console.log('Items file initialized');
      }
    } catch (err) {
      console.error('Failed to initialize items:', err);
      throw new Error(`Failed to initialize items: ${err.message}`);
    }
  }

  // ============================================
  // FILE OPERATIONS
  // ============================================

  async atomicWrite(data) {
    const tempFile = this.itemsFile + '.tmp';
    try {
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempFile, this.itemsFile);
    } catch (err) {
      try {
        await fs.unlink(tempFile);
      } catch {}
      throw err;
    }
  }

  async readItems() {
    try {
      const data = await fs.readFile(this.itemsFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to read items:', err);
      throw new Error(`Failed to read items: ${err.message}`);
    }
  }

  async writeItems(items) {
    try {
      await this.atomicWrite(items);
    } catch (err) {
      console.error('Failed to write items:', err);
      throw new Error(`Failed to write items: ${err.message}`);
    }
  }

  // ============================================
  // ID GENERATION
  // ============================================

  async generateId() {
    const items = await this.readItems();
    
    if (items.length === 0) {
      return 'ITEM0001';
    }

    const numericIds = items
      .map(i => {
        const match = i.id.match(/ITEM(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(id => id > 0);

    const maxId = Math.max(...numericIds, 0);
    const newId = maxId + 1;
    
    return `ITEM${String(newId).padStart(4, '0')}`;
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  async createItem(itemData, userId = null) {
    try {
      const items = await this.readItems();
      
      // Check for duplicate name
      const existingItem = items.find(
        i => i.name.toLowerCase().trim() === itemData.name.toLowerCase().trim()
      );
      
      if (existingItem) {
        throw new Error('Item with this name already exists');
      }

      const newItem = {
        id: await this.generateId(),
        name: itemData.name.trim(),
        description: itemData.description?.trim() || null,
        unit: itemData.unit?.trim() || null,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      items.push(newItem);
      await this.writeItems(items);
      
      console.log(`Item created: ${newItem.id}`);
      return newItem;
    } catch (err) {
      console.error('Failed to create item:', err);
      throw err;
    }
  }

  async getAllItems(filters = {}) {
    try {
      let items = await this.readItems();
      
      // Apply search filter
      if (filters.search && filters.search.trim() !== '') {
        const searchLower = filters.search.toLowerCase().trim();
        items = items.filter(item =>
          item.name.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower)) ||
          (item.unit && item.unit.toLowerCase().includes(searchLower)) ||
          item.id.toLowerCase().includes(searchLower)
        );
      }

      // Calculate pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const totalItems = items.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      const paginatedItems = items.slice(startIndex, endIndex);

      return {
        items: paginatedItems,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          limit
        }
      };
    } catch (err) {
      console.error('Failed to get items:', err);
      throw err;
    }
  }

  async getAllItemsSimple() {
    try {
      const items = await this.readItems();
      return items.map(item => ({
        id: item.id,
        name: item.name,
        unit: item.unit
      }));
    } catch (err) {
      console.error('Failed to get simple items:', err);
      throw err;
    }
  }

  async getItemById(id) {
    try {
      const items = await this.readItems();
      const item = items.find(i => i.id === id);
      
      if (!item) {
        throw new Error('Item not found');
      }
      
      console.log(`Retrieved item: ${id}`);
      return item;
    } catch (err) {
      console.error(`Failed to get item ${id}:`, err);
      throw err;
    }
  }

  async updateItem(id, updateData, userId = null) {
    try {
      const items = await this.readItems();
      const index = items.findIndex(i => i.id === id);
      
      if (index === -1) {
        throw new Error('Item not found');
      }

      // Check for duplicate name if name is being updated
      if (updateData.name && updateData.name.toLowerCase().trim() !== items[index].name.toLowerCase().trim()) {
        const existingItem = items.find(
          i => i.name.toLowerCase().trim() === updateData.name.toLowerCase().trim()
        );
        
        if (existingItem) {
          throw new Error('Item with this name already exists');
        }
      }

      // Update item
      const updatedFields = {};
      if (updateData.name !== undefined) updatedFields.name = updateData.name.trim();
      if (updateData.description !== undefined) updatedFields.description = updateData.description?.trim() || null;
      if (updateData.unit !== undefined) updatedFields.unit = updateData.unit?.trim() || null;

      items[index] = {
        ...items[index],
        ...updatedFields,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
      };

      await this.writeItems(items);
      
      console.log(`Item updated: ${id}`);
      return items[index];
    } catch (err) {
      console.error(`Failed to update item ${id}:`, err);
      throw err;
    }
  }

  async deleteItem(id) {
    try {
      const items = await this.readItems();
      const index = items.findIndex(i => i.id === id);
      
      if (index === -1) {
        throw new Error('Item not found');
      }

      const deletedItem = items.splice(index, 1)[0];
      await this.writeItems(items);
      
      console.log(`Item deleted: ${id}`);
      return {
        message: 'تم حذف الصنف بنجاح',
        item: deletedItem
      };
    } catch (err) {
      console.error(`Failed to delete item ${id}:`, err);
      throw err;
    }
  }

  // ============================================
  // EXCEL EXPORT
  // ============================================

  /**
   * Export items to Excel file
   * @param {Object} filters - Filter options (search)
   * @returns {Promise<Buffer>} Excel file buffer
   */
  async exportItemsToExcel(filters = {}) {
    try {
      // Get all items (apply search filter if provided)
      let items = await this.readItems();
      
      // Apply search filter if provided
      if (filters.search && filters.search.trim() !== '') {
        const searchLower = filters.search.toLowerCase().trim();
        items = items.filter(item =>
          item.name.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower)) ||
          (item.unit && item.unit.toLowerCase().includes(searchLower)) ||
          item.id.toLowerCase().includes(searchLower)
        );
      }

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('الأصناف');

      // Set RTL (Right-to-Left) for Arabic
      worksheet.views = [{ rightToLeft: true }];

      // Define columns
      worksheet.columns = [
        { header: 'رقم الصنف', key: 'id', width: 15 },
        { header: 'الاسم', key: 'name', width: 30 },
        { header: 'الوصف', key: 'description', width: 40 },
        { header: 'الوحدة', key: 'unit', width: 15 },
        { header: 'تاريخ الإنشاء', key: 'createdAt', width: 20 },
        { header: 'تاريخ التحديث', key: 'updatedAt', width: 20 },
        { header: 'أنشئ بواسطة', key: 'createdBy', width: 20 }
      ];

      // ============================================
      // STYLE HEADER ROW
      // ============================================
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12, name: 'Arial' };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1565C0' } // Blue background
      };
      headerRow.font = { 
        ...headerRow.font, 
        color: { argb: 'FFFFFFFF' } // White text
      };
      headerRow.alignment = { 
        vertical: 'middle', 
        horizontal: 'center' 
      };
      headerRow.height = 25;

      // ============================================
      // ADD DATA ROWS
      // ============================================
      items.forEach(item => {
        const row = worksheet.addRow({
          id: item.id || '',
          name: item.name || '',
          description: item.description || '-',
          unit: item.unit || '-',
          createdAt: item.createdAt 
            ? new Date(item.createdAt).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '',
          updatedAt: item.updatedAt 
            ? new Date(item.updatedAt).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '',
          createdBy: item.createdBy || ''
        });

        // Style data rows
        row.font = { name: 'Arial', size: 11 };
        row.alignment = { 
          vertical: 'middle', 
          horizontal: 'center', 
          wrapText: true 
        };

        // Highlight the name column (make it bold)
        const nameCell = row.getCell('name');
        nameCell.font = { 
          ...nameCell.font, 
          bold: true,
          color: { argb: 'FF1565C0' }
        };
      });

      // ============================================
      // ADD BORDERS TO ALL CELLS
      // ============================================
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });
      });

      // ============================================
      // FREEZE HEADER ROW
      // ============================================
      worksheet.views = [
        { 
          rightToLeft: true,
          state: 'frozen',
          ySplit: 1 // Freeze first row
        }
      ];

      // ============================================
      // ADD STATISTICS SHEET
      // ============================================
      const statsSheet = workbook.addWorksheet('الإحصائيات');
      statsSheet.views = [{ rightToLeft: true }];

      // Calculate statistics
      const stats = {
        total: items.length,
        withDescription: items.filter(i => i.description && i.description.trim() !== '').length,
        withUnit: items.filter(i => i.unit && i.unit.trim() !== '').length,
        recentlyAdded: items
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5)
      };

      // Add statistics header
      statsSheet.getCell('A1').value = 'إحصائيات الأصناف';
      statsSheet.getCell('A1').font = { bold: true, size: 16, name: 'Arial' };
      statsSheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1565C0' }
      };
      statsSheet.getCell('A1').font = { 
        ...statsSheet.getCell('A1').font, 
        color: { argb: 'FFFFFFFF' } 
      };
      statsSheet.mergeCells('A1:B1');

      // Add statistics data
      const statsData = [
        ['', ''],
        ['إجمالي الأصناف', stats.total],
        ['الأصناف مع وصف', stats.withDescription],
        ['الأصناف مع وحدة', stats.withUnit],
        ['', ''],
        ['الأصناف المضافة مؤخراً', '']
      ];

      statsData.forEach((rowData, index) => {
        const row = statsSheet.addRow(rowData);
        if (index > 0 && index < 5 && rowData[0]) {
          row.getCell(1).font = { bold: true, size: 12, name: 'Arial' };
          row.getCell(2).font = { 
            bold: true, 
            size: 12, 
            name: 'Arial', 
            color: { argb: 'FF1565C0' } 
          };
        }
      });

      // Add recently added items
      stats.recentlyAdded.forEach((item, index) => {
        const row = statsSheet.addRow([
          item.name,
          new Date(item.createdAt).toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        ]);
        row.font = { size: 11, name: 'Arial' };
      });

      // Set column widths for stats sheet
      statsSheet.getColumn(1).width = 30;
      statsSheet.getColumn(2).width = 20;

      // ============================================
      // ADD EXPORT INFO SHEET
      // ============================================
      const infoSheet = workbook.addWorksheet('معلومات التصدير');
      infoSheet.views = [{ rightToLeft: true }];

      // Add export metadata
      const now = new Date();
      const exportInfo = [
        ['معلومات التصدير', ''],
        ['', ''],
        ['تاريخ التصدير', now.toLocaleDateString('ar-EG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })],
        ['عدد الأصناف المصدرة', items.length],
        ['فلتر البحث', filters.search || 'لا يوجد'],
        ['', ''],
        ['ملاحظات', ''],
        ['- هذا الملف تم إنشاؤه تلقائياً من نظام إدارة المخزون', ''],
        ['- جميع البيانات محدثة حتى تاريخ التصدير', ''],
        ['- للاستفسارات، يرجى التواصل مع مسؤول النظام', '']
      ];

      // Style info sheet header
      infoSheet.getCell('A1').value = 'معلومات التصدير';
      infoSheet.getCell('A1').font = { bold: true, size: 16, name: 'Arial' };
      infoSheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1565C0' }
      };
      infoSheet.getCell('A1').font = { 
        ...infoSheet.getCell('A1').font, 
        color: { argb: 'FFFFFFFF' } 
      };
      infoSheet.mergeCells('A1:B1');

      exportInfo.forEach((rowData, index) => {
        if (index === 0) return; // Skip first row (already added as header)
        
        const row = infoSheet.addRow(rowData);
        
        if (index === 2 || index === 3 || index === 4) {
          // Data rows
          row.getCell(1).font = { bold: true, size: 12, name: 'Arial' };
          row.getCell(2).font = { size: 12, name: 'Arial' };
        } else if (index >= 7) {
          // Notes rows
          row.getCell(1).font = { size: 11, name: 'Arial', italic: true };
        }
      });

      infoSheet.getColumn(1).width = 40;
      infoSheet.getColumn(2).width = 30;

      // ============================================
      // GENERATE BUFFER
      // ============================================
      const buffer = await workbook.xlsx.writeBuffer();
      
      console.log(`Excel export generated: ${items.length} items`);
      return buffer;

    } catch (error) {
      console.error('Error generating Excel export:', error);
      throw new Error(`Failed to generate Excel export: ${error.message}`);
    }
  }
}

module.exports = new ItemsService();