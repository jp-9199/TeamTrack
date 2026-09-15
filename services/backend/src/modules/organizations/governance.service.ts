import { governanceRepository } from '../../db/repositories/governance.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { auditLogRepository } from '../../db/repositories/auditLog.repository.js';
import { ServiceError } from './organization.service.js';
import type {
  OrganizationGovernanceSettings,
  UpdateGovernanceSettingsRequest,
} from '@teamtrack/shared-types';
import { PHASE13_ERROR_CODES } from '@teamtrack/shared-types';

export class GovernanceService {
  async getGovernanceSettings(
    callerId: string,
    orgId: string
  ): Promise<OrganizationGovernanceSettings> {
    const auth = await authorizationService.getOrganizationAuth(callerId, orgId);
    if (!auth.isMember) {
      throw new ServiceError(PHASE13_ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError(
        PHASE13_ERROR_CODES.ORGANIZATION_ACCESS_DENIED,
        'Only organization owner or admin can view governance settings',
        403
      );
    }

    const row = await governanceRepository.getSettings(orgId);
    return governanceRepository.mapSettings(row);
  }

  async getSettings(
    callerId: string,
    orgId: string
  ): Promise<OrganizationGovernanceSettings> {
    return this.getGovernanceSettings(callerId, orgId);
  }

  async updateGovernanceSettings(
    callerId: string,
    orgId: string,
    updates: UpdateGovernanceSettingsRequest
  ): Promise<OrganizationGovernanceSettings> {
    const auth = await authorizationService.getOrganizationAuth(callerId, orgId);
    if (!auth.isMember) {
      throw new ServiceError(PHASE13_ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError(
        PHASE13_ERROR_CODES.GOVERNANCE_UPDATE_FORBIDDEN,
        'Only organization owner or admin can modify governance settings',
        403
      );
    }

    const updated = await governanceRepository.updateSettings(orgId, updates);

    await auditLogRepository.logAudit({
      organizationId: orgId,
      actorId: callerId,
      action: 'GOVERNANCE_SETTINGS_UPDATED',
      entityType: 'organization_governance_settings',
      entityId: orgId,
      metadata: { updates },
    });

    return governanceRepository.mapSettings(updated);
  }
}

export const governanceService = new GovernanceService();
