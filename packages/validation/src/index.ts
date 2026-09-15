import type {
  ApiError,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  AddOrganizationMemberRequest,
  UpdateOrganizationMemberRoleRequest,
  CreateTeamRequest,
  UpdateTeamRequest,
  AddTeamMemberRequest,
  CreateChannelRequest,
  UpdateChannelRequest,
  AddChannelMemberRequest,
  OrganizationRole,
  TeamRole,
  SendMessageRequest,
  EditMessageRequest,
  AddReactionRequest,
  CreateConversationRequest,
  MarkReadRequest,
  ConversationType,
  CreateMeetingRequest,
  UpdateMediaStateRequest,
  TransferHostRequest,
  WebRtcSignalPayload,
  WebRtcSignalType,
  MeetingReactionPayload,
  FileUploadIntentRequest,
  NotificationType,
  NotificationResourceType,
  UpdateNotificationPreferencesRequest,
  UpdateNotificationTypePreferenceRequest,
  MuteChannelRequest,
  PushPlatform,
  PushProvider,
  RegisterPushDeviceRequest,
  PushDeliveryStatus,
  EmailDeliveryStatus,
  SearchCategoryFilter,
  SearchRequestQuery,
  SearchCursorData,
  CalendarEventVisibility,
  CalendarEventStatus,
  CalendarAttendeeResponseStatus,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventQuery,
  CalendarRespondRequest,
  AddCalendarAttendeeRequest,
  CalendarAvailabilityRequest,
  UpdateUserProfileRequest,
  ChangePasswordRequest,
  UpdateGovernanceSettingsRequest,
  UpdateOrganizationMemberRequest,
  AuditLogQuery,
  DefaultNotificationBehavior,
  OrganizationMemberStatus,
} from '@teamtrack/shared-types';
import { MAX_GENERAL_FILE_SIZE_BYTES, PHASE9E_ERROR_CODES, PHASE10_ERROR_CODES, PHASE13_ERROR_CODES } from '@teamtrack/shared-types';

export interface ValidationSuccess<T> {
  isValid: true;
  data: T;
  errors?: never;
}

export interface ValidationFailure {
  isValid: false;
  data?: never;
  errors: ApiError[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function createValidationError(field: string, message: string): ApiError {
  return {
    code: 'VALIDATION_ERROR',
    message,
    details: { field },
  };
}

// ============================================================================
// Email Normalization & Validation
// ============================================================================

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateEmail(email: unknown): ValidationResult<string> {
  if (typeof email !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('email', 'Email must be a string')],
    };
  }

  const normalized = normalizeEmail(email);

  if (normalized.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('email', 'Email is required')],
    };
  }

  if (normalized.length > 255) {
    return {
      isValid: false,
      errors: [createValidationError('email', 'Email must not exceed 255 characters')],
    };
  }

  if (!EMAIL_REGEX.test(normalized)) {
    return {
      isValid: false,
      errors: [createValidationError('email', 'Invalid email address format')],
    };
  }

  return { isValid: true, data: normalized };
}

// ============================================================================
// Password Validation
// ============================================================================

export function validatePassword(password: unknown): ValidationResult<string> {
  if (typeof password !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('password', 'Password must be a string')],
    };
  }

  const errors: ApiError[] = [];

  if (password.length < 8) {
    errors.push(createValidationError('password', 'Password must be at least 8 characters long'));
  }

  if (password.length > 128) {
    errors.push(createValidationError('password', 'Password must not exceed 128 characters'));
  }

  if (!/[a-z]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one lowercase letter'));
  }

  if (!/[A-Z]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one uppercase letter'));
  }

  if (!/[0-9]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one number'));
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one special character/symbol'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: password };
}

// ============================================================================
// Display Name & Full Name Validation
// ============================================================================

export function validateDisplayName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('displayName', 'Display name must be a string')],
    };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return {
      isValid: false,
      errors: [createValidationError('displayName', 'Display name must be at least 2 characters long')],
    };
  }

  if (trimmed.length > 100) {
    return {
      isValid: false,
      errors: [createValidationError('displayName', 'Display name must not exceed 100 characters')],
    };
  }

  return { isValid: true, data: trimmed };
}

// ============================================================================
// Request Body Validators
// ============================================================================

import type { RegisterRequest, LoginRequest, RefreshRequest, DeviceRegistrationInput } from '@teamtrack/shared-types';

export function validateRegisterRequest(body: unknown): ValidationResult<RegisterRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const emailRes = validateEmail(payload.email);
  if (!emailRes.isValid) errors.push(...emailRes.errors);

  const passwordRes = validatePassword(payload.password);
  if (!passwordRes.isValid) errors.push(...passwordRes.errors);

  const displayNameRes = validateDisplayName(payload.displayName);
  if (!displayNameRes.isValid) errors.push(...displayNameRes.errors);

  let fullName: string | undefined = undefined;
  if (payload.fullName !== undefined && payload.fullName !== null) {
    if (typeof payload.fullName !== 'string') {
      errors.push(createValidationError('fullName', 'Full name must be a string'));
    } else {
      fullName = payload.fullName.trim();
      if (fullName.length > 150) {
        errors.push(createValidationError('fullName', 'Full name must not exceed 150 characters'));
      }
    }
  }

  let device: DeviceRegistrationInput | undefined = undefined;
  if (payload.device !== undefined && payload.device !== null) {
    if (typeof payload.device !== 'object') {
      errors.push(createValidationError('device', 'Device must be an object'));
    } else {
      const dev = payload.device as Record<string, unknown>;
      const validPlatforms = ['ios', 'android', 'windows', 'macos', 'linux', 'web'];
      if (!validPlatforms.includes(dev.platform as string)) {
        errors.push(createValidationError('device.platform', `Platform must be one of: ${validPlatforms.join(', ')}`));
      } else {
        device = {
          platform: dev.platform as DeviceRegistrationInput['platform'],
          deviceToken: typeof dev.deviceToken === 'string' ? dev.deviceToken : undefined,
          deviceModel: typeof dev.deviceModel === 'string' ? dev.deviceModel : undefined,
          appVersion: typeof dev.appVersion === 'string' ? dev.appVersion : undefined,
        };
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      email: emailRes.data!,
      password: passwordRes.data!,
      displayName: displayNameRes.data!,
      fullName: fullName || undefined,
      device,
    },
  };
}

export function validateLoginRequest(body: unknown): ValidationResult<LoginRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const emailRes = validateEmail(payload.email);
  if (!emailRes.isValid) errors.push(...emailRes.errors);

  if (typeof payload.password !== 'string' || payload.password.length === 0) {
    errors.push(createValidationError('password', 'Password is required'));
  }

  let device: DeviceRegistrationInput | undefined = undefined;
  if (payload.device !== undefined && payload.device !== null) {
    if (typeof payload.device === 'object') {
      const dev = payload.device as Record<string, unknown>;
      const validPlatforms = ['ios', 'android', 'windows', 'macos', 'linux', 'web'];
      if (validPlatforms.includes(dev.platform as string)) {
        device = {
          platform: dev.platform as DeviceRegistrationInput['platform'],
          deviceToken: typeof dev.deviceToken === 'string' ? dev.deviceToken : undefined,
          deviceModel: typeof dev.deviceModel === 'string' ? dev.deviceModel : undefined,
          appVersion: typeof dev.appVersion === 'string' ? dev.appVersion : undefined,
        };
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      email: emailRes.data!,
      password: payload.password as string,
      device,
    },
  };
}

export function validateRefreshRequest(body: unknown): ValidationResult<RefreshRequest> {
  if (!body || typeof body !== 'object') {
    return { isValid: true, data: {} };
  }

  const payload = body as Record<string, unknown>;
  let refreshToken: string | undefined = undefined;

  if (payload.refreshToken !== undefined && payload.refreshToken !== null) {
    if (typeof payload.refreshToken !== 'string') {
      return {
        isValid: false,
        errors: [createValidationError('refreshToken', 'Refresh token must be a string')],
      };
    }
    refreshToken = payload.refreshToken.trim();
  }

  return { isValid: true, data: { refreshToken } };
}

// ============================================================================
// Phase 5: Organization, Team, Channel & Authorization Validation
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export function validateUUID(id: unknown, fieldName = 'id'): ValidationResult<string> {
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return {
      isValid: false,
      errors: [createValidationError(fieldName, `${fieldName} must be a valid UUID`)],
    };
  }
  return { isValid: true, data: id.toLowerCase() };
}

export function validateOrganizationName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Organization name must be a string')],
    };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 150) {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Organization name must be between 1 and 150 characters')],
    };
  }
  return { isValid: true, data: trimmed };
}

export function validateSlug(slug: unknown): ValidationResult<string> {
  if (typeof slug !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('slug', 'Slug must be a string')],
    };
  }
  const trimmed = slug.trim().toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 80 || !SLUG_REGEX.test(trimmed)) {
    return {
      isValid: false,
      errors: [createValidationError('slug', 'Slug must be 2 to 80 lowercase alphanumeric characters and hyphens')],
    };
  }
  return { isValid: true, data: trimmed };
}

export function validateTeamName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Team name must be a string')],
    };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Team name must be between 1 and 100 characters')],
    };
  }
  return { isValid: true, data: trimmed };
}

export function validateChannelName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Channel name must be a string')],
    };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80 || !CHANNEL_NAME_REGEX.test(trimmed)) {
    return {
      isValid: false,
      errors: [createValidationError('name', 'Channel name must be 1 to 80 alphanumeric characters, hyphens, or underscores without spaces')],
    };
  }
  return { isValid: true, data: trimmed };
}

export function validateOrganizationRole(role: unknown): ValidationResult<OrganizationRole> {
  const allowed: OrganizationRole[] = ['owner', 'admin', 'member', 'guest'];
  if (typeof role !== 'string' || !allowed.includes(role as OrganizationRole)) {
    return {
      isValid: false,
      errors: [createValidationError('role', 'Role must be one of: owner, admin, member, guest')],
    };
  }
  return { isValid: true, data: role as OrganizationRole };
}

export function validateTeamRole(role: unknown): ValidationResult<TeamRole> {
  const allowed: TeamRole[] = ['lead', 'member'];
  if (typeof role !== 'string' || !allowed.includes(role as TeamRole)) {
    return {
      isValid: false,
      errors: [createValidationError('role', 'Role must be one of: lead, member')],
    };
  }
  return { isValid: true, data: role as TeamRole };
}

export function validateCreateOrganizationRequest(body: unknown): ValidationResult<CreateOrganizationRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const nameRes = validateOrganizationName(payload.name);
  if (!nameRes.isValid) errors.push(...nameRes.errors);

  let slug: string | undefined = undefined;
  if (payload.slug !== undefined && payload.slug !== null) {
    const slugRes = validateSlug(payload.slug);
    if (!slugRes.isValid) {
      errors.push(...slugRes.errors);
    } else {
      slug = slugRes.data!;
    }
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      name: nameRes.data!,
      slug,
    },
  };
}

export function validateUpdateOrganizationRequest(body: unknown): ValidationResult<UpdateOrganizationRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  let name: string | undefined = undefined;
  if (payload.name !== undefined) {
    const nameRes = validateOrganizationName(payload.name);
    if (!nameRes.isValid) errors.push(...nameRes.errors);
    else name = nameRes.data!;
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { name } };
}

export function validateAddOrganizationMemberRequest(body: unknown): ValidationResult<AddOrganizationMemberRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const userRes = validateUUID(payload.userId, 'userId');
  if (!userRes.isValid) errors.push(...userRes.errors);

  let role: 'admin' | 'member' | 'guest' = 'member';
  if (payload.role !== undefined) {
    const roleRes = validateOrganizationRole(payload.role);
    if (!roleRes.isValid) {
      errors.push(...roleRes.errors);
    } else if (roleRes.data === 'owner') {
      errors.push(createValidationError('role', 'Cannot add new member directly as owner'));
    } else {
      role = roleRes.data as 'admin' | 'member' | 'guest';
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { userId: userRes.data!, role } };
}

export function validateUpdateOrganizationMemberRoleRequest(body: unknown): ValidationResult<UpdateOrganizationMemberRoleRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const roleRes = validateOrganizationRole(payload.role);
  if (!roleRes.isValid) return { isValid: false, errors: roleRes.errors };

  return { isValid: true, data: { role: roleRes.data! } };
}

export function validateCreateTeamRequest(body: unknown): ValidationResult<CreateTeamRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const nameRes = validateTeamName(payload.name);
  if (!nameRes.isValid) errors.push(...nameRes.errors);

  let description: string | undefined = undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      description = payload.description.trim();
    }
  }

  let isPrivate = false;
  if (payload.isPrivate !== undefined) {
    isPrivate = Boolean(payload.isPrivate);
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      name: nameRes.data!,
      description,
      isPrivate,
    },
  };
}

