import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { fileController } from '../modules/files/file.controller.js';
import { pool } from '../db/pool.js';

export const fileRouter = Router();

// All file routes require authenticated session
fileRouter.use(requireAuth);

// GET /api/v1/files - List workspace files from PostgreSQL
fileRouter.get('/', async (req, res) => {
  try {
    const dbRes = await pool.query(`
      SELECT f.id, f.file_name AS "fileName", f.file_size_bytes AS "fileSizeBytes",
             f.mime_type AS "mimeType", f.uploader_id AS "uploaderId", f.created_at AS "createdAt",
             u.display_name AS "uploaderName"
      FROM files f
      LEFT JOIN users u ON f.uploader_id = u.id
      WHERE f.is_deleted = false
      ORDER BY f.created_at DESC
      LIMIT 100
    `);

    const files = dbRes.rows.map((row: any) => ({
      id: row.id,
      fileName: row.fileName,
      fileSizeBytes: Number(row.fileSizeBytes) || 0,
      mimeType: row.mimeType || 'application/octet-stream',
      uploaderId: row.uploaderId,
      uploaderName: row.uploaderName || 'Team Member',
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      downloadUrl: `/api/v1/files/${row.id}/download-url`,
    }));

    res.json({ success: true, data: { files } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/files/upload - Register uploaded file record in PostgreSQL
fileRouter.post('/upload', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { fileName, fileSizeBytes, mimeType } = req.body;
    if (!fileName) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'File name is required' } });
      return;
    }

    const id = crypto.randomUUID();
    const orgRes = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    let targetOrgId = orgRes.rows[0]?.organization_id;

    if (!targetOrgId) {
      const anyOrg = await pool.query(`SELECT id FROM organizations LIMIT 1`);
      targetOrgId = anyOrg.rows[0]?.id;
    }

    if (!targetOrgId) {
      res.status(400).json({ success: false, error: { code: 'NO_ORG', message: 'No organization found' } });
      return;
    }

    const storageKey = `tenants/${targetOrgId}/files/${id}/${fileName}`;
    await pool.query(
      `INSERT INTO files (id, organization_id, uploader_id, file_name, file_size_bytes, mime_type, storage_key, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready', NOW(), NOW())`,
      [id, targetOrgId, userId, fileName, fileSizeBytes || 1024, mimeType || 'application/octet-stream', storageKey]
    );

    res.status(201).json({
      success: true,
      data: {
        file: {
          id,
          fileName,
          fileSizeBytes: fileSizeBytes || 1024,
          mimeType: mimeType || 'application/octet-stream',
          uploaderId: userId,
          uploaderName: (req as any).user?.displayName || 'You',
          createdAt: new Date().toISOString(),
          downloadUrl: `/api/v1/files/${id}/download-url`,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// File Lifecycle & Operations
fileRouter.post('/:fileId/finalize', (req, res) => {
  fileController.finalizeUpload(req, res);
});

fileRouter.get('/:fileId', (req, res) => {
  fileController.getFile(req, res);
});

fileRouter.get('/:fileId/download-url', (req, res) => {
  fileController.getDownloadUrl(req, res);
});

fileRouter.delete('/:fileId', (req, res) => {
  fileController.deleteFile(req, res);
});
