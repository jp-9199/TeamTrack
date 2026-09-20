import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { userController } from '../modules/users/user.controller.js';

export const userRouter = Router();

// All user profile and settings endpoints require authenticated session
userRouter.use(requireAuth);

// User Profile
userRouter.get('/me', (req, res) => {
  userController.getProfile(req, res);
});

userRouter.patch('/me', (req, res) => {
  userController.updateProfile(req, res);
});

// Search Workspace Users (Directory)
userRouter.get('/search', (req, res) => {
  userController.searchUsers(req, res);
});

// User Security Settings
userRouter.get('/me/security', (req, res) => {
  userController.getSecurityInfo(req, res);
});

userRouter.post('/me/password', (req, res) => {
  userController.changePassword(req, res);
});

// Session Management
userRouter.get('/me/sessions', (req, res) => {
  userController.listSessions(req, res);
});

userRouter.post('/me/sessions/:sessionId/revoke', (req, res) => {
  userController.revokeSession(req, res);
});

userRouter.post('/me/sessions/revoke-all', (req, res) => {
  userController.revokeAllSessions(req, res);
});
