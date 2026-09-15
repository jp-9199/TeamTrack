import { authorizationService } from '../authorization/authorization.service.js';
import { conversationRepository } from '../../db/repositories/conversation.repository.js';
import { fileRepository, type DbFile } from '../../db/repositories/file.repository.js';
import { FileServiceError } from './file.errors.js';

export class FileAuthorizationService {
  /**
   * Verifies that a user has active membership in an organization before creating an upload intent.
   */
  async canCreateFileInOrg(userId: string, organizationId: string): Promise<boolean> {
    const auth = await authorizationService.getOrganizationAuth(userId, organizationId);
    return auth.isMember;
  }

  /**
   * Evaluates READ authorization for a file based on its attachment context.
   *
   * SECURITY INVARIANTS:
   * 1. Cross-tenant access is strictly rejected (Anti-IDOR).
   * 2. If attached to a channel: access strictly follows channel authorization
   *    (private channels require channel membership/admin rights; uploader has NO permanent bypass).
   * 3. If attached to a conversation: access strictly follows conversation membership.
   * 4. If unattached: access is permitted ONLY to the original uploader or organization owners/admins.
   * 5. Guests can only access unattached files they uploaded themselves.
   */
  async canReadFile(file: DbFile, userId: string): Promise<boolean> {
    if (file.is_deleted) {
      return false;
    }

    // 1. Anti-IDOR: verify active membership in the file's parent organization
    const orgAuth = await authorizationService.getOrganizationAuth(userId, file.organization_id);
    if (!orgAuth.isMember) {
      return false;
    }

    // 2. Fetch all attachment contexts (messages linking to this file)
    const contexts = await fileRepository.findAttachmentContext(file.id);

    // 3. If attached to one or more messages, access MUST follow the attached resource
    if (contexts.length > 0) {
      for (const ctx of contexts) {
        if (ctx.channelId) {
          const chanAuth = await authorizationService.getChannelAuth(userId, ctx.channelId);
          if (chanAuth.canAccess) {
            return true;
          }
        } else if (ctx.conversationId) {
          const member = await conversationRepository.getMember(ctx.conversationId, userId);
          if (member !== null) {
            return true;
          }
        }
      }

      // If attached to private resources and user is not a member of any, deny access
      // Note: original uploader DOES NOT bypass private channel/conversation authorization once attached!
      return false;
    }

    // 4. If currently unattached:
    if (orgAuth.isGuest) {
      // Guests cannot access broad organization unattached files, only their own
      return file.uploader_id === userId;
    }

    // Organization members: uploader or organization owner/admin
    return file.uploader_id === userId || orgAuth.isOwner || orgAuth.isAdmin;
  }

  /**
   * Evaluates DELETE authorization.
   * Allowed for:
   * - The original uploader (if within same org)
   * - Organization owner or admin
   */
  async canDeleteFile(file: DbFile, userId: string): Promise<boolean> {
    if (file.is_deleted) {
      return false;
    }

    const orgAuth = await authorizationService.getOrganizationAuth(userId, file.organization_id);
    if (!orgAuth.isMember) {
      return false;
    }

    return file.uploader_id === userId || orgAuth.isOwner || orgAuth.isAdmin;
  }

  /**
   * Evaluates FINALIZE authorization.
   * CRITICAL: ONLY the original uploader who created the upload intent may finalize it.
   */
  canFinalizeFile(file: DbFile, userId: string): boolean {
    return file.uploader_id === userId;
  }

  /**
   * Validates a batch of attachment file IDs for a message in a given organization.
   * Throws FileServiceError on any violation.
   */
  async validateAttachmentsForContext(
    attachmentFileIds: string[],
    targetOrgId: string,
    userId: string
  ): Promise<DbFile[]> {
    if (!attachmentFileIds || attachmentFileIds.length === 0) {
      return [];
    }

    if (attachmentFileIds.length > 10) {
      throw new FileServiceError('ATTACHMENT_FORBIDDEN', 'Cannot attach more than 10 files to a message', 400);
    }

    // Deduplicate IDs safely
    const uniqueIds = Array.from(new Set(attachmentFileIds));

    // Batch load files
    const files = await fileRepository.findFilesByIds(uniqueIds);
    const fileMap = new Map(files.map((f) => [f.id, f]));

    for (const fileId of uniqueIds) {
      const file = fileMap.get(fileId);
      if (!file || file.is_deleted) {
        throw new FileServiceError('FILE_NOT_FOUND', `Attachment file not found: ${fileId}`, 404);
      }

      if (file.organization_id !== targetOrgId) {
        throw new FileServiceError('ORGANIZATION_MISMATCH', 'Attachment belongs to a different organization', 404);
      }

      if (file.status !== 'ready') {
        throw new FileServiceError('FILE_NOT_READY', `File is not ready for attachment (status: ${file.status})`, 400);
      }

      // Sender must be authorized to use this file
      const canRead = await this.canReadFile(file, userId);
      if (!canRead) {
        throw new FileServiceError('ATTACHMENT_FORBIDDEN', 'User is not authorized to attach this file', 403);
      }
    }

    return files;
  }
}

export const fileAuthorizationService = new FileAuthorizationService();
