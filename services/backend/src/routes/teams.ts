import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { teamController } from '../modules/teams/team.controller.js';
import { channelController } from '../modules/channels/channel.controller.js';

export const teamRouter = Router();

// All team endpoints require authenticated session
teamRouter.use(requireAuth);

teamRouter.get('/:teamId', (req, res) => {
  teamController.getTeam(req, res);
});

teamRouter.post('/:teamId/join', (req, res) => {
  teamController.joinPublicTeam(req, res);
});

teamRouter.patch('/:teamId', (req, res) => {
  teamController.updateTeam(req, res);
});

teamRouter.post('/:teamId/archive', (req, res) => {
  teamController.archiveTeam(req, res);
});

// Team Members
teamRouter.get('/:teamId/members', (req, res) => {
  teamController.listTeamMembers(req, res);
});

teamRouter.post('/:teamId/members', (req, res) => {
  teamController.addTeamMember(req, res);
});

teamRouter.delete('/:teamId/members/:userId', (req, res) => {
  teamController.removeTeamMember(req, res);
});

// Nested Channels within Team
teamRouter.post('/:teamId/channels', (req, res) => {
  channelController.createChannel(req, res);
});

teamRouter.get('/:teamId/channels', (req, res) => {
  channelController.listChannels(req, res);
});