export function validateUpdateTeamRequest(body: unknown): ValidationResult<UpdateTeamRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  let name: string | undefined = undefined;
  if (payload.name !== undefined) {
    const nameRes = validateTeamName(payload.name);
    if (!nameRes.isValid) errors.push(...nameRes.errors);
    else name = nameRes.data!;
  }

  let description: string | undefined = undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      description = payload.description.trim();
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { name, description } };
}

export function validateAddTeamMemberRequest(body: unknown): ValidationResult<AddTeamMemberRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const userRes = validateUUID(payload.userId, 'userId');
  if (!userRes.isValid) errors.push(...userRes.errors);

  let role: TeamRole = 'member';
  if (payload.role !== undefined) {
    const roleRes = validateTeamRole(payload.role);
    if (!roleRes.isValid) errors.push(...roleRes.errors);
    else role = roleRes.data!;
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { userId: userRes.data!, role } };
}

export function validateCreateChannelRequest(body: unknown): ValidationResult<CreateChannelRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const nameRes = validateChannelName(payload.name);
  if (!nameRes.isValid) errors.push(...nameRes.errors);

  let description: string | undefined = undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      description = payload.description.trim();
    }
  }

  let isPrivate = false;
  if (payload.isPrivate !== undefined) {
    isPrivate = Boolean(payload.isPrivate);
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      name: nameRes.data!,
      description,
      isPrivate,
    },
  };
}

export function validateUpdateChannelRequest(body: unknown): ValidationResult<UpdateChannelRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  let name: string | undefined = undefined;
  if (payload.name !== undefined) {
    const nameRes = validateChannelName(payload.name);
    if (!nameRes.isValid) errors.push(...nameRes.errors);
    else name = nameRes.data!;
  }

  let description: string | undefined = undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      description = payload.description.trim();
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { name, description } };
}

export function validateAddChannelMemberRequest(body: unknown): ValidationResult<AddChannelMemberRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const userRes = validateUUID(payload.userId, 'userId');
  if (!userRes.isValid) return { isValid: false, errors: userRes.errors };

  return { isValid: true, data: { userId: userRes.data! } };
}

// ============================================================================
// Phase 6: Messaging, Conversations, Reactions & Cursor Validation
// ============================================================================

export function validateMessageContent(content: unknown): ValidationResult<string> {
  if (typeof content !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('content', 'Message content must be a string')],
    };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('content', 'Message content cannot be empty')],
    };
  }

  if (trimmed.length > 10000) {
    return {
      isValid: false,
      errors: [createValidationError('content', 'Message content must not exceed 10,000 characters')],
    };
  }

  return { isValid: true, data: trimmed };
}

// Unicode emoji pattern supporting standard emoji sequences, modifiers, zero-width joiners, and variation selectors
const UNICODE_EMOJI_REGEX = /^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{200D}\u{FE0F}]+$/u;
// Standard shortcodes like :thumbsup:, :heart:, :smile:, :+1:, :-1:
const SHORTCODE_REGEX = /^:[a-zA-Z0-9_\-+]{1,62}:$/;
// Safe ASCII reaction identifier like "thumbs_up", "plus_one", "+1"
const SLUG_REACTION_REGEX = /^[a-zA-Z0-9_\-+]{1,64}$/;

export function validateReactionCode(code: unknown): ValidationResult<string> {
  if (typeof code !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('reactionCode', 'Reaction code must be a string')],
    };
  }

  const trimmed = code.trim();

  if (trimmed.length === 0 || trimmed.length > 64) {
    return {
      isValid: false,
      errors: [createValidationError('reactionCode', 'Reaction code must be between 1 and 64 characters')],
    };
  }

  const isUnicodeEmoji = UNICODE_EMOJI_REGEX.test(trimmed);
  const isShortcode = SHORTCODE_REGEX.test(trimmed);
  const isSlug = SLUG_REACTION_REGEX.test(trimmed);

  if (!isUnicodeEmoji && !isShortcode && !isSlug) {
    return {
      isValid: false,
      errors: [createValidationError('reactionCode', 'Reaction code must be a valid Unicode emoji, shortcode (e.g. :thumbsup:), or standard identifier')],
    };
  }

  return { isValid: true, data: trimmed };
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const ts = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const raw = `${ts}:${id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: unknown): ValidationResult<{ createdAt: string; id: string }> {
  if (typeof cursor !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor must be a base64 string')],
    };
  }

  const trimmed = cursor.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor cannot be empty')],
    };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(trimmed, 'base64url').toString('utf8');
  } catch {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Invalid base64 cursor format')],
    };
  }

  const separatorIndex = decoded.lastIndexOf(':');
  if (separatorIndex === -1) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Malformed cursor structure')],
    };
  }

  const tsString = decoded.substring(0, separatorIndex);
  const idString = decoded.substring(separatorIndex + 1);

  const parsedDate = Date.parse(tsString);
  if (isNaN(parsedDate)) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor contains invalid timestamp')],
    };
  }

  const idRes = validateUUID(idString, 'cursorId');
  if (!idRes.isValid) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor contains invalid UUID')],
    };
  }

  return {
    isValid: true,
    data: {
      createdAt: new Date(parsedDate).toISOString(),
      id: idRes.data!,
    },
  };
}

const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9_.:\-]{1,64}$/;

export function validateIdempotencyKey(key: unknown): ValidationResult<string> {
  if (typeof key !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('idempotencyKey', 'Idempotency key must be a string')],
    };
  }

  const trimmed = key.trim();

  if (trimmed.length === 0 || trimmed.length > 64 || !IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
    return {
      isValid: false,
      errors: [createValidationError('idempotencyKey', 'Idempotency key must be 1 to 64 alphanumeric characters or [._:-]')],
    };
  }

  return { isValid: true, data: trimmed };
}

export function validateSendMessageRequest(body: unknown): ValidationResult<SendMessageRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const contentRes = validateMessageContent(payload.content);
  if (!contentRes.isValid) {
    errors.push(...contentRes.errors);
  }

  let contentType = 'text/plain';
  if (payload.contentType !== undefined && payload.contentType !== null) {
    if (typeof payload.contentType !== 'string' || payload.contentType.trim().length === 0) {
      errors.push(createValidationError('contentType', 'Content type must be a non-empty string'));
    } else {
      contentType = payload.contentType.trim();
    }
  }

  let parentMessageId: string | undefined = undefined;
  if (payload.parentMessageId !== undefined && payload.parentMessageId !== null) {
    const parentRes = validateUUID(payload.parentMessageId, 'parentMessageId');
    if (!parentRes.isValid) {
      errors.push(...parentRes.errors);
    } else {
      parentMessageId = parentRes.data!;
    }
  }

  let idempotencyKey: string | undefined = undefined;
  if (payload.idempotencyKey !== undefined && payload.idempotencyKey !== null) {
    const keyRes = validateIdempotencyKey(payload.idempotencyKey);
    if (!keyRes.isValid) {
      errors.push(...keyRes.errors);
    } else {
      idempotencyKey = keyRes.data!;
    }
  }

  let attachmentFileIds: string[] | undefined = undefined;
  if (payload.attachmentFileIds !== undefined && payload.attachmentFileIds !== null) {
    if (!Array.isArray(payload.attachmentFileIds)) {
      errors.push(createValidationError('attachmentFileIds', 'Attachment file IDs must be an array'));
    } else {
      attachmentFileIds = [];
      for (let i = 0; i < payload.attachmentFileIds.length; i++) {
        const fileIdRes = validateUUID(payload.attachmentFileIds[i], `attachmentFileIds[${i}]`);
        if (!fileIdRes.isValid) {
          errors.push(...fileIdRes.errors);
        } else {
          attachmentFileIds.push(fileIdRes.data!);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      content: contentRes.data!,
      contentType,
      parentMessageId,
      idempotencyKey,
      attachmentFileIds,
    },
  };
}

export function validateEditMessageRequest(body: unknown): ValidationResult<EditMessageRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const contentRes = validateMessageContent(payload.content);
  if (!contentRes.isValid) {
    return { isValid: false, errors: contentRes.errors };
  }

  return { isValid: true, data: { content: contentRes.data! } };
}

export function validateAddReactionRequest(body: unknown): ValidationResult<AddReactionRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const reactionRes = validateReactionCode(payload.reactionCode);
  if (!reactionRes.isValid) {
    return { isValid: false, errors: reactionRes.errors };
  }

  return { isValid: true, data: { reactionCode: reactionRes.data! } };
}

export function validateCreateConversationRequest(body: unknown): ValidationResult<CreateConversationRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const type = payload.type as ConversationType;
  if (type !== 'direct' && type !== 'group') {
    errors.push(createValidationError('type', 'Conversation type must be "direct" or "group"'));
  }

  if (!Array.isArray(payload.participantIds)) {
    errors.push(createValidationError('participantIds', 'Participant IDs must be an array of user UUIDs'));
  } else if (payload.participantIds.length === 0) {
    errors.push(createValidationError('participantIds', 'At least one participant is required'));
  }

  const participantIds: string[] = [];
  if (Array.isArray(payload.participantIds)) {
    for (let i = 0; i < payload.participantIds.length; i++) {
      const uRes = validateUUID(payload.participantIds[i], `participantIds[${i}]`);
      if (!uRes.isValid) {
        errors.push(...uRes.errors);
      } else {
        participantIds.push(uRes.data!);
      }
    }

    // Check for duplicate participant IDs
    const uniqueParticipants = new Set(participantIds);
    if (uniqueParticipants.size !== participantIds.length) {
      errors.push(createValidationError('participantIds', 'Duplicate participant IDs are not allowed'));
    }

    if (type === 'direct' && participantIds.length !== 1 && participantIds.length !== 2) {
      errors.push(createValidationError('participantIds', 'Direct conversations require 1 participant (target user) or 2 total participants'));
    }

    if (type === 'group' && participantIds.length < 2) {
      errors.push(createValidationError('participantIds', 'Group conversations require at least 2 participants'));
    }
  }

  let title: string | undefined = undefined;
  if (payload.title !== undefined && payload.title !== null) {
    if (typeof payload.title !== 'string') {
      errors.push(createValidationError('title', 'Conversation title must be a string'));
    } else {
      title = payload.title.trim();
      if (title.length > 150) {
        errors.push(createValidationError('title', 'Conversation title must not exceed 150 characters'));
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      type,
      participantIds,
      title: title || undefined,
    },
  };
}

export function validateMarkReadRequest(body: unknown): ValidationResult<MarkReadRequest> {
  if (!body || typeof body !== 'object') {
    return { isValid: true, data: {} };
  }

  const payload = body as Record<string, unknown>;
  let messageId: string | undefined = undefined;

  if (payload.messageId !== undefined && payload.messageId !== null) {
    const msgRes = validateUUID(payload.messageId, 'messageId');
    if (!msgRes.isValid) {
      return { isValid: false, errors: msgRes.errors };
    }
    messageId = msgRes.data!;
  }

  return { isValid: true, data: { messageId } };
}

// ============================================================================
// Phase 7: Meeting & WebRTC Validations
// ============================================================================

export function validateCreateMeetingRequest(body: unknown): ValidationResult<CreateMeetingRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const orgRes = validateUUID(payload.organizationId, 'organizationId');
  if (!orgRes.isValid) {
    errors.push(...orgRes.errors);
  }

  if (typeof payload.title !== 'string') {
    errors.push(createValidationError('title', 'Meeting title must be a string'));
  } else {
    const trimmed = payload.title.trim();
    if (trimmed.length < 1) {
      errors.push(createValidationError('title', 'Meeting title cannot be empty'));
    } else if (trimmed.length > 200) {
      errors.push(createValidationError('title', 'Meeting title must not exceed 200 characters'));
    }
  }

  let description: string | undefined = undefined;
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      description = payload.description.trim();
      if (description.length > 2000) {
        errors.push(createValidationError('description', 'Description must not exceed 2000 characters'));
      }
    }
  }

  let scheduledStartAt: string | undefined = undefined;
  if (payload.scheduledStartAt !== undefined && payload.scheduledStartAt !== null) {
    if (typeof payload.scheduledStartAt !== 'string' || isNaN(Date.parse(payload.scheduledStartAt))) {
      errors.push(createValidationError('scheduledStartAt', 'scheduledStartAt must be a valid ISO-8601 date string'));
    } else {
      scheduledStartAt = new Date(payload.scheduledStartAt).toISOString();
    }
  }

  let waitingRoomEnabled: boolean | undefined = undefined;
  if (payload.waitingRoomEnabled !== undefined && payload.waitingRoomEnabled !== null) {
    if (typeof payload.waitingRoomEnabled !== 'boolean') {
      errors.push(createValidationError('waitingRoomEnabled', 'waitingRoomEnabled must be a boolean'));
    } else {
      waitingRoomEnabled = payload.waitingRoomEnabled;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      organizationId: orgRes.data!,
      title: (payload.title as string).trim(),
      description: description || undefined,
      scheduledStartAt,
      waitingRoomEnabled: waitingRoomEnabled ?? true,
    },
  };
}

export function validateUpdateMediaStateRequest(body: unknown): ValidationResult<UpdateMediaStateRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const data: UpdateMediaStateRequest = {};

  if (payload.audioEnabled !== undefined && payload.audioEnabled !== null) {
    if (typeof payload.audioEnabled !== 'boolean') {
      errors.push(createValidationError('audioEnabled', 'audioEnabled must be a boolean'));
    } else {
      data.audioEnabled = payload.audioEnabled;
    }
  }

  if (payload.videoEnabled !== undefined && payload.videoEnabled !== null) {
    if (typeof payload.videoEnabled !== 'boolean') {
      errors.push(createValidationError('videoEnabled', 'videoEnabled must be a boolean'));
    } else {
      data.videoEnabled = payload.videoEnabled;
    }
  }

  if (payload.screenSharing !== undefined && payload.screenSharing !== null) {
    if (typeof payload.screenSharing !== 'boolean') {
      errors.push(createValidationError('screenSharing', 'screenSharing must be a boolean'));
    } else {
      data.screenSharing = payload.screenSharing;
    }
  }

  if (payload.handRaised !== undefined && payload.handRaised !== null) {
    if (typeof payload.handRaised !== 'boolean') {
      errors.push(createValidationError('handRaised', 'handRaised must be a boolean'));
    } else {
      data.handRaised = payload.handRaised;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data };
}

export function validateHostTransferRequest(body: unknown): ValidationResult<TransferHostRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const userRes = validateUUID(payload.newHostUserId, 'newHostUserId');
  if (!userRes.isValid) {
    return { isValid: false, errors: userRes.errors };
  }

  return {
    isValid: true,
    data: { newHostUserId: userRes.data! },
  };
}

export function validateWebRtcSignal(body: unknown): ValidationResult<WebRtcSignalPayload> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Signal message must be a JSON object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const meetingRes = validateUUID(payload.meetingId, 'meetingId');
  if (!meetingRes.isValid) {
    errors.push(...meetingRes.errors);
  }

  const targetRes = validateUUID(payload.targetUserId, 'targetUserId');
  if (!targetRes.isValid) {
    errors.push(...targetRes.errors);
  }

  const validSignalTypes: WebRtcSignalType[] = ['offer', 'answer', 'ice_candidate', 'renegotiate'];
  if (typeof payload.signalType !== 'string' || !validSignalTypes.includes(payload.signalType as WebRtcSignalType)) {
    errors.push(createValidationError('signalType', `signalType must be one of: ${validSignalTypes.join(', ')}`));
  }

  if (payload.data === undefined || payload.data === null) {
    errors.push(createValidationError('data', 'Signal data payload is required'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      meetingId: meetingRes.data!,
      senderUserId: '', // Derived exclusively server-side from authenticated socket
      targetUserId: targetRes.data!,
      signalType: payload.signalType as WebRtcSignalType,
      data: payload.data,
    },
  };
}

// ============================================================================
// Phase 8: File Upload Intent & Attachment Validation
// ============================================================================

export const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.vbs',
  '.js',
  '.msi',
  '.com',
  '.pif',
  '.hta',
  '.jar',
  '.ps1',
  '.scr',
  '.vbe',
  '.wsf',
  '.wsh',
  '.msc',
  '.cpl',
  '.reg',
]);

export const DANGEROUS_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/x-csh',
  'application/x-executable',
  'application/x-msdos-windows',
]);

const MIME_TYPE_REGEX = /^[a-z0-9!#$%^&*_+\.-]+\/[a-z0-9!#$%^&*_+\.-]+$/;
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f]/;

export function extractFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot).toLowerCase();
}

export function validateFileName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name must be a string')],
    };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name is required')],
    };
  }

  if (trimmed.length > 255) {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name must not exceed 255 characters')],
    };
  }

  if (trimmed.includes('\0') || trimmed.includes('\u0000')) {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name must not contain null bytes')],
    };
  }

  if (CONTROL_CHARS_REGEX.test(trimmed)) {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name must not contain control characters')],
    };
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return {
      isValid: false,
      errors: [createValidationError('fileName', 'File name must not contain path traversal characters or slashes')],
    };
  }

  // Reject dangerous executable / script extensions (both primary and multi-part extensions)
  const parts = trimmed.split('.');
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i++) {
      const partExt = `.${parts[i].toLowerCase()}`;
      if (DANGEROUS_EXTENSIONS.has(partExt)) {
        return {
          isValid: false,
          errors: [createValidationError('fileName', `File extension '${partExt}' is dangerous and not permitted`)],
        };
      }
    }
  }

  return { isValid: true, data: trimmed };
}

export function validateFileSizeBytes(
  size: unknown,
  maxBytes: number = MAX_GENERAL_FILE_SIZE_BYTES
): ValidationResult<number> {
  if (typeof size !== 'number' || !Number.isInteger(size)) {
    return {
      isValid: false,
      errors: [createValidationError('fileSizeBytes', 'File size must be an integer')],
    };
  }

  if (size < 0) {
    return {
      isValid: false,
      errors: [createValidationError('fileSizeBytes', 'File size cannot be negative')],
    };
  }

  if (size > maxBytes) {
    return {
      isValid: false,
      errors: [createValidationError('fileSizeBytes', `File size exceeds maximum allowed limit of ${maxBytes} bytes (100MB)`)],
    };
  }

  return { isValid: true, data: size };
}

export function validateMimeType(mime: unknown): ValidationResult<string> {
  if (typeof mime !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('mimeType', 'MIME type must be a string')],
    };
  }

  const normalized = mime.trim().toLowerCase();

  if (normalized.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('mimeType', 'MIME type is required')],
    };
  }

  if (normalized.length > 127) {
    return {
      isValid: false,
      errors: [createValidationError('mimeType', 'MIME type must not exceed 127 characters')],
    };
  }

  if (!MIME_TYPE_REGEX.test(normalized)) {
    return {
      isValid: false,
      errors: [createValidationError('mimeType', 'Invalid MIME type format (expected type/subtype)')],
    };
  }

  if (DANGEROUS_MIME_TYPES.has(normalized)) {
    return {
      isValid: false,
      errors: [createValidationError('mimeType', `MIME type '${normalized}' is not permitted for security reasons`)],
    };
  }

  return { isValid: true, data: normalized };
}

export function validateChecksumSha256(checksum: unknown): ValidationResult<string | undefined> {
  if (checksum === undefined || checksum === null || checksum === '') {
    return { isValid: true, data: undefined };
  }

  if (typeof checksum !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('checksumSha256', 'SHA-256 checksum must be a string')],
    };
  }

  const trimmed = checksum.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return {
      isValid: false,
      errors: [createValidationError('checksumSha256', 'SHA-256 checksum must be a 64-character hexadecimal string')],
    };
  }

  return { isValid: true, data: trimmed.toLowerCase() };
}

export function validateFileUploadIntent(body: unknown): ValidationResult<FileUploadIntentRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const payload = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  const nameRes = validateFileName(payload.fileName);
  if (!nameRes.isValid) {
    errors.push(...nameRes.errors);
  }

  const sizeRes = validateFileSizeBytes(payload.fileSizeBytes);
  if (!sizeRes.isValid) {
    errors.push(...sizeRes.errors);
  }

  const mimeRes = validateMimeType(payload.mimeType);
  if (!mimeRes.isValid) {
    errors.push(...mimeRes.errors);
  }

  const checksumRes = validateChecksumSha256(payload.checksumSha256);
  if (!checksumRes.isValid) {
    errors.push(...checksumRes.errors);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      fileName: nameRes.data!,
      fileSizeBytes: sizeRes.data!,
      mimeType: mimeRes.data!,
      checksumSha256: checksumRes.data,
    },
  };
}

export function validateFileAttachmentIds(
  ids: unknown,
  maxCount: number = 10
): ValidationResult<string[]> {
  if (ids === undefined || ids === null) {
    return { isValid: true, data: [] };
  }

  if (!Array.isArray(ids)) {
    return {
      isValid: false,
      errors: [createValidationError('attachmentFileIds', 'attachmentFileIds must be an array of UUIDs')],
    };
  }

  if (ids.length > maxCount) {
    return {
      isValid: false,
      errors: [createValidationError('attachmentFileIds', `Cannot attach more than ${maxCount} files to a message`)],
    };
  }

  const errors: ApiError[] = [];
  const validIds: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const res = validateUUID(ids[i], `attachmentFileIds[${i}]`);
    if (!res.isValid) {
      errors.push(...res.errors);
    } else {
      validIds.push(res.data!);
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: validIds };
}

// ============================================================================
// Phase 9B: Notification Client Validation
// ============================================================================

export function validateNotificationId(id: unknown): ValidationResult<string> {
  return validateUUID(id, 'notificationId');
}

export const VALID_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'direct_message',
  'channel_message',
  'mention',
  'reply',
  'team_activity',
  'meeting_invite',
  'meeting_started',
  'meeting_update',
  'meeting_participant',
  'system',
  'calendar_invitation',
  'calendar_invitation_response',
  'calendar_event_updated',
  'calendar_event_cancelled',
  'calendar_reminder',
  'CALENDAR_INVITATION',
  'CALENDAR_INVITATION_RESPONSE',
  'CALENDAR_EVENT_UPDATED',
  'CALENDAR_EVENT_CANCELLED',
  'CALENDAR_REMINDER',
] as const;

export function validateNotificationType(type: unknown): ValidationResult<NotificationType> {
  if (typeof type !== 'string' || !VALID_NOTIFICATION_TYPES.includes(type as NotificationType)) {
    return {
      isValid: false,
      errors: [
        createValidationError(
          'type',
          `Notification type must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`
        ),
      ],
    };
  }
  return { isValid: true, data: type as NotificationType };
}

export const VALID_NOTIFICATION_RESOURCE_TYPES: readonly NotificationResourceType[] = [
  'organization',
  'team',
  'channel',
  'conversation',
  'message',
  'meeting',
  'file',
  'user',
  'calendar_event',
] as const;

export function validateNotificationResourceType(type: unknown): ValidationResult<NotificationResourceType> {
  if (typeof type !== 'string' || !VALID_NOTIFICATION_RESOURCE_TYPES.includes(type as NotificationResourceType)) {
    return {
      isValid: false,
      errors: [
        createValidationError(
          'resourceType',
          `Resource type must be one of: ${VALID_NOTIFICATION_RESOURCE_TYPES.join(', ')}`
        ),
      ],
    };
  }
  return { isValid: true, data: type as NotificationResourceType };
}

export function validateNotificationListQuery(
  query: unknown
): ValidationResult<{ limit: number; cursor?: { createdAt: string; id: string } }> {
  const errors: ApiError[] = [];
  const q = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;

  let limit = 25;
  if (q.limit !== undefined && q.limit !== null && q.limit !== '') {
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push(
        createValidationError('limit', 'Limit must be an integer between 1 and 100')
      );
    } else {
      limit = parsedLimit;
    }
  }

  let cursor: { createdAt: string; id: string } | undefined = undefined;
  if (q.cursor !== undefined && q.cursor !== null && q.cursor !== '') {
    const cursorRes = decodeCursor(q.cursor);
    if (!cursorRes.isValid) {
      errors.push(...cursorRes.errors);
    } else {
      cursor = cursorRes.data;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      limit,
      cursor,
    },
  };
}

export function validateMarkAllReadRequest(
  body: unknown
): ValidationResult<{ organizationId?: string }> {
  if (body === undefined || body === null || typeof body !== 'object') {
    return { isValid: true, data: {} };
  }

  const b = body as Record<string, unknown>;
  if (b.organizationId !== undefined && b.organizationId !== null && b.organizationId !== '') {
    const orgRes = validateUUID(b.organizationId, 'organizationId');
    if (!orgRes.isValid) {
      return { isValid: false, errors: orgRes.errors };
    }
    return { isValid: true, data: { organizationId: orgRes.data } };
  }

  return { isValid: true, data: {} };
}

// ============================================================================
// Phase 9C: Notification Sync Keyset Cursors & Query Validation
// ============================================================================

export function encodeNotificationSyncCursor(mutationSeq: string | number | bigint, id: string): string {
  const seqStr = String(mutationSeq);
  const raw = `${seqStr}:${id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeNotificationSyncCursor(
  cursor: unknown
): ValidationResult<{ mutationSeq: string; id: string }> {
  if (typeof cursor !== 'string') {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor must be a base64url string')],
    };
  }

  const trimmed = cursor.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Cursor cannot be empty')],
    };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(trimmed, 'base64url').toString('utf8');
  } catch {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Invalid base64url cursor format')],
    };
  }

  const parts = decoded.split(':');
  if (parts.length !== 2) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Malformed cursor payload')],
    };
  }

  const [mutationSeqStr, id] = parts;
  if (!/^\d+$/.test(mutationSeqStr)) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Invalid mutation sequence in cursor')],
    };
  }

  const uuidRes = validateUUID(id, 'cursor.id');
  if (!uuidRes.isValid) {
    return {
      isValid: false,
      errors: [createValidationError('cursor', 'Invalid UUID in cursor')],
    };
  }

  return {
    isValid: true,
    data: {
      mutationSeq: mutationSeqStr,
      id: uuidRes.data,
    },
  };
}

