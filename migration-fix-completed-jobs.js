// migration-fix-completed-jobs.js
// Run this once to fix existing jobs with 100% progress that aren't marked as completed

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const CUTTING_JOBS_FILE = path.join(__dirname, '../../data/cutting-jobs/index.json');
const CUTTING_JOBS_DIR = path.join(__dirname, '../../data/cutting-jobs');

const STATUS_FOLDERS = {
  معلق: 'pending',
  'قيد التنفيذ': 'in-progress',
  مكتمل: 'completed',
  جزئي: 'partial'
};

async function moveFileToStatusFolder(fileName, oldStatus, newStatus) {
  try {
    const oldFolder = STATUS_FOLDERS[oldStatus];
    const newFolder = STATUS_FOLDERS[newStatus];

    const oldPath = path.join(CUTTING_JOBS_DIR, oldFolder, fileName);
    const newPath = path.join(CUTTING_JOBS_DIR, newFolder, fileName);

    if (fsSync.existsSync(oldPath)) {
      await fs.rename(oldPath, newPath);
      console.log(`✅ Moved file ${fileName} from ${oldFolder} to ${newFolder}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error moving file ${fileName}:`, error.message);
    return false;
  }
}

async function fixCompletedJobs() {
  try {
    console.log('🔍 Starting migration to fix completed jobs...\n');

    // Read existing jobs
    if (!fsSync.existsSync(CUTTING_JOBS_FILE)) {
      console.log('❌ No cutting jobs file found.');
      return;
    }

    const data = await fs.readFile(CUTTING_JOBS_FILE, 'utf8');
    const jobs = JSON.parse(data);

    let fixedCount = 0;
    let alreadyCorrect = 0;
    let needsFixing = [];

    // Check each job
    for (const job of jobs) {
      const currentlyCut = Number(job.currentlyCut) || 0;
      const quantity = Number(job.quantity) || 0;

      // Check if job is 100% complete
      if (quantity > 0 && currentlyCut === quantity) {
        if (job.fileStatus !== 'مكتمل') {
          needsFixing.push(job);
          console.log(`📋 Job ${job.id}: ${currentlyCut}/${quantity} (100%) - Status: ${job.fileStatus} → Should be: مكتمل`);
        } else {
          alreadyCorrect++;
        }
      }
    }

    if (needsFixing.length === 0) {
      console.log(`\n✅ All jobs are correct! ${alreadyCorrect} jobs already marked as completed.`);
      return;
    }

    console.log(`\n📊 Found ${needsFixing.length} jobs that need fixing.`);
    console.log(`\n🔧 Fixing jobs...\n`);

    // Fix each job
    for (const job of needsFixing) {
      const oldStatus = job.fileStatus;
      
      // Update status
      job.fileStatus = 'مكتمل';
      
      // Move file if exists
      if (job.fileName) {
        const moved = await moveFileToStatusFolder(job.fileName, oldStatus, 'مكتمل');
        if (moved) {
          job.filePath = `data/cutting-jobs/${STATUS_FOLDERS['مكتمل']}/${job.fileName}`;
        }
      }

      // Add update history entry
      if (!job.updateHistory) {
        job.updateHistory = [];
      }

      job.updateHistory.push({
        updatedBy: 'SYSTEM_MIGRATION',
        timestamp: new Date().toISOString(),
        changes: {
          action: 'updated',
          actionType: 'status_changed',
          modifications: [{
            field: 'fileStatus',
            oldValue: oldStatus,
            newValue: 'مكتمل',
            reason: 'Migration: Auto-completed (100% progress reached)'
          }],
          detailedDescriptions: [{
            field: 'fileStatus',
            description: `Changed status from "${oldStatus}" to "مكتمل"`,
            descriptionAr: `تم تغيير الحالة من "${oldStatus}" إلى "مكتمل"`,
            oldValue: oldStatus,
            newValue: 'مكتمل',
            reason: 'Migration: Auto-completed (100% progress reached)'
          }],
          summary: {
            en: `Status: ${oldStatus} → مكتمل (Migration fix)`,
            ar: `الحالة: ${oldStatus} ← مكتمل (إصلاح تلقائي)`
          }
        }
      });

      job.updatedAt = new Date().toISOString();
      
      fixedCount++;
      console.log(`✅ Fixed job ${job.id}: ${oldStatus} → مكتمل`);
    }

    // Save updated jobs
    await fs.writeFile(CUTTING_JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');

    console.log(`\n✅ Migration complete!`);
    console.log(`   - Fixed: ${fixedCount} jobs`);
    console.log(`   - Already correct: ${alreadyCorrect} jobs`);
    console.log(`   - Total jobs: ${jobs.length}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
fixCompletedJobs()
  .then(() => {
    console.log('🎉 Migration script finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });