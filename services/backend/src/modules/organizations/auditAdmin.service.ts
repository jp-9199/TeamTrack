import { auditLogRepository } from '../../db/repositories/auditLog.repository.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { ServiceError } from './organization.service.js';
import type {
  AuditLogQuery,
  AuditLogPaginatedResponse,
} from '@teamtrack/shared-types';
import { PHASE13_ERROR_CODES } from '@teamtrack/shared-types';

export class AuditAdminService {
  async getOrganizationAuditLogs(
    callerId: string,
    orgId: string,
    query: AuditLogQuery
  ): Promise<AuditLogPaginatedResponse> {
    const auth = await authorizationService.getOrganizationAuth(callerId, orgId);
    if (!auth.isMember) {
      throw new ServiceError(PHASE13_ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found', 404);
    }
    if (!auth.isAdmin) {
      throw new ServiceError(
        PHASE13_ERROR_CODES.AUDIT_ACCESS_DENIED,
        'Only organization owner or admin can access audit logs',
        403
      );
    }

    return auditLogRepository.queryAuditLogs(orgId, query);
  }
}

export const auditAdminService = new AuditAdminService();