export function validateNotificationSyncQuery(query: unknown): ValidationResult<{
  activeCursor?: { mutationSeq: string; id: string };
  deletionCursor?: { mutationSeq: string; id: string };
  snapshotMutationSeq?: string;
  since?: Date;
  limit: number;
}> {
  const errors: ApiError[] = [];
  const q = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;

  let limit = 50;
  if (q.limit !== undefined && q.limit !== null && q.limit !== '') {
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push(createValidationError('limit', 'Limit must be an integer between 1 and 100'));
    } else {
      limit = parsedLimit;
    }
  }

  let activeCursor: { mutationSeq: string; id: string } | undefined = undefined;
  if (q.activeCursor !== undefined && q.activeCursor !== null && q.activeCursor !== '') {
    const cursorRes = decodeNotificationSyncCursor(q.activeCursor);
    if (!cursorRes.isValid) {
      errors.push(...cursorRes.errors);
    } else {
      activeCursor = cursorRes.data;
    }
  }

  let deletionCursor: { mutationSeq: string; id: string } | undefined = undefined;
  if (q.deletionCursor !== undefined && q.deletionCursor !== null && q.deletionCursor !== '') {
    const cursorRes = decodeNotificationSyncCursor(q.deletionCursor);
    if (!cursorRes.isValid) {
      errors.push(...cursorRes.errors);
    } else {
      deletionCursor = cursorRes.data;
    }
  }

  let snapshotMutationSeq: string | undefined = undefined;
  if (q.snapshotMutationSeq !== undefined && q.snapshotMutationSeq !== null && q.snapshotMutationSeq !== '') {
    const str = String(q.snapshotMutationSeq).trim();
    if (!/^\d+$/.test(str)) {
      errors.push(createValidationError('snapshotMutationSeq', 'snapshotMutationSeq must be a non-negative integer string'));
    } else {
      snapshotMutationSeq = str;
    }
  }

  let since: Date | undefined = undefined;
  if (q.since !== undefined && q.since !== null && q.since !== '') {
    const str = String(q.since).trim();
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      errors.push(createValidationError('since', 'Invalid since ISO timestamp'));
    } else {
      since = d;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      activeCursor,
      deletionCursor,
      snapshotMutationSeq,
      since,
      limit,
    },
  };
}

// ============================================================================
// Phase 9D-A: Notification Preferences & Channel Mute Validators
// ============================================================================

export function validateUpdateNotificationPreferencesRequest(
  body: unknown
): ValidationResult<UpdateNotificationPreferencesRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const b = body as Record<string, unknown>;
  const errors: ApiError[] = [];
  const allowedKeys = ['realtimeEnabled', 'pushEnabled', 'emailEnabled'];

  for (const key of Object.keys(b)) {
    if (!allowedKeys.includes(key)) {
      errors.push(createValidationError(key, `Unknown field: ${key}`));
    }
  }

  let hasAtLeastOne = false;

  if (b.realtimeEnabled !== undefined) {
    if (typeof b.realtimeEnabled !== 'boolean') {
      errors.push(createValidationError('realtimeEnabled', 'realtimeEnabled must be a boolean'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (b.pushEnabled !== undefined) {
    if (typeof b.pushEnabled !== 'boolean') {
      errors.push(createValidationError('pushEnabled', 'pushEnabled must be a boolean'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (b.emailEnabled !== undefined) {
    if (typeof b.emailEnabled !== 'boolean') {
      errors.push(createValidationError('emailEnabled', 'emailEnabled must be a boolean'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (!hasAtLeastOne && errors.length === 0) {
    errors.push(createValidationError('body', 'At least one preference field must be provided'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      realtimeEnabled: b.realtimeEnabled as boolean | undefined,
      pushEnabled: b.pushEnabled as boolean | undefined,
      emailEnabled: b.emailEnabled as boolean | undefined,
    },
  };
}

export function validateUpdateNotificationTypePreferenceRequest(
  body: unknown
): ValidationResult<UpdateNotificationTypePreferenceRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const b = body as Record<string, unknown>;
  const errors: ApiError[] = [];
  const allowedKeys = ['realtimeEnabled', 'pushEnabled', 'emailEnabled'];

  for (const key of Object.keys(b)) {
    if (!allowedKeys.includes(key)) {
      errors.push(createValidationError(key, `Unknown field: ${key}`));
    }
  }

  let hasAtLeastOne = false;

  if (b.realtimeEnabled !== undefined) {
    if (b.realtimeEnabled !== null && typeof b.realtimeEnabled !== 'boolean') {
      errors.push(createValidationError('realtimeEnabled', 'realtimeEnabled must be a boolean or null'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (b.pushEnabled !== undefined) {
    if (b.pushEnabled !== null && typeof b.pushEnabled !== 'boolean') {
      errors.push(createValidationError('pushEnabled', 'pushEnabled must be a boolean or null'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (b.emailEnabled !== undefined) {
    if (b.emailEnabled !== null && typeof b.emailEnabled !== 'boolean') {
      errors.push(createValidationError('emailEnabled', 'emailEnabled must be a boolean or null'));
    } else {
      hasAtLeastOne = true;
    }
  }

  if (!hasAtLeastOne && errors.length === 0) {
    errors.push(createValidationError('body', 'At least one preference override field must be provided'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      realtimeEnabled: b.realtimeEnabled as boolean | null | undefined,
      pushEnabled: b.pushEnabled as boolean | null | undefined,
      emailEnabled: b.emailEnabled as boolean | null | undefined,
    },
  };
}

export function validateMuteChannelRequest(
  body: unknown
): ValidationResult<MuteChannelRequest> {
  if (body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)) {
    // Empty body is valid for permanent mute: { mutedUntil: null }
    return { isValid: true, data: { mutedUntil: null } };
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const b = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  for (const key of Object.keys(b)) {
    if (key !== 'mutedUntil') {
      errors.push(createValidationError(key, `Unknown field: ${key}`));
    }
  }

  let mutedUntil: string | null = null;
  if (b.mutedUntil !== undefined && b.mutedUntil !== null) {
    if (typeof b.mutedUntil !== 'string') {
      errors.push(createValidationError('mutedUntil', 'mutedUntil must be an ISO-8601 string or null'));
    } else {
      const d = new Date(b.mutedUntil);
      if (isNaN(d.getTime())) {
        errors.push(createValidationError('mutedUntil', 'mutedUntil must be a valid ISO timestamp'));
      } else if (d.getTime() <= Date.now()) {
        errors.push(createValidationError('mutedUntil', 'mutedUntil must be a future timestamp'));
      } else {
        mutedUntil = d.toISOString();
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: { mutedUntil },
  };
}

export function validateNotificationTypeParam(
  param: unknown
): ValidationResult<NotificationType> {
  if (typeof param !== 'string' || !VALID_NOTIFICATION_TYPES.includes(param as NotificationType)) {
    return {
      isValid: false,
      errors: [
        createValidationError(
          'notificationType',
          `Notification type must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`
        ),
      ],
    };
  }
  return { isValid: true, data: param as NotificationType };
}

// ============================================================================
// Phase 9D-B: Push Device Registration & Delivery Validation
// ============================================================================

export const VALID_PUSH_PLATFORMS: readonly PushPlatform[] = ['android', 'ios', 'desktop'] as const;
export const VALID_PUSH_PROVIDERS: readonly PushProvider[] = ['fcm', 'apns'] as const;

export function validateRegisterPushDeviceRequest(
  body: unknown
): ValidationResult<RegisterPushDeviceRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const b = body as Record<string, unknown>;
  const errors: ApiError[] = [];
  const allowedKeys = ['platform', 'provider', 'pushToken', 'appVersion', 'deviceName'];

  for (const key of Object.keys(b)) {
    if (!allowedKeys.includes(key)) {
      errors.push(createValidationError(key, `Unknown field: ${key}`));
    }
  }

  // Validate platform
  if (typeof b.platform !== 'string' || !VALID_PUSH_PLATFORMS.includes(b.platform as PushPlatform)) {
    errors.push(
      createValidationError(
        'platform',
        `Platform must be one of: ${VALID_PUSH_PLATFORMS.join(', ')}`
      )
    );
  }

  // Validate provider
  if (typeof b.provider !== 'string' || !VALID_PUSH_PROVIDERS.includes(b.provider as PushProvider)) {
    errors.push(
      createValidationError(
        'provider',
        `Provider must be one of: ${VALID_PUSH_PROVIDERS.join(', ')}`
      )
    );
  }

  // Validate platform/provider pairing:
  // Android -> FCM
  // iOS -> APNs
  // Desktop -> FCM
  if (
    typeof b.platform === 'string' &&
    VALID_PUSH_PLATFORMS.includes(b.platform as PushPlatform) &&
    typeof b.provider === 'string' &&
    VALID_PUSH_PROVIDERS.includes(b.provider as PushProvider)
  ) {
    if (b.platform === 'android' && b.provider !== 'fcm') {
      errors.push(createValidationError('provider', 'Android devices must use the "fcm" provider'));
    } else if (b.platform === 'ios' && b.provider !== 'apns') {
      errors.push(createValidationError('provider', 'iOS devices must use the "apns" provider'));
    } else if (b.platform === 'desktop' && b.provider !== 'fcm') {
      errors.push(createValidationError('provider', 'Desktop devices must use the "fcm" provider'));
    }
  }

  // Validate pushToken
  if (typeof b.pushToken !== 'string') {
    errors.push(createValidationError('pushToken', 'pushToken must be a string'));
  } else {
    const trimmedToken = b.pushToken.trim();
    if (trimmedToken.length < 10 || trimmedToken.length > 4096) {
      errors.push(createValidationError('pushToken', 'pushToken must be between 10 and 4096 characters'));
    }
  }

  // Optional appVersion
  let appVersion: string | undefined = undefined;
  if (b.appVersion !== undefined && b.appVersion !== null) {
    if (typeof b.appVersion !== 'string') {
      errors.push(createValidationError('appVersion', 'appVersion must be a string'));
    } else {
      appVersion = b.appVersion.trim();
      if (appVersion.length > 50) {
        errors.push(createValidationError('appVersion', 'appVersion must not exceed 50 characters'));
      }
    }
  }

  // Optional deviceName
  let deviceName: string | undefined = undefined;
  if (b.deviceName !== undefined && b.deviceName !== null) {
    if (typeof b.deviceName !== 'string') {
      errors.push(createValidationError('deviceName', 'deviceName must be a string'));
    } else {
      deviceName = b.deviceName.trim();
      if (deviceName.length > 100) {
        errors.push(createValidationError('deviceName', 'deviceName must not exceed 100 characters'));
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      platform: b.platform as PushPlatform,
      provider: b.provider as PushProvider,
      pushToken: (b.pushToken as string).trim(),
      appVersion: appVersion || undefined,
      deviceName: deviceName || undefined,
    },
  };
}

export function validatePushDeviceIdParam(param: unknown): ValidationResult<string> {
  return validateUUID(param, 'deviceId');
}

// ============================================================================
// Phase 9D-C: Email Notification Validation
// ============================================================================

export const VALID_EMAIL_DELIVERY_STATUSES: EmailDeliveryStatus[] = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'DISABLED',
];

export function validateEmailDeliveryStatus(status: unknown): ValidationResult<EmailDeliveryStatus> {
  if (typeof status !== 'string' || !VALID_EMAIL_DELIVERY_STATUSES.includes(status as EmailDeliveryStatus)) {
    return {
      isValid: false,
      errors: [createValidationError('status', `Status must be one of: ${VALID_EMAIL_DELIVERY_STATUSES.join(', ')}`)],
    };
  }
  return { isValid: true, data: status as EmailDeliveryStatus };
}

// ============================================================================
// Phase 9E: Search & Discovery Validation
// ============================================================================

export const VALID_SEARCH_CATEGORY_FILTERS: SearchCategoryFilter[] = [
  'all',
  'users',
  'teams',
  'channels',
  'conversations',
  'messages',
  'meetings',
  'files',
];

export function validateSearchQuery(params: unknown): ValidationResult<SearchRequestQuery> {
  if (!params || typeof params !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('query', 'Search parameters must be an object')],
    };
  }

  const p = params as Record<string, unknown>;

  // 1. Query String (q)
  if (typeof p.q !== 'string') {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.EMPTY_QUERY,
        message: 'Search query (q) is required and must be a string',
        details: { field: 'q' },
      }],
    };
  }

  // Trim whitespace
  const trimmedQ = p.q.trim();
  if (trimmedQ.length === 0) {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.EMPTY_QUERY,
        message: 'Search query cannot be empty',
        details: { field: 'q' },
      }],
    };
  }

  if (trimmedQ.length > 200) {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.QUERY_TOO_LONG,
        message: 'Search query cannot exceed 200 characters',
        details: { field: 'q' },
      }],
    };
  }

  // Reject null bytes and control characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmedQ)) {
    return {
      isValid: false,
      errors: [{
        code: 'INVALID_CHARACTERS',
        message: 'Search query contains invalid control characters',
        details: { field: 'q' },
      }],
    };
  }

  // 2. Type Filter (optional)
  let typeFilter: SearchCategoryFilter = 'all';
  if (p.type !== undefined && p.type !== null) {
    if (typeof p.type !== 'string' || !VALID_SEARCH_CATEGORY_FILTERS.includes(p.type as SearchCategoryFilter)) {
      return {
        isValid: false,
        errors: [{
          code: PHASE9E_ERROR_CODES.INVALID_SEARCH_TYPE,
          message: `Invalid search type. Must be one of: ${VALID_SEARCH_CATEGORY_FILTERS.join(', ')}`,
          details: { field: 'type' },
        }],
      };
    }
    typeFilter = p.type as SearchCategoryFilter;
  }

  // 3. Limit (optional)
  let limit = 20;
  if (p.limit !== undefined && p.limit !== null) {
    const parsedLimit = Number(p.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return {
        isValid: false,
        errors: [{
          code: PHASE9E_ERROR_CODES.INVALID_LIMIT,
          message: 'Limit must be an integer between 1 and 100',
          details: { field: 'limit' },
        }],
      };
    }
    limit = parsedLimit;
  }

  // 4. Cursor (optional)
  let cursor: string | undefined = undefined;
  if (p.cursor !== undefined && p.cursor !== null) {
    if (typeof p.cursor !== 'string' || p.cursor.trim().length === 0) {
      return {
        isValid: false,
        errors: [{
          code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
          message: 'Cursor must be a non-empty string',
          details: { field: 'cursor' },
        }],
      };
    }
    cursor = p.cursor.trim();
  }

  // 5. Organization ID (optional)
  let organizationId: string | undefined = undefined;
  if (p.organizationId !== undefined && p.organizationId !== null) {
    const orgVal = validateUUID(p.organizationId, 'organizationId');
    if (!orgVal.isValid) {
      return orgVal;
    }
    organizationId = orgVal.data;
  }

  return {
    isValid: true,
    data: {
      q: trimmedQ,
      type: typeFilter,
      limit,
      cursor,
      organizationId,
    },
  };
}

export function encodeSearchCursor(cursorData: SearchCursorData): string {
  const payload = JSON.stringify({
    r: cursorData.relevance,
    c: cursorData.createdAt,
    i: cursorData.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeSearchCursor(cursor: unknown): ValidationResult<SearchCursorData> {
  if (typeof cursor !== 'string') {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
        message: 'Cursor must be a base64 string',
        details: { field: 'cursor' },
      }],
    };
  }

  const trimmed = cursor.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
        message: 'Cursor cannot be empty',
        details: { field: 'cursor' },
      }],
    };
  }

  try {
    const raw = Buffer.from(trimmed, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.r !== 'number' ||
      typeof parsed.c !== 'string' ||
      typeof parsed.i !== 'string'
    ) {
      return {
        isValid: false,
        errors: [{
          code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
          message: 'Malformed search cursor data',
          details: { field: 'cursor' },
        }],
      };
    }

    const dateVal = new Date(parsed.c);
    if (isNaN(dateVal.getTime())) {
      return {
        isValid: false,
        errors: [{
          code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
          message: 'Invalid timestamp in search cursor',
          details: { field: 'cursor' },
        }],
      };
    }

    return {
      isValid: true,
      data: {
        relevance: parsed.r,
        createdAt: parsed.c,
        id: parsed.i,
      },
    };
  } catch {
    return {
      isValid: false,
      errors: [{
        code: PHASE9E_ERROR_CODES.INVALID_CURSOR,
        message: 'Invalid base64url search cursor',
        details: { field: 'cursor' },
      }],
    };
  }
}

// ============================================================================
// Phase 10: Calendar & Scheduling Validation
// ============================================================================

export const VALID_CALENDAR_VISIBILITIES: readonly CalendarEventVisibility[] = [
  'PRIVATE',
  'ORGANIZATION',
  'TEAM',
] as const;

export const VALID_CALENDAR_STATUSES: readonly CalendarEventStatus[] = [
  'confirmed',
  'tentative',
  'cancelled',
] as const;

export const VALID_CALENDAR_RESPONSE_STATUSES: readonly CalendarAttendeeResponseStatus[] = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'TENTATIVE',
] as const;

const MAX_CALENDAR_QUERY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_AVAILABILITY_QUERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CALENDAR_ATTENDEES = 100;
const MAX_REMINDERS_PER_EVENT = 10;
const MAX_REMINDER_MINUTES = 43200; // 30 days in minutes

export function validateIanaTimeZone(tz: unknown): ValidationResult<string> {
  if (tz === undefined || tz === null || tz === '') {
    return { isValid: true, data: 'UTC' };
  }

  if (typeof tz !== 'string') {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_TIMEZONE,
        message: 'Timezone must be a valid IANA timezone string',
        details: { field: 'timezone' },
      }],
    };
  }

  const trimmed = tz.trim();
  if (trimmed.length > 50) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_TIMEZONE,
        message: 'Timezone string exceeds maximum length of 50 characters',
        details: { field: 'timezone' },
      }],
    };
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return { isValid: true, data: trimmed };
  } catch {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_TIMEZONE,
        message: `Invalid IANA timezone: '${trimmed}'`,
        details: { field: 'timezone' },
      }],
    };
  }
}

