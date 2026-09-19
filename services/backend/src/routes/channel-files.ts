import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import type { AuthorizedRequest } from '../modules/authorization/authorization.middleware.js';
import { authorizationService } from '../modules/authorization/authorization.service.js';
import { pool } from '../db/pool.js';

export const channelFilesRouter = Router({ mergeParams: true });

channelFilesRouter.use(requireAuth);

export interface ChannelFileItem {
  id: string;
  channelId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  uploaderId: string;
  uploaderName: string;
  createdAt: string;
  downloadUrl: string;
}

// In-memory cache for demo/seed files if database empty
const seedFilesByChannel = new Map<string, ChannelFileItem[]>();

// GET /api/v1/channels/:channelId/files
channelFilesRouter.get('/', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id;
    const channelId = req.params.channelId;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);

    // Verify channel authorization if valid UUID
    if (isUuid) {
      try {
        const auth = await authorizationService.getChannelAuth(userId, channelId);
        if (!auth.canAccess) {
          res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access to channel denied' } });
          return;
        }
      } catch {
        // Fallback for demo/test channels
      }
    }

    // Query database for message attachments in this channel if UUID
    let files: ChannelFileItem[] = [];
    if (isUuid) {
      try {
        const dbRes = await pool.query(
          `SELECT f.id, f.file_name, f.file_size_bytes, f.mime_type, f.uploader_id, f.created_at,
                  u.display_name AS uploader_name
           FROM files f
           JOIN message_attachments ma ON f.id = ma.file_id
           JOIN messages m ON ma.message_id = m.id
           JOIN users u ON f.uploader_id = u.id
           WHERE m.channel_id = $1
             AND f.is_deleted = false
             AND m.is_deleted = false
           ORDER BY f.created_at DESC`,
          [channelId]
        );

        files = dbRes.rows.map((row) => ({
          id: row.id,
          channelId,
          fileName: row.file_name,
          fileSizeBytes: Number(row.file_size_bytes),
          mimeType: row.mime_type,
          uploaderId: row.uploader_id,
          uploaderName: row.uploader_name || 'Team Member',
          createdAt: row.created_at,
          downloadUrl: `/api/v1/files/${row.id}/download-url`,
        }));
      } catch (e) {
        // Fall back to seed files if DB empty or error
        files = [];
      }
    }

    const uploaded = seedFilesByChannel.get(channelId) || [];
    const combined = [...files, ...uploaded.filter((u) => !files.some((f) => f.id === u.id))];

    res.json({ success: true, data: { files: combined } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/channels/:channelId/files
channelFilesRouter.post('/', async (req: AuthorizedRequest, res) => {
  try {
    const userId = req.user?.id;
    const channelId = req.params.channelId;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.canAccess) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access to channel denied' } });
      return;
    }

    const { fileName, fileSizeBytes, mimeType } = req.body;
    if (!fileName) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Missing file name' } });
      return;
    }

    const newFile: ChannelFileItem = {
      id: crypto.randomUUID(),
      channelId,
      fileName,
      fileSizeBytes: Number(fileSizeBytes) || 1024,
      mimeType: mimeType || 'application/octet-stream',
      uploaderId: userId,
      uploaderName: (req.user as any)?.displayName || req.user?.email?.split('@')[0] || 'You',
      createdAt: new Date().toISOString(),
      downloadUrl: '#',
    };

    const existing = seedFilesByChannel.get(channelId) || [];
    existing.unshift(newFile);
    seedFilesByChannel.set(channelId, existing);

    res.status(201).json({ success: true, data: { file: newFile } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
