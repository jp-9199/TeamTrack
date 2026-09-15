import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { organizationController } from '../modules/organizations/organization.controller.js';
import { governanceController } from '../modules/organizations/governance.controller.js';
import { auditAdminController } from '../modules/organizations/auditAdmin.controller.js';
import { teamController } from '../modules/teams/team.controller.js';
import { fileController } from '../modules/files/file.controller.js';

export const organizationRouter = Router();

// All organization endpoints require valid authenticated session
organizationRouter.use(requireAuth);

// Organization Management
organizationRouter.post('/', (req, res) => {
  organizationController.createOrganization(req, res);
});

organizationRouter.get('/', (req, res) => {
  organizationController.listUserOrganizations(req, res);
});

organizationRouter.get('/:organizationId', (req, res) => {
  organizationController.getOrganization(req, res);
});

organizationRouter.patch('/:organizationId', (req, res) => {
  organizationController.updateOrganization(req, res);
});

organizationRouter.post('/:organizationId/archive', (req, res) => {
  organizationController.archiveOrganization(req, res);
});

organizationRouter.post('/:organizationId/transfer-ownership', (req, res) => {
  organizationController.transferOwnership(req, res);
});

// Organization Members
organizationRouter.get('/:organizationId/members', (req, res) => {
  organizationController.listMembers(req, res);
});

organizationRouter.post('/:organizationId/members', (req, res) => {
  organizationController.addMember(req, res);
});

organizationRouter.patch('/:organizationId/members/:userId', (req, res) => {
  organizationController.updateMemberRole(req, res);
});

organizationRouter.delete('/:organizationId/members/:userId', (req, res) => {
  organizationController.removeMember(req, res);
});

// Nested Teams within Organization
organizationRouter.post('/:organizationId/teams', (req, res) => {
  teamController.createTeam(req, res);
});

organizationRouter.get('/:organizationId/teams', (req, res) => {
  teamController.listTeams(req, res);
});

// Organization Files
organizationRouter.post('/:organizationId/files/upload-intent', (req, res) => {
  fileController.createUploadIntent(req, res);
});

organizationRouter.get('/:organizationId/files', (req, res) => {
  fileController.listOrganizationFiles(req, res);
});

// Organization Governance Settings
organizationRouter.get('/:organizationId/governance', (req, res) => {
  governanceController.getGovernanceSettings(req, res);
});

organizationRouter.patch('/:organizationId/governance', (req, res) => {
  governanceController.updateGovernanceSettings(req, res);
});

// Organization Audit Logs
organizationRouter.get('/:organizationId/audit-logs', (req, res) => {
  auditAdminController.getOrganizationAuditLogs(req, res);
});