export function validateRRule(rule: unknown): ValidationResult<string> {
  if (typeof rule !== 'string') {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
        message: 'Recurrence rule must be a string',
        details: { field: 'recurrenceRule' },
      }],
    };
  }

  const trimmed = rule.trim();
  if (trimmed.length === 0 || trimmed.length > 500) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
        message: 'Recurrence rule must be between 1 and 500 characters',
        details: { field: 'recurrenceRule' },
      }],
    };
  }

  // Safe RRULE characters only
  if (!/^[A-Za-z0-9=,;:\-]+$/.test(trimmed)) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
        message: 'Recurrence rule contains invalid characters',
        details: { field: 'recurrenceRule' },
      }],
    };
  }

  // Must specify a valid frequency
  const freqMatch = trimmed.match(/FREQ=([A-Z]+)/i);
  if (!freqMatch) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
        message: 'Recurrence rule must specify FREQ (e.g. DAILY, WEEKLY, MONTHLY, YEARLY)',
        details: { field: 'recurrenceRule' },
      }],
    };
  }

  const freq = freqMatch[1].toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
        message: `Unsupported recurrence frequency: '${freq}'`,
        details: { field: 'recurrenceRule' },
      }],
    };
  }

  // Bounded COUNT check to prevent pathological recurrence
  const countMatch = trimmed.match(/COUNT=([0-9]+)/i);
  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    if (isNaN(count) || count < 1 || count > 365) {
      return {
        isValid: false,
        errors: [{
          code: PHASE10_ERROR_CODES.PATHOLOGICAL_RECURRENCE,
          message: 'Recurrence COUNT must be between 1 and 365',
          details: { field: 'recurrenceRule' },
        }],
      };
    }
  }

  // Bounded INTERVAL check
  const intervalMatch = trimmed.match(/INTERVAL=([0-9]+)/i);
  if (intervalMatch) {
    const interval = parseInt(intervalMatch[1], 10);
    if (isNaN(interval) || interval < 1 || interval > 365) {
      return {
        isValid: false,
        errors: [{
          code: PHASE10_ERROR_CODES.INVALID_RECURRENCE_RULE,
          message: 'Recurrence INTERVAL must be between 1 and 365',
          details: { field: 'recurrenceRule' },
        }],
      };
    }
  }

  return { isValid: true, data: trimmed };
}

export function validateReminderMinutes(minutes: unknown): ValidationResult<number> {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.REMINDER_MINUTES_INVALID,
        message: 'Reminder minutes must be an integer',
        details: { field: 'minutes' },
      }],
    };
  }

  if (minutes <= 0 || minutes > MAX_REMINDER_MINUTES) {
    return {
      isValid: false,
      errors: [{
        code: PHASE10_ERROR_CODES.REMINDER_MINUTES_INVALID,
        message: `Reminder minutes must be between 1 and ${MAX_REMINDER_MINUTES}`,
        details: { field: 'minutes' },
      }],
    };
  }

  return { isValid: true, data: minutes };
}

