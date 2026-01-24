// src/routes/materials.routes.js - MATERIAL REQUEST ROUTES
const express = require('express');
const router = express.Router();
const path = require('path');
const materialService = require('../services/material.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);

/**
 * 1. RESET COUNTER - Super admin only
 * POST /api/materials/reset-counter
 */
router.post('/reset-counter', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const result = await materialService.resetMaterialCounter();

    res.status(200).json({
      success: true,
      message: 'Material Request counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 2. GET MATERIAL REQUEST STATISTICS
 * GET /api/materials/stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await materialService.getMaterialStats(req.user.id, req.user.role);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 3. CREATE MATERIAL REQUEST (Auto-detect language from data)
 * POST /api/materials
 * Body: {
 *   date, section, project, requestPriority, requestReason,
 *   items: [{ description, unit, quantity, requiredDate, priority }],
 *   additionalNotes
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const materialData = {
      date: req.body.date,
      section: req.body.section,
      project: req.body.project,
      requestPriority: req.body.requestPriority,
      requestReason: req.body.requestReason,
      items: req.body.items || [],
      additionalNotes: req.body.additionalNotes
    };

    const material = await materialService.createMaterialRequest(
      materialData, 
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: `Material Request created successfully (${material.language === 'ar' ? 'Arabic' : 'English'})`,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 4. GET ALL MATERIAL REQUESTS
 * GET /api/materials
 * Query params: mrNumber, startDate, endDate, section, project, priority, status, search, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      mrNumber, 
      startDate, 
      endDate, 
      section,
      project,
      priority,
      status,
      search, 
      page, 
      limit 
    } = req.query;

    const result = await materialService.getAllMaterialRequests(
      {
        mrNumber,
        startDate,
        endDate,
        section,
        project,
        priority,
        status,
        search,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      },
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: result.materials,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 5. GET SPECIFIC MATERIAL REQUEST (By ID)
 * GET /api/materials/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const material = await materialService.getMaterialRequestById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 6. UPDATE MATERIAL REQUEST (Auto-detect language from data)
 * PUT /api/materials/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = {
      date: req.body.date,
      section: req.body.section,
      project: req.body.project,
      requestPriority: req.body.requestPriority,
      requestReason: req.body.requestReason,
      items: req.body.items,
      additionalNotes: req.body.additionalNotes,
      status: req.body.status
    };

    const material = await materialService.updateMaterialRequest(
      req.params.id, 
      updateData, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: `Material Request updated successfully (${material.language === 'ar' ? 'Arabic' : 'English'})`,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 7. DELETE MATERIAL REQUEST (Super Admin Only)
 * DELETE /api/materials/:id
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await materialService.deleteMaterialRequest(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Material Request deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 8. GENERATE MATERIAL REQUEST PDF
 * POST /api/materials/:id/generate-pdf
 */
router.post('/:id/generate-pdf', async (req, res, next) => {
  try {
    const result = await materialService.generateMaterialPDF(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    const responseData = {
      mrId: result.material.id,
      mrNumber: result.material.mrNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/materials/${req.params.id}/download-pdf`
    };

    res.status(200).json({
      success: true,
      message: `PDF generated successfully in ${result.pdf.language === 'ar' ? 'Arabic' : 'English'}`,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 9. DOWNLOAD MATERIAL REQUEST PDF
 * GET /api/materials/:id/download-pdf
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    const material = await materialService.getMaterialRequestById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    if (!material.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/materials-requests/pdfs', material.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(pdfPath, `MR_${material.mrNumber}.pdf`, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;