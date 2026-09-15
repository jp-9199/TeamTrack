import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { fileController } from '../modules/files/file.controller.js';

export const fileRouter = Router();

// All file routes require authenticated session
fileRouter.use(requireAuth);

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