export function validateCreateCalendarEventRequest(body: unknown): ValidationResult<CreateCalendarEventRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  // Title
  if (typeof p.title !== 'string') {
    errors.push(createValidationError('title', 'Event title is required and must be a string'));
  } else {
    const trimmed = p.title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      errors.push(createValidationError('title', 'Event title must be between 1 and 200 characters'));
    }
  }

  // Description
  let description: string | null = null;
  if (p.description !== undefined && p.description !== null) {
    if (typeof p.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      const trimmed = p.description.trim();
      if (trimmed.length > 5000) {
        errors.push(createValidationError('description', 'Description must not exceed 5000 characters'));
      } else {
        description = trimmed;
      }
    }
  }

  // Location
  let location: string | null = null;
  if (p.location !== undefined && p.location !== null) {
    if (typeof p.location !== 'string') {
      errors.push(createValidationError('location', 'Location must be a string'));
    } else {
      const trimmed = p.location.trim();
      if (trimmed.length > 255) {
        errors.push(createValidationError('location', 'Location must not exceed 255 characters'));
      } else {
        location = trimmed;
      }
    }
  }

  // startAt & endAt
  let startAtDate: Date | null = null;
  let endAtDate: Date | null = null;

  if (typeof p.startAt !== 'string') {
    errors.push(createValidationError('startAt', 'startAt is required and must be an ISO-8601 string'));
  } else {
    startAtDate = new Date(p.startAt);
    if (isNaN(startAtDate.getTime())) {
      errors.push(createValidationError('startAt', 'startAt is not a valid date'));
    }
  }

  if (typeof p.endAt !== 'string') {
    errors.push(createValidationError('endAt', 'endAt is required and must be an ISO-8601 string'));
  } else {
    endAtDate = new Date(p.endAt);
    if (isNaN(endAtDate.getTime())) {
      errors.push(createValidationError('endAt', 'endAt is not a valid date'));
    }
  }

  const allDay = Boolean(p.allDay);

  if (startAtDate && endAtDate && !isNaN(startAtDate.getTime()) && !isNaN(endAtDate.getTime())) {
    if (allDay) {
      if (endAtDate.getTime() < startAtDate.getTime()) {
        errors.push({
          code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
          message: 'endAt must be equal to or after startAt for all-day events',
          details: { field: 'endAt' },
        });
      }
    } else {
      if (endAtDate.getTime() <= startAtDate.getTime()) {
        errors.push({
          code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
          message: 'endAt must be strictly after startAt for non-all-day events',
          details: { field: 'endAt' },
        });
      }
    }
  }

  // Timezone
  let validatedTimezone = 'UTC';
  if (p.timezone !== undefined && p.timezone !== null) {
    const tzRes = validateIanaTimeZone(p.timezone);
    if (!tzRes.isValid) {
      errors.push(...tzRes.errors);
    } else {
      validatedTimezone = tzRes.data;
    }
  }

  // Visibility
  let visibility: CalendarEventVisibility = 'ORGANIZATION';
  if (p.visibility !== undefined && p.visibility !== null) {
    if (typeof p.visibility !== 'string' || !VALID_CALENDAR_VISIBILITIES.includes(p.visibility as CalendarEventVisibility)) {
      errors.push(createValidationError('visibility', `Visibility must be one of: ${VALID_CALENDAR_VISIBILITIES.join(', ')}`));
    } else {
      visibility = p.visibility as CalendarEventVisibility;
    }
  }

  // OrganizationId & TeamId
  let organizationId: string | null = null;
  if (p.organizationId !== undefined && p.organizationId !== null && p.organizationId !== '') {
    const orgRes = validateUUID(p.organizationId, 'organizationId');
    if (!orgRes.isValid) errors.push(...orgRes.errors);
    else organizationId = orgRes.data!;
  }

  let teamId: string | null = null;
  if (p.teamId !== undefined && p.teamId !== null && p.teamId !== '') {
    const teamRes = validateUUID(p.teamId, 'teamId');
    if (!teamRes.isValid) errors.push(...teamRes.errors);
    else teamId = teamRes.data!;
  }

  // MeetingId
  let meetingId: string | null = null;
  if (p.meetingId !== undefined && p.meetingId !== null && p.meetingId !== '') {
    const meetRes = validateUUID(p.meetingId, 'meetingId');
    if (!meetRes.isValid) errors.push(...meetRes.errors);
    else meetingId = meetRes.data!;
  }

  // Recurrence rule
  let recurrenceRule: string | null = null;
  if (p.recurrenceRule !== undefined && p.recurrenceRule !== null && p.recurrenceRule !== '') {
    const ruleRes = validateRRule(p.recurrenceRule);
    if (!ruleRes.isValid) errors.push(...ruleRes.errors);
    else recurrenceRule = ruleRes.data;
  }

  // Recurrence until
  let recurrenceUntil: string | null = null;
  if (p.recurrenceUntil !== undefined && p.recurrenceUntil !== null && p.recurrenceUntil !== '') {
    if (typeof p.recurrenceUntil !== 'string') {
      errors.push(createValidationError('recurrenceUntil', 'recurrenceUntil must be an ISO-8601 string'));
    } else {
      const untilDate = new Date(p.recurrenceUntil);
      if (isNaN(untilDate.getTime())) {
        errors.push(createValidationError('recurrenceUntil', 'recurrenceUntil is not a valid date'));
      } else {
        recurrenceUntil = untilDate.toISOString();
      }
    }
  }

  // Recurrence timezone
  let recurrenceTimezone: string | null = null;
  if (p.recurrenceTimezone !== undefined && p.recurrenceTimezone !== null && p.recurrenceTimezone !== '') {
    const recTzRes = validateIanaTimeZone(p.recurrenceTimezone);
    if (!recTzRes.isValid) errors.push(...recTzRes.errors);
    else recurrenceTimezone = recTzRes.data;
  }

  // Attendees
  let attendeeUserIds: string[] = [];
  if (p.attendeeUserIds !== undefined && p.attendeeUserIds !== null) {
    if (!Array.isArray(p.attendeeUserIds)) {
      errors.push(createValidationError('attendeeUserIds', 'attendeeUserIds must be an array of UUIDs'));
    } else if (p.attendeeUserIds.length > MAX_CALENDAR_ATTENDEES) {
      errors.push({
        code: PHASE10_ERROR_CODES.MAX_ATTENDEES_EXCEEDED,
        message: `Cannot invite more than ${MAX_CALENDAR_ATTENDEES} attendees to a calendar event`,
        details: { field: 'attendeeUserIds' },
      });
    } else {
      const set = new Set<string>();
      for (let i = 0; i < p.attendeeUserIds.length; i++) {
        const uRes = validateUUID(p.attendeeUserIds[i], `attendeeUserIds[${i}]`);
        if (!uRes.isValid) errors.push(...uRes.errors);
        else set.add(uRes.data!);
      }
      attendeeUserIds = Array.from(set);
    }
  }

  // Reminders
  let reminders: number[] = [];
  if (p.reminders !== undefined && p.reminders !== null) {
    if (!Array.isArray(p.reminders)) {
      errors.push(createValidationError('reminders', 'reminders must be an array of positive integers (minutes before)'));
    } else if (p.reminders.length > MAX_REMINDERS_PER_EVENT) {
      errors.push(createValidationError('reminders', `Cannot configure more than ${MAX_REMINDERS_PER_EVENT} reminders`));
    } else {
      const set = new Set<number>();
      for (const m of p.reminders) {
        const mRes = validateReminderMinutes(m);
        if (!mRes.isValid) errors.push(...mRes.errors);
        else set.add(mRes.data);
      }
      reminders = Array.from(set).sort((a, b) => a - b);
    }
  }

  // IdempotencyKey
  let idempotencyKey: string | undefined = undefined;
  if (p.idempotencyKey !== undefined && p.idempotencyKey !== null) {
    if (typeof p.idempotencyKey !== 'string' || p.idempotencyKey.trim().length === 0 || p.idempotencyKey.length > 128) {
      errors.push(createValidationError('idempotencyKey', 'idempotencyKey must be a string up to 128 characters'));
    } else {
      idempotencyKey = p.idempotencyKey.trim();
    }
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      title: (p.title as string).trim(),
      description,
      location,
      startAt: startAtDate!.toISOString(),
      endAt: endAtDate!.toISOString(),
      timezone: validatedTimezone,
      allDay,
      visibility,
      organizationId,
      teamId,
      meetingId,
      recurrenceRule,
      recurrenceUntil,
      recurrenceTimezone,
      attendeeUserIds,
      reminders,
      idempotencyKey,
    },
  };
}

export function validateUpdateCalendarEventRequest(body: unknown): ValidationResult<UpdateCalendarEventRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ApiError[] = [];
  const result: UpdateCalendarEventRequest = {};

  if (p.title !== undefined) {
    if (typeof p.title !== 'string') {
      errors.push(createValidationError('title', 'Event title must be a string'));
    } else {
      const trimmed = p.title.trim();
      if (trimmed.length < 1 || trimmed.length > 200) {
        errors.push(createValidationError('title', 'Event title must be between 1 and 200 characters'));
      } else {
        result.title = trimmed;
      }
    }
  }

  if (p.description !== undefined) {
    if (p.description === null) {
      result.description = null;
    } else if (typeof p.description !== 'string') {
      errors.push(createValidationError('description', 'Description must be a string'));
    } else {
      const trimmed = p.description.trim();
      if (trimmed.length > 5000) {
        errors.push(createValidationError('description', 'Description must not exceed 5000 characters'));
      } else {
        result.description = trimmed;
      }
    }
  }

  if (p.location !== undefined) {
    if (p.location === null) {
      result.location = null;
    } else if (typeof p.location !== 'string') {
      errors.push(createValidationError('location', 'Location must be a string'));
    } else {
      const trimmed = p.location.trim();
      if (trimmed.length > 255) {
        errors.push(createValidationError('location', 'Location must not exceed 255 characters'));
      } else {
        result.location = trimmed;
      }
    }
  }

  let startAtDate: Date | null = null;
  if (p.startAt !== undefined) {
    if (typeof p.startAt !== 'string') {
      errors.push(createValidationError('startAt', 'startAt must be an ISO-8601 string'));
    } else {
      startAtDate = new Date(p.startAt);
      if (isNaN(startAtDate.getTime())) {
        errors.push(createValidationError('startAt', 'startAt is not a valid date'));
      } else {
        result.startAt = startAtDate.toISOString();
      }
    }
  }

  let endAtDate: Date | null = null;
  if (p.endAt !== undefined) {
    if (typeof p.endAt !== 'string') {
      errors.push(createValidationError('endAt', 'endAt must be an ISO-8601 string'));
    } else {
      endAtDate = new Date(p.endAt);
      if (isNaN(endAtDate.getTime())) {
        errors.push(createValidationError('endAt', 'endAt is not a valid date'));
      } else {
        result.endAt = endAtDate.toISOString();
      }
    }
  }

  if (p.allDay !== undefined) {
    result.allDay = Boolean(p.allDay);
  }

  if (startAtDate && endAtDate && !isNaN(startAtDate.getTime()) && !isNaN(endAtDate.getTime())) {
    if (result.allDay) {
      if (endAtDate.getTime() < startAtDate.getTime()) {
        errors.push({
          code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
          message: 'endAt must be equal to or after startAt',
          details: { field: 'endAt' },
        });
      }
    } else {
      if (endAtDate.getTime() <= startAtDate.getTime()) {
        errors.push({
          code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
          message: 'endAt must be strictly after startAt',
          details: { field: 'endAt' },
        });
      }
    }
  }

  if (p.timezone !== undefined) {
    const tzRes = validateIanaTimeZone(p.timezone);
    if (!tzRes.isValid) errors.push(...tzRes.errors);
    else result.timezone = tzRes.data;
  }

  if (p.visibility !== undefined) {
    if (typeof p.visibility !== 'string' || !VALID_CALENDAR_VISIBILITIES.includes(p.visibility as CalendarEventVisibility)) {
      errors.push(createValidationError('visibility', `Visibility must be one of: ${VALID_CALENDAR_VISIBILITIES.join(', ')}`));
    } else {
      result.visibility = p.visibility as CalendarEventVisibility;
    }
  }

  if (p.status !== undefined) {
    if (typeof p.status !== 'string' || !VALID_CALENDAR_STATUSES.includes(p.status as CalendarEventStatus)) {
      errors.push(createValidationError('status', `Status must be one of: ${VALID_CALENDAR_STATUSES.join(', ')}`));
    } else {
      result.status = p.status as CalendarEventStatus;
    }
  }

  if (p.meetingId !== undefined) {
    if (p.meetingId === null || p.meetingId === '') {
      result.meetingId = null;
    } else {
      const mRes = validateUUID(p.meetingId, 'meetingId');
      if (!mRes.isValid) errors.push(...mRes.errors);
      else result.meetingId = mRes.data!;
    }
  }

  if (p.recurrenceRule !== undefined) {
    if (p.recurrenceRule === null || p.recurrenceRule === '') {
      result.recurrenceRule = null;
    } else {
      const ruleRes = validateRRule(p.recurrenceRule);
      if (!ruleRes.isValid) errors.push(...ruleRes.errors);
      else result.recurrenceRule = ruleRes.data;
    }
  }

  if (p.recurrenceUntil !== undefined) {
    if (p.recurrenceUntil === null || p.recurrenceUntil === '') {
      result.recurrenceUntil = null;
    } else if (typeof p.recurrenceUntil !== 'string') {
      errors.push(createValidationError('recurrenceUntil', 'recurrenceUntil must be an ISO-8601 string'));
    } else {
      const untilDate = new Date(p.recurrenceUntil);
      if (isNaN(untilDate.getTime())) {
        errors.push(createValidationError('recurrenceUntil', 'recurrenceUntil is not a valid date'));
      } else {
        result.recurrenceUntil = untilDate.toISOString();
      }
    }
  }

  if (p.recurrenceTimezone !== undefined) {
    if (p.recurrenceTimezone === null || p.recurrenceTimezone === '') {
      result.recurrenceTimezone = null;
    } else {
      const recTzRes = validateIanaTimeZone(p.recurrenceTimezone);
      if (!recTzRes.isValid) errors.push(...recTzRes.errors);
      else result.recurrenceTimezone = recTzRes.data;
    }
  }

  if (p.attendeeUserIds !== undefined && p.attendeeUserIds !== null) {
    if (!Array.isArray(p.attendeeUserIds)) {
      errors.push(createValidationError('attendeeUserIds', 'attendeeUserIds must be an array of UUIDs'));
    } else if (p.attendeeUserIds.length > MAX_CALENDAR_ATTENDEES) {
      errors.push({
        code: PHASE10_ERROR_CODES.MAX_ATTENDEES_EXCEEDED,
        message: `Cannot invite more than ${MAX_CALENDAR_ATTENDEES} attendees`,
        details: { field: 'attendeeUserIds' },
      });
    } else {
      const set = new Set<string>();
      for (let i = 0; i < p.attendeeUserIds.length; i++) {
        const uRes = validateUUID(p.attendeeUserIds[i], `attendeeUserIds[${i}]`);
        if (!uRes.isValid) errors.push(...uRes.errors);
        else set.add(uRes.data!);
      }
      result.attendeeUserIds = Array.from(set);
    }
  }

  if (p.reminders !== undefined && p.reminders !== null) {
    if (!Array.isArray(p.reminders)) {
      errors.push(createValidationError('reminders', 'reminders must be an array of positive integers'));
    } else if (p.reminders.length > MAX_REMINDERS_PER_EVENT) {
      errors.push(createValidationError('reminders', `Cannot configure more than ${MAX_REMINDERS_PER_EVENT} reminders`));
    } else {
      const set = new Set<number>();
      for (const m of p.reminders) {
        const mRes = validateReminderMinutes(m);
        if (!mRes.isValid) errors.push(...mRes.errors);
        else set.add(mRes.data);
      }
      result.reminders = Array.from(set).sort((a, b) => a - b);
    }
  }

  if (errors.length > 0) return { isValid: false, errors };

  return { isValid: true, data: result };
}

