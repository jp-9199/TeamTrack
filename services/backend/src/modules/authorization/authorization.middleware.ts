import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/requireAuth.js';
import {
  authorizationService,
  type OrgAuthResult,
  type TeamAuthResult,
  type ChannelAuthResult,
} from './authorization.service.js';

export interface AuthorizedRequest extends AuthenticatedRequest {
  orgAuth?: OrgAuthResult;
  teamAuth?: TeamAuthResult;
  channelAuth?: ChannelAuthResult;
}

/**
 * Ensures caller is an active member of the organization specified by :organizationId.
 * If not found or not a member -> HTTP 404 NOT_FOUND.
 */
export async function requireOrgMember(
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  const orgId = req.params.organizationId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  if (!orgId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'Organization ID is required' },
    });
    return;
  }

  try {
    const auth = await authorizationService.getOrganizationAuth(userId, orgId);
    if (!auth.isMember) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
      return;
    }

    req.orgAuth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Ensures caller has access to the team specified by :teamId.
 * If team does not exist, or caller is not in parent organization, or private team without membership -> HTTP 404 NOT_FOUND.
 */
export async function requireTeamAccess(
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  const teamId = req.params.teamId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  if (!teamId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'Team ID is required' },
    });
    return;
  }

  try {
    const auth = await authorizationService.getTeamAuth(userId, teamId);
    if (!auth.teamExists) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team not found' },
      });
      return;
    }

    req.teamAuth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Ensures caller has access to the channel specified by :channelId.
 * If not found, cross-tenant, or private without membership -> HTTP 404 NOT_FOUND.
 */
export async function requireChannelAccess(
  req: AuthorizedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  const channelId = req.params.channelId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  if (!channelId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'Channel ID is required' },
    });
    return;
  }

  try {
    const auth = await authorizationService.getChannelAuth(userId, channelId);
    if (!auth.channelExists || !auth.canAccess) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Channel not found' },
      });
      return;
    }

    req.channelAuth = auth;
    next();
  } catch (err) {
    next(err);
  }
}
