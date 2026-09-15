import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { pushDeviceController } from '../modules/push/push-device.controller.js';

export const devicesRouter = Router();

// All device routes require authentication
devicesRouter.use(requireAuth);

// Push device registration & management
devicesRouter.post('/push', (req, res) => {
  pushDeviceController.registerPushDevice(req, res);
});

devicesRouter.get('/push', (req, res) => {
  pushDeviceController.listPushDevices(req, res);
});

devicesRouter.delete('/push/:deviceId', (req, res) => {
  pushDeviceController.deletePushDevice(req, res);
});