export function validateCalendarEventQuery(query: unknown): ValidationResult<CalendarEventQuery> {
  if (!query || typeof query !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('query', 'Query must be an object')],
    };
  }

  const q = query as Record<string, unknown>;
  const errors: ApiError[] = [];

  if (typeof q.start !== 'string') {
    errors.push(createValidationError('start', 'start parameter is required and must be an ISO-8601 string'));
  }
  if (typeof q.end !== 'string') {
    errors.push(createValidationError('end', 'end parameter is required and must be an ISO-8601 string'));
  }

  const startDate = typeof q.start === 'string' ? new Date(q.start) : null;
  const endDate = typeof q.end === 'string' ? new Date(q.end) : null;

  if (startDate && isNaN(startDate.getTime())) {
    errors.push(createValidationError('start', 'start parameter is not a valid date'));
  }
  if (endDate && isNaN(endDate.getTime())) {
    errors.push(createValidationError('end', 'end parameter is not a valid date'));
  }

  if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
    if (endDate.getTime() <= startDate.getTime()) {
      errors.push({
        code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
        message: 'end date must be after start date',
        details: { field: 'end' },
      });
    } else {
      const windowMs = endDate.getTime() - startDate.getTime();
      if (windowMs > MAX_CALENDAR_QUERY_WINDOW_MS) {
        errors.push({
          code: PHASE10_ERROR_CODES.QUERY_WINDOW_TOO_LARGE,
          message: 'Calendar query window must not exceed 90 days',
          details: { field: 'end' },
        });
      }
    }
  }

  let organizationId: string | undefined = undefined;
  if (q.organizationId !== undefined && q.organizationId !== null && q.organizationId !== '') {
    const orgRes = validateUUID(q.organizationId, 'organizationId');
    if (!orgRes.isValid) errors.push(...orgRes.errors);
    else organizationId = orgRes.data!;
  }

  let teamId: string | undefined = undefined;
  if (q.teamId !== undefined && q.teamId !== null && q.teamId !== '') {
    const teamRes = validateUUID(q.teamId, 'teamId');
    if (!teamRes.isValid) errors.push(...teamRes.errors);
    else teamId = teamRes.data!;
  }

  let userId: string | undefined = undefined;
  if (q.userId !== undefined && q.userId !== null && q.userId !== '') {
    const userRes = validateUUID(q.userId, 'userId');
    if (!userRes.isValid) errors.push(...userRes.errors);
    else userId = userRes.data!;
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      start: startDate!.toISOString(),
      end: endDate!.toISOString(),
      organizationId,
      teamId,
      userId,
    },
  };
}

export function validateCalendarRespondRequest(body: unknown): ValidationResult<CalendarRespondRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const p = body as Record<string, unknown>;
  if (
    typeof p.responseStatus !== 'string' ||
    !VALID_CALENDAR_RESPONSE_STATUSES.includes(p.responseStatus as CalendarAttendeeResponseStatus)
  ) {
    return {
      isValid: false,
      errors: [
        createValidationError(
          'responseStatus',
          `responseStatus must be one of: ${VALID_CALENDAR_RESPONSE_STATUSES.join(', ')}`
        ),
      ],
    };
  }

  return {
    isValid: true,
    data: {
      responseStatus: p.responseStatus as CalendarAttendeeResponseStatus,
    },
  };
}

export function validateAddCalendarAttendeeRequest(body: unknown): ValidationResult<AddCalendarAttendeeRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const p = body as Record<string, unknown>;
  const uRes = validateUUID(p.userId, 'userId');
  if (!uRes.isValid) return { isValid: false, errors: uRes.errors };

  return {
    isValid: true,
    data: {
      userId: uRes.data!,
    },
  };
}

export function validateCalendarAvailabilityRequest(body: unknown): ValidationResult<CalendarAvailabilityRequest> {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be an object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ApiError[] = [];

  if (!Array.isArray(p.userIds) || p.userIds.length === 0) {
    errors.push(createValidationError('userIds', 'userIds must be a non-empty array of user UUIDs'));
  } else if (p.userIds.length > 50) {
    errors.push(createValidationError('userIds', 'Cannot query availability for more than 50 users at once'));
  }

  const validUserIds: string[] = [];
  if (Array.isArray(p.userIds)) {
    const set = new Set<string>();
    for (let i = 0; i < p.userIds.length; i++) {
      const uRes = validateUUID(p.userIds[i], `userIds[${i}]`);
      if (!uRes.isValid) errors.push(...uRes.errors);
      else set.add(uRes.data!);
    }
    validUserIds.push(...Array.from(set));
  }

  if (typeof p.start !== 'string') {
    errors.push(createValidationError('start', 'start is required and must be an ISO-8601 string'));
  }
  if (typeof p.end !== 'string') {
    errors.push(createValidationError('end', 'end is required and must be an ISO-8601 string'));
  }

  const startDate = typeof p.start === 'string' ? new Date(p.start) : null;
  const endDate = typeof p.end === 'string' ? new Date(p.end) : null;

  if (startDate && isNaN(startDate.getTime())) {
    errors.push(createValidationError('start', 'start is not a valid date'));
  }
  if (endDate && isNaN(endDate.getTime())) {
    errors.push(createValidationError('end', 'end is not a valid date'));
  }

  if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
    if (endDate.getTime() <= startDate.getTime()) {
      errors.push({
        code: PHASE10_ERROR_CODES.INVALID_EVENT_CHRONOLOGY,
        message: 'end date must be after start date',
        details: { field: 'end' },
      });
    } else {
      const windowMs = endDate.getTime() - startDate.getTime();
      if (windowMs > MAX_AVAILABILITY_QUERY_WINDOW_MS) {
        errors.push({
          code: PHASE10_ERROR_CODES.QUERY_WINDOW_TOO_LARGE,
          message: 'Availability query window must not exceed 30 days',
          details: { field: 'end' },
        });
      }
    }
  }

  let organizationId: string | undefined = undefined;
  if (p.organizationId !== undefined && p.organizationId !== null && p.organizationId !== '') {
    const orgRes = validateUUID(p.organizationId, 'organizationId');
    if (!orgRes.isValid) errors.push(...orgRes.errors);
    else organizationId = orgRes.data!;
  }

  if (errors.length > 0) return { isValid: false, errors };

  return {
    isValid: true,
    data: {
      userIds: validUserIds,
      start: startDate!.toISOString(),
      end: endDate!.toISOString(),
      organizationId,
    },
  };
}

// ============================================================================
// Phase 11: Advanced Meetings — Recording, Transcript, Media Session Validators
// ============================================================================

import type {
  NetworkQuality,
  JoinMediaSessionRequest,
  UpdateNetworkQualityRequest,
  ReportActiveSpeakerRequest,
  RequestTranscriptRequest,
} from '@teamtrack/shared-types';
import { PHASE11_ERROR_CODES } from '@teamtrack/shared-types';

const VALID_NETWORK_QUALITIES: NetworkQuality[] = [
  'UNKNOWN', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DISCONNECTED',
];

/**
 * Validates a start-recording request body.
 * No body fields required; returns validated empty object.
 * Idempotent — caller just needs to be authorized host.
 */
export function validateStartRecordingRequest(
  body: unknown
): ValidationResult<Record<string, never>> {
  // No body fields. We still validate body is an object (not array, not primitive).
  if (body !== null && body !== undefined && typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }
  return { isValid: true, data: {} };
}

/**
 * Validates a stop-recording request body.
 * No body fields required.
 */
export function validateStopRecordingRequest(
  body: unknown
): ValidationResult<Record<string, never>> {
  if (body !== null && body !== undefined && typeof body !== 'object') {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }
  return { isValid: true, data: {} };
}

/**
 * Validates a request-transcript request.
 * Optional: recordingId (UUID), language (string, max 10 chars).
 */
export function validateRequestTranscriptRequest(
  body: unknown
): ValidationResult<RequestTranscriptRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ReturnType<typeof createValidationError>[] = [];
  let recordingId: string | null | undefined = undefined;
  let language: string | undefined = undefined;

  if (p.recordingId !== undefined && p.recordingId !== null) {
    const r = validateUUID(p.recordingId as string, 'recordingId');
    if (!r.isValid) errors.push(...r.errors);
    else recordingId = r.data!;
  } else if (p.recordingId === null) {
    recordingId = null;
  }

  if (p.language !== undefined) {
    if (typeof p.language !== 'string' || p.language.trim().length === 0) {
      errors.push(createValidationError('language', 'language must be a non-empty string'));
    } else if (p.language.trim().length > 10) {
      errors.push(createValidationError('language', 'language code must be 10 characters or fewer'));
    } else {
      language = p.language.trim();
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { recordingId, language } };
}

/**
 * Validates a join-media-session request.
 * Optional: provider (string), providerSessionId (string).
 */
export function validateJoinMediaSessionRequest(
  body: unknown
): ValidationResult<JoinMediaSessionRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ReturnType<typeof createValidationError>[] = [];
  let provider: string | undefined;
  let providerSessionId: string | undefined;

  if (p.provider !== undefined) {
    if (typeof p.provider !== 'string' || p.provider.trim().length === 0) {
      errors.push(createValidationError('provider', 'provider must be a non-empty string'));
    } else if (p.provider.trim().length > 50) {
      errors.push(createValidationError('provider', 'provider must be 50 characters or fewer'));
    } else {
      provider = p.provider.trim();
    }
  }

  if (p.providerSessionId !== undefined) {
    if (typeof p.providerSessionId !== 'string' || p.providerSessionId.trim().length === 0) {
      errors.push(createValidationError('providerSessionId', 'providerSessionId must be a non-empty string'));
    } else if (p.providerSessionId.trim().length > 255) {
      errors.push(createValidationError('providerSessionId', 'providerSessionId must be 255 characters or fewer'));
    } else {
      providerSessionId = p.providerSessionId.trim();
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { provider, providerSessionId } };
}

/**
 * Validates a network quality report.
 * Required: quality (must be a valid NetworkQuality enum value).
 */
export function validateNetworkQualityReport(
  body: unknown
): ValidationResult<UpdateNetworkQualityRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ReturnType<typeof createValidationError>[] = [];

  if (typeof p.quality !== 'string' || !VALID_NETWORK_QUALITIES.includes(p.quality as NetworkQuality)) {
    errors.push(createValidationError(
      'quality',
      `quality must be one of: ${VALID_NETWORK_QUALITIES.join(', ')}`
    ));
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { quality: p.quality as NetworkQuality } };
}

/**
 * Validates an active speaker report.
 * Required: speakerUserId (UUID). Optional: audioLevel (0-100).
 */
export function validateActiveSpeakerReport(
  body: unknown
): ValidationResult<ReportActiveSpeakerRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a JSON object')],
    };
  }

  const p = body as Record<string, unknown>;
  const errors: ReturnType<typeof createValidationError>[] = [];
  let speakerUserId = '';
  let audioLevel: number | undefined;

  const uuidRes = validateUUID(p.speakerUserId as string, 'speakerUserId');
  if (!uuidRes.isValid) errors.push(...uuidRes.errors);
  else speakerUserId = uuidRes.data!;

  if (p.audioLevel !== undefined) {
    const level = Number(p.audioLevel);
    if (isNaN(level) || level < 0 || level > 100) {
      errors.push(createValidationError('audioLevel', 'audioLevel must be a number between 0 and 100'));
    } else {
      audioLevel = Math.round(level);
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { speakerUserId, audioLevel } };
}

/**
 * Validates artifact query with bounded pagination.
 * Optional: cursor (string), limit (1-50).
 */
export function validateArtifactQuery(
  query: unknown
): ValidationResult<{ cursor?: string; limit: number }> {
  const p = (typeof query === 'object' && query !== null ? query : {}) as Record<string, unknown>;
  const errors: ReturnType<typeof createValidationError>[] = [];
  let cursor: string | undefined;
  let limit = 20;

  if (p.cursor !== undefined) {
    if (typeof p.cursor !== 'string' || p.cursor.trim().length === 0) {
      errors.push(createValidationError('cursor', 'cursor must be a non-empty string'));
    } else {
      cursor = p.cursor.trim();
    }
  }

  if (p.limit !== undefined) {
    const l = Number(p.limit);
    if (isNaN(l) || l < 1 || l > 50) {
      errors.push(createValidationError('limit', 'limit must be between 1 and 50'));
    } else {
      limit = Math.floor(l);
    }
  }

  if (errors.length > 0) return { isValid: false, errors };
  return { isValid: true, data: { cursor, limit } };
}

/**
 * Validates meeting history query.
 * No required params. Returns default values if none provided.
 */
export function validateMeetingHistoryQuery(
  query: unknown
): ValidationResult<Record<string, never>> {
  // Meeting history is for a specific meetingId (path param), no body/query needed.
  return { isValid: true, data: {} };
}

/**
 * Validates participant history query.
 * No required params.
 */
export function validateParticipantHistoryQuery(
  query: unknown
): ValidationResult<Record<string, never>> {
  return { isValid: true, data: {} };
}

// ============================================================================
// Phase 13: Administration, Governance, User Settings & Security Validation
// ============================================================================

const LOCALE_REGEX = /^[a-zA-Z0-9_-]{2,20}$/;

/**
 * Validates user profile update request body.
 * Defends against mass assignment of security-sensitive attributes.
 */
export function validateUpdateUserProfile(body: unknown): ValidationResult<UpdateUserProfileRequest> {
  const errors: ApiError[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a valid JSON object')],
    };
  }

  const raw = body as Record<string, unknown>;

  // Block mass-assignment attempts of restricted fields
  const forbiddenKeys = ['id', 'email', 'role', 'status', 'createdAt', 'updatedAt', 'password', 'passwordHash'];
  for (const key of forbiddenKeys) {
    if (key in raw) {
      errors.push(createValidationError(key, `Field "${key}" cannot be modified via profile update`));
    }
  }

  const data: UpdateUserProfileRequest = {};
  let fieldCount = 0;

  if ('displayName' in raw) {
    fieldCount++;
    const dn = raw.displayName;
    if (typeof dn !== 'string') {
      errors.push(createValidationError('displayName', 'displayName must be a string'));
    } else {
      const trimmed = dn.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        errors.push(createValidationError('displayName', 'displayName must be between 1 and 100 characters'));
      } else if (CONTROL_CHARS_REGEX.test(trimmed)) {
        errors.push(createValidationError('displayName', 'displayName contains invalid control characters'));
      } else {
        data.displayName = trimmed;
      }
    }
  }

  if ('fullName' in raw) {
    fieldCount++;
    const fn = raw.fullName;
    if (fn === null) {
      data.fullName = null;
    } else if (typeof fn !== 'string') {
      errors.push(createValidationError('fullName', 'fullName must be a string or null'));
    } else {
      const trimmed = fn.trim();
      if (trimmed.length > 150) {
        errors.push(createValidationError('fullName', 'fullName cannot exceed 150 characters'));
      } else if (CONTROL_CHARS_REGEX.test(trimmed)) {
        errors.push(createValidationError('fullName', 'fullName contains invalid control characters'));
      } else {
        data.fullName = trimmed;
      }
    }
  }

  if ('avatarUrl' in raw) {
    fieldCount++;
    const av = raw.avatarUrl;
    if (av === null) {
      data.avatarUrl = null;
    } else if (typeof av !== 'string') {
      errors.push(createValidationError('avatarUrl', 'avatarUrl must be a string or null'));
    } else {
      const trimmed = av.trim();
      if (trimmed.length > 1024) {
        errors.push(createValidationError('avatarUrl', 'avatarUrl cannot exceed 1024 characters'));
      } else if (CONTROL_CHARS_REGEX.test(trimmed)) {
        errors.push(createValidationError('avatarUrl', 'avatarUrl contains invalid control characters'));
      } else {
        data.avatarUrl = trimmed;
      }
    }
  }

  if ('timezone' in raw) {
    fieldCount++;
    const tz = raw.timezone;
    if (tz === null) {
      data.timezone = null;
    } else if (typeof tz !== 'string') {
      errors.push(createValidationError('timezone', 'timezone must be a string or null'));
    } else {
      const trimmed = tz.trim();
      if (trimmed.length > 100) {
        errors.push(createValidationError('timezone', 'timezone cannot exceed 100 characters'));
      } else if (CONTROL_CHARS_REGEX.test(trimmed)) {
        errors.push(createValidationError('timezone', 'timezone contains invalid control characters'));
      } else {
        data.timezone = trimmed;
      }
    }
  }

  if ('locale' in raw) {
    fieldCount++;
    const loc = raw.locale;
    if (loc === null) {
      data.locale = null;
    } else if (typeof loc !== 'string') {
      errors.push(createValidationError('locale', 'locale must be a string or null'));
    } else {
      const trimmed = loc.trim();
      if (!LOCALE_REGEX.test(trimmed)) {
        errors.push(createValidationError('locale', 'locale must be a valid locale string (e.g. en, en-US, fr)'));
      } else {
        data.locale = trimmed;
      }
    }
  }

  if ('jobTitle' in raw) {
    fieldCount++;
    const jt = raw.jobTitle;
    if (jt === null) {
      data.jobTitle = null;
    } else if (typeof jt !== 'string') {
      errors.push(createValidationError('jobTitle', 'jobTitle must be a string or null'));
    } else {
      const trimmed = jt.trim();
      if (trimmed.length > 150) {
        errors.push(createValidationError('jobTitle', 'jobTitle cannot exceed 150 characters'));
      } else if (CONTROL_CHARS_REGEX.test(trimmed)) {
        errors.push(createValidationError('jobTitle', 'jobTitle contains invalid control characters'));
      } else {
        data.jobTitle = trimmed;
      }
    }
  }

  if (fieldCount === 0 && errors.length === 0) {
    errors.push(createValidationError('body', 'At least one profile field must be provided for update'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data };
}

/**
 * Validates password change request body.
 */
export function validateChangePassword(body: unknown): ValidationResult<ChangePasswordRequest> {
  const errors: ApiError[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a valid JSON object')],
    };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.currentPassword !== 'string' || raw.currentPassword.length === 0) {
    errors.push(createValidationError('currentPassword', 'Current password is required'));
  }

  if (typeof raw.newPassword !== 'string') {
    errors.push(createValidationError('newPassword', 'New password is required'));
  } else if (raw.newPassword.length < 8 || raw.newPassword.length > 128) {
    errors.push(createValidationError('newPassword', 'New password must be between 8 and 128 characters'));
  }

  if (
    typeof raw.currentPassword === 'string' &&
    typeof raw.newPassword === 'string' &&
    raw.currentPassword === raw.newPassword
  ) {
    errors.push({
      code: PHASE13_ERROR_CODES.PASSWORD_REUSE_FORBIDDEN,
      message: 'New password must be different from current password',
      details: { field: 'newPassword' },
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      currentPassword: raw.currentPassword as string,
      newPassword: raw.newPassword as string,
    },
  };
}

/**
 * Validates organization governance settings update request body.
 */
export function validateUpdateGovernanceSettings(
  body: unknown
): ValidationResult<UpdateGovernanceSettingsRequest> {
  const errors: ApiError[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a valid JSON object')],
    };
  }

  const raw = body as Record<string, unknown>;
  const data: UpdateGovernanceSettingsRequest = {};
  let fieldCount = 0;

  if ('aiAssistantEnabled' in raw) {
    fieldCount++;
    if (typeof raw.aiAssistantEnabled !== 'boolean') {
      errors.push(createValidationError('aiAssistantEnabled', 'aiAssistantEnabled must be a boolean'));
    } else {
      data.aiAssistantEnabled = raw.aiAssistantEnabled;
    }
  }

  if ('allowGuestInvites' in raw) {
    fieldCount++;
    if (typeof raw.allowGuestInvites !== 'boolean') {
      errors.push(createValidationError('allowGuestInvites', 'allowGuestInvites must be a boolean'));
    } else {
      data.allowGuestInvites = raw.allowGuestInvites;
    }
  }

  if ('defaultNotificationBehavior' in raw) {
    fieldCount++;
    const allowed: DefaultNotificationBehavior[] = ['all', 'mentions_only', 'muted'];
    if (!allowed.includes(raw.defaultNotificationBehavior as any)) {
      errors.push(
        createValidationError(
          'defaultNotificationBehavior',
          'defaultNotificationBehavior must be one of: all, mentions_only, muted'
        )
      );
    } else {
      data.defaultNotificationBehavior = raw.defaultNotificationBehavior as DefaultNotificationBehavior;
    }
  }

  if (fieldCount === 0 && errors.length === 0) {
    errors.push(createValidationError('body', 'At least one governance setting must be provided for update'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data };
}

/**
 * Validates organization member role and status update request body.
 */
export function validateUpdateMemberRoleAndStatus(
  body: unknown
): ValidationResult<UpdateOrganizationMemberRequest> {
  const errors: ApiError[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [createValidationError('body', 'Request body must be a valid JSON object')],
    };
  }

  const raw = body as Record<string, unknown>;
  const data: UpdateOrganizationMemberRequest = {};
  let fieldCount = 0;

  if ('role' in raw) {
    fieldCount++;
    const role = raw.role;
    if (role === 'owner') {
      errors.push({
        code: PHASE13_ERROR_CODES.CANNOT_PROMOTE_TO_OWNER,
        message: 'Cannot set owner role via role update; use ownership transfer',
        details: { field: 'role' },
      });
    } else if (role !== 'admin' && role !== 'member' && role !== 'guest') {
      errors.push(createValidationError('role', 'role must be one of: admin, member, guest'));
    } else {
      data.role = role;
    }
  }

  if ('status' in raw) {
    fieldCount++;
    const status = raw.status;
    if (status !== 'active' && status !== 'suspended') {
      errors.push(createValidationError('status', 'status must be one of: active, suspended'));
    } else {
      data.status = status;
    }
  }

  if (fieldCount === 0 && errors.length === 0) {
    errors.push(createValidationError('body', 'At least one of role or status must be provided for update'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data };
}

/**
 * Validates organization audit log query parameters.
 */
export function validateAuditLogQuery(query: unknown): ValidationResult<AuditLogQuery> {
  const errors: ApiError[] = [];
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return { isValid: true, data: { limit: 50 } };
  }

  const raw = query as Record<string, unknown>;
  const data: AuditLogQuery = {};

  if (raw.limit !== undefined) {
    const lim = Number(raw.limit);
    if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
      errors.push(createValidationError('limit', 'limit must be an integer between 1 and 100'));
    } else {
      data.limit = lim;
    }
  } else {
    data.limit = 50;
  }

  if (raw.cursor !== undefined) {
    if (typeof raw.cursor !== 'string' || raw.cursor.length === 0 || raw.cursor.length > 255) {
      errors.push(createValidationError('cursor', 'cursor must be a non-empty string up to 255 characters'));
    } else {
      data.cursor = raw.cursor;
    }
  }

  if (raw.action !== undefined) {
    if (typeof raw.action !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(raw.action)) {
      errors.push(createValidationError('action', 'action filter must be alphanumeric with underscores up to 100 characters'));
    } else {
      data.action = raw.action;
    }
  }

  if (raw.actorId !== undefined) {
    if (typeof raw.actorId !== 'string' || !UUID_REGEX.test(raw.actorId)) {
      errors.push(createValidationError('actorId', 'actorId filter must be a valid UUID'));
    } else {
      data.actorId = raw.actorId;
    }
  }

  if (raw.entityType !== undefined) {
    if (typeof raw.entityType !== 'string' || !/^[a-zA-Z0-9_.-]{1,50}$/.test(raw.entityType)) {
      errors.push(createValidationError('entityType', 'entityType filter must be alphanumeric with underscores up to 50 characters'));
    } else {
      data.entityType = raw.entityType;
    }
  }

  if (raw.startDate !== undefined) {
    if (typeof raw.startDate !== 'string' || isNaN(Date.parse(raw.startDate))) {
      errors.push(createValidationError('startDate', 'startDate must be a valid ISO-8601 date string'));
    } else {
      data.startDate = new Date(raw.startDate).toISOString();
    }
  }

  if (raw.endDate !== undefined) {
    if (typeof raw.endDate !== 'string' || isNaN(Date.parse(raw.endDate))) {
      errors.push(createValidationError('endDate', 'endDate must be a valid ISO-8601 date string'));
    } else {
      data.endDate = new Date(raw.endDate).toISOString();
    }
  }

  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
    errors.push(createValidationError('startDate', 'startDate cannot be after endDate'));
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data };
}

