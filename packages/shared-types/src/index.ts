export interface ApiHealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface ApiReadyResponse {
  status: 'ready' | 'unhealthy';
  service: string;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'degraded' | 'not_configured';
  };
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

// ============================================================================
// Identity & Authentication Types
// ============================================================================

export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string; // Optional: omitted in Web responses (transported via HttpOnly cookie)
  expiresIn: number; // in seconds (e.g. 900 for 15m)
  tokenType: 'Bearer';
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface DeviceRegistrationInput {
  deviceToken?: string;
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web';
  deviceModel?: string;
  appVersion?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  fullName?: string;
  device?: DeviceRegistrationInput;
}

export interface LoginRequest {
  email: string;
  password: string;
  device?: DeviceRegistrationInput;
}

export interface RefreshRequest {
  refreshToken?: string;
}

export interface LogoutResponse {
  message: string;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  role: 'user';
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

// ============================================================================
// Phase 5: Organization, Team, Channel & Authorization Types
// ============================================================================

// Organization
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'guest';
export type OrganizationStatus = 'active' | 'archived' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
}

export interface OrganizationMemberWithUser extends OrganizationMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
}

export interface AddOrganizationMemberRequest {
  userId: string;
  role?: 'admin' | 'member' | 'guest';
}

export interface UpdateOrganizationMemberRoleRequest {
  role: OrganizationRole;
}

export interface TransferOrganizationOwnershipRequest {
  newOwnerUserId: string;
}

// Team
export type TeamRole = 'lead' | 'member';

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamMemberWithUser extends TeamMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface TeamWithMembership extends Team {
  isMember: boolean;
  memberRole?: TeamRole;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
}

export interface AddTeamMemberRequest {
  userId: string;
  role?: TeamRole;
}

// Channel
export interface Channel {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  role: 'member';
  joinedAt: string;
}

export interface ChannelMemberWithUser extends ChannelMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export interface UpdateChannelRequest {
  name?: string;
  description?: string;
}

export interface AddChannelMemberRequest {
  userId: string;
}

// Error Codes
export const PHASE5_ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  SLUG_ALREADY_EXISTS: 'SLUG_ALREADY_EXISTS',
  CHANNEL_ALREADY_EXISTS: 'CHANNEL_ALREADY_EXISTS',
  MEMBER_ALREADY_EXISTS: 'MEMBER_ALREADY_EXISTS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_NOT_IN_ORG: 'USER_NOT_IN_ORG',
  USER_NOT_IN_TEAM: 'USER_NOT_IN_TEAM',
  TEAM_IS_PRIVATE: 'TEAM_IS_PRIVATE',
  CANNOT_MODIFY_OWNER: 'CANNOT_MODIFY_OWNER',
  OWNER_CANNOT_LEAVE: 'OWNER_CANNOT_LEAVE',
  CANNOT_MODIFY_GENERAL: 'CANNOT_MODIFY_GENERAL',
  CANNOT_ARCHIVE_GENERAL: 'CANNOT_ARCHIVE_GENERAL',
  CANNOT_DELETE_GENERAL: 'CANNOT_DELETE_GENERAL',
} as const;

export type Phase5ErrorCode = (typeof PHASE5_ERROR_CODES)[keyof typeof PHASE5_ERROR_CODES];

// ============================================================================
// Phase 6: Messaging, Conversations, Reactions & Realtime Types
// ============================================================================

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  reactionCode: string;
  createdAt: string;
}

export interface MessageReactionAggregate {
  reactionCode: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileId: string;
  createdAt: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  downloadUrl?: string;
}

export interface MessageAttachmentEnriched extends MessageAttachment {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  downloadUrl: string;
}

export interface Message {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  senderId: string;
  parentMessageId: string | null;
  content: string;
  contentType: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  idempotencyKey: string | null;
}

export interface MessageWithSender extends Message {
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    email: string;
  };
  reactions?: MessageReactionAggregate[];
  attachments?: MessageAttachment[];
}

export type ConversationType = 'direct' | 'group';

export interface Conversation {
  id: string;
  organizationId: string;
  type: ConversationType;
  directHash: string | null;
  title: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string;
}

export interface ConversationMemberWithUser extends ConversationMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface ConversationWithMembers extends Conversation {
  members: ConversationMemberWithUser[];
  unreadCount?: number;
}

export interface SendMessageRequest {
  content: string;
  contentType?: string;
  parentMessageId?: string;
  idempotencyKey?: string;
  attachmentFileIds?: string[];
}

export interface EditMessageRequest {
  content: string;
}

export interface AddReactionRequest {
  reactionCode: string;
}

export interface CreateConversationRequest {
  type: ConversationType;
  participantIds: string[];
  title?: string;
}

export interface MarkReadRequest {
  messageId?: string;
}

export interface ChannelReadState {
  id: string;
  channelId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
}

export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ChannelSyncResponse {
  channelId: string;
  syncedAt: string;
  messages: MessageWithSender[];
  deletedMessageIds: string[];
  reactions: MessageReaction[];
  readState: ChannelReadState | null;
  unreadCount: number;
}

export interface ConversationSyncResponse {
  conversationId: string;
  syncedAt: string;
  messages: MessageWithSender[];
  deletedMessageIds: string[];
  reactions: MessageReaction[];
  readState: ConversationMember | null;
  unreadCount: number;
}

// Real-Time Envelope & Events
export type RealtimeEventName =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'reaction.added'
  | 'reaction.removed'
  | 'channel.read'
  | 'conversation.read'
  | 'meeting.created'
  | 'meeting.started'
  | 'meeting.ended'
  | 'meeting.cancelled'
  | 'meeting.participant.joined'
  | 'meeting.participant.left'
  | 'meeting.participant.removed'
  | 'meeting.participant.admitted'
  | 'meeting.participant.audio_changed'
  | 'meeting.participant.video_changed'
  | 'meeting.participant.screen_share_changed'
  | 'meeting.hand_raised'
  | 'meeting.hand_lowered'
  | 'meeting.reaction'
  | 'meeting.host_changed'
  | 'webrtc.offer'
  | 'webrtc.answer'
  | 'webrtc.ice_candidate'
  | 'webrtc.renegotiate'
  | 'notification.created'
  | 'notification.read'
  | 'notification.unread'
  | 'notification.read_all'
  | 'notification.deleted'
  | 'calendar.event.created'
  | 'calendar.event.updated'
  | 'calendar.event.deleted'
  | 'calendar.attendee.added'
  | 'calendar.attendee.removed'
  | 'calendar.attendee.responded'
  // Phase 11: Advanced Meetings
  | 'meeting.active_speaker.changed'
  | 'meeting.recording.state_changed'
  | 'meeting.transcript.state_changed'
  | 'meeting.network_quality.changed'
  | 'meeting.locked'
  | 'meeting.unlocked'
  | 'meeting.participant.muted'
  | 'meeting.participant.screen_share_stopped'
  | 'meeting.participant.denied'
  | 'meeting.media_session.state_changed'
  | 'meeting.participant.media.changed';


export interface RealtimeEnvelope<T = unknown> {
  eventId: string;
  event: RealtimeEventName;
  topic: string;
  payload: T;
  timestamp: string;
  version: number;
}

export interface WebSocketTicketResponse {
  ticket: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export const PHASE6_ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  CANNOT_EDIT_DELETED_MESSAGE: 'CANNOT_EDIT_DELETED_MESSAGE',
  CANNOT_DELETE_DELETED_MESSAGE: 'CANNOT_DELETE_DELETED_MESSAGE',
  NOT_MESSAGE_AUTHOR: 'NOT_MESSAGE_AUTHOR',
  PARENT_MESSAGE_NOT_FOUND: 'PARENT_MESSAGE_NOT_FOUND',
  PARENT_MESSAGE_TARGET_MISMATCH: 'PARENT_MESSAGE_TARGET_MISMATCH',
  IDEMPOTENCY_KEY_COLLISION: 'IDEMPOTENCY_KEY_COLLISION',
  INVALID_PARTICIPANTS: 'INVALID_PARTICIPANTS',
  INVALID_REACTION_CODE: 'INVALID_REACTION_CODE',
  INVALID_CURSOR: 'INVALID_CURSOR',
  INVALID_WS_TICKET: 'INVALID_WS_TICKET',
  WS_TICKET_EXPIRED: 'WS_TICKET_EXPIRED',
  WS_TICKET_ALREADY_USED: 'WS_TICKET_ALREADY_USED',
  CONVERSATION_ALREADY_EXISTS: 'CONVERSATION_ALREADY_EXISTS',
} as const;

export type Phase6ErrorCode = (typeof PHASE6_ERROR_CODES)[keyof typeof PHASE6_ERROR_CODES];

// ============================================================================
// Phase 7: Meeting, Participant & WebRTC Signaling Types
// ============================================================================

export type MeetingStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';
export type MeetingParticipantStatus = 'waiting' | 'admitted' | 'joined' | 'left' | 'removed';
export type MeetingParticipantRole = 'host' | 'presenter' | 'attendee';

export interface Meeting {
  id: string;
  organizationId: string;
  hostId: string;
  title: string;
  description: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  status: MeetingStatus;
  waitingRoomEnabled: boolean;
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedBy?: string | null;
  recordingFileId: string | null;
  transcriptionFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingWithHost extends Meeting {
  host: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  userId: string;
  role: MeetingParticipantRole;
  status: MeetingParticipantStatus;
  joinedAt: string;
  leftAt: string | null;
  connectionStatus: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  updatedAt: string;
}

export interface MeetingParticipantWithUser extends MeetingParticipant {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface CreateMeetingRequest {
  organizationId: string;
  title: string;
  description?: string;
  scheduledStartAt?: string;
  waitingRoomEnabled?: boolean;
}

export interface UpdateMeetingRequest {
  title?: string;
  description?: string;
  waitingRoomEnabled?: boolean;
}

export interface TransferHostRequest {
  newHostUserId: string;
}

export interface UpdateMediaStateRequest {
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
  handRaised?: boolean;
}

export interface MeetingSyncResponse {
  meetingId: string;
  syncedAt: string;
  meeting: Meeting;
  participants: MeetingParticipantWithUser[];
  removedParticipantUserIds: string[];
}

export type WebRtcSignalType = 'offer' | 'answer' | 'ice_candidate' | 'renegotiate';

export interface WebRtcSignalPayload {
  meetingId: string;
  senderUserId: string;
  targetUserId: string;
  signalType: WebRtcSignalType;
  data: unknown;
}

export interface MeetingReactionPayload {
  meetingId: string;
  userId: string;
  reactionCode: string;
}

export interface MeetingHandPayload {
  meetingId: string;
  userId: string;
  handRaised: boolean;
}

export const PHASE7_ERROR_CODES = {
  MEETING_NOT_FOUND: 'MEETING_NOT_FOUND',
  MEETING_NOT_ACTIVE: 'MEETING_NOT_ACTIVE',
  MEETING_ALREADY_ENDED: 'MEETING_ALREADY_ENDED',
  MEETING_ALREADY_ACTIVE: 'MEETING_ALREADY_ACTIVE',
  INVALID_MEETING_TRANSITION: 'INVALID_MEETING_TRANSITION',
  NOT_MEETING_HOST: 'NOT_MEETING_HOST',
  NOT_MEETING_MEMBER: 'NOT_MEETING_MEMBER',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  PARTICIPANT_NOT_WAITING: 'PARTICIPANT_NOT_WAITING',
  PARTICIPANT_REMOVED: 'PARTICIPANT_REMOVED',
  PARTICIPANT_ALREADY_HOST: 'PARTICIPANT_ALREADY_HOST',
  CANNOT_REMOVE_HOST: 'CANNOT_REMOVE_HOST',
  CANNOT_TRANSFER_TO_SELF: 'CANNOT_TRANSFER_TO_SELF',
  CANNOT_SIGNAL_SELF: 'CANNOT_SIGNAL_SELF',
  FORBIDDEN_SIGNALING_TARGET: 'FORBIDDEN_SIGNALING_TARGET',
  SIGNALING_SENDER_NOT_JOINED: 'SIGNALING_SENDER_NOT_JOINED',
  SIGNALING_TARGET_NOT_JOINED: 'SIGNALING_TARGET_NOT_JOINED',
  MEDIA_STATE_FORBIDDEN: 'MEDIA_STATE_FORBIDDEN',
  INVALID_SIGNAL_PAYLOAD: 'INVALID_SIGNAL_PAYLOAD',
  CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS',
} as const;

export type Phase7ErrorCode = (typeof PHASE7_ERROR_CODES)[keyof typeof PHASE7_ERROR_CODES];

// ============================================================================
// Phase 8: File Uploads, Object Storage & Attachment Contracts
// ============================================================================

export const MAX_GENERAL_FILE_SIZE_BYTES = 104857600; // 100 MB
export const UPLOAD_INTENT_TTL_SECONDS = 900; // 15 minutes
export const DOWNLOAD_URL_TTL_SECONDS = 600; // 10 minutes

export type FileStatus = 'uploading' | 'ready' | 'failed';

export interface FileMetadata {
  id: string;
  organizationId: string;
  uploaderId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageDriver: string;
  status: FileStatus;
  checksumSha256: string | null;
  isDeleted: boolean;
  uploadExpiresAt: string | null; // ISO-8601 UTC
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  deletedAt: string | null; // ISO-8601 UTC
}

export interface FileUploadIntentRequest {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  checksumSha256?: string;
}

export interface FileUploadIntentResponse {
  fileId: string;
  uploadUrl: string;
  expiresAt: string; // ISO-8601 UTC
}

export interface FileWithDownloadUrl extends FileMetadata {
  downloadUrl: string; // Ephemeral presigned GET URL (never stored in PostgreSQL)
}

export const PHASE8_ERROR_CODES = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  INVALID_FILE_NAME: 'INVALID_FILE_NAME',
  UPLOAD_EXPIRED: 'UPLOAD_EXPIRED',
  FILE_NOT_READY: 'FILE_NOT_READY',
  FILE_ALREADY_READY: 'FILE_ALREADY_READY',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  CANNOT_DELETE_FILE: 'CANNOT_DELETE_FILE',
  ATTACHMENT_FORBIDDEN: 'ATTACHMENT_FORBIDDEN',
  ORGANIZATION_MISMATCH: 'ORGANIZATION_MISMATCH',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
} as const;

export type Phase8ErrorCode = (typeof PHASE8_ERROR_CODES)[keyof typeof PHASE8_ERROR_CODES];

// ============================================================================
// Phase 9: Notification Database Contracts & Client DTOs
// ============================================================================

export type NotificationType =
  | 'direct_message'
  | 'channel_message'
  | 'mention'
  | 'reply'
  | 'team_activity'
  | 'meeting_invite'
  | 'meeting_started'
  | 'meeting_update'
  | 'meeting_participant'
  | 'system'
  | 'calendar_invitation'
  | 'calendar_invitation_response'
  | 'calendar_event_updated'
  | 'calendar_event_cancelled'
  | 'calendar_reminder'
  | 'CALENDAR_INVITATION'
  | 'CALENDAR_INVITATION_RESPONSE'
  | 'CALENDAR_EVENT_UPDATED'
  | 'CALENDAR_EVENT_CANCELLED'
  | 'CALENDAR_REMINDER'
  // Phase 11: Advanced Meetings
  | 'meeting_recording_ready'
  | 'meeting_transcript_ready'
  | 'meeting_cancelled';

export type NotificationResourceType =
  | 'organization'
  | 'team'
  | 'channel'
  | 'conversation'
  | 'message'
  | 'meeting'
  | 'file'
  | 'user'
  | 'calendar_event'
  // Phase 11
  | 'recording'
  | 'transcript';

export interface NotificationDataPayload {
  route?: string;
  deepLink?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
  meetingId?: string;
  teamId?: string;
  organizationId?: string;
  actorDisplayName?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Persistence model representing a raw row in PostgreSQL notifications table.
 */
export interface NotificationRow {
  id: string;
  recipient_id: string;
  organization_id: string | null;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resource_type: NotificationResourceType | null;
  resource_id: string | null;
  data_payload: NotificationDataPayload;
  is_read: boolean;
  read_at: string | null;
  grouping_key: string | null;
  source_event_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  mutation_seq: string;
}

/**
 * Sanitized client-facing Notification DTO.
 * Internal persistence details (is_read, deleted_at, source_event_id, grouping_key)
 * are strictly omitted to decouple API clients from internal database lifecycle mechanisms.
 * mutationSeq is exposed as a string for safe 64-bit integer handling in client ordering.
 */
export interface Notification {
  id: string;
  recipientId: string;
  organizationId: string | null;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: NotificationResourceType | null;
  resourceId: string | null;
  dataPayload: NotificationDataPayload;
  readAt: string | null; // Canonical read state (null = unread, ISO-8601 UTC = read)
  createdAt: string;     // ISO-8601 UTC
  mutationSeq: string;   // Current row mutation sequence (serialized string)
}

/**
 * Cursor for deterministic keyset pagination (created_at DESC, id DESC).
 */
export interface NotificationCursor {
  createdAt: string;
  id: string;
}

/**
 * Cursor for multi-device delta catch-up synchronization (mutation_seq ASC, id ASC).
 */
export interface NotificationSyncCursor {
  mutationSeq: string;
  id: string;
}

export interface NotificationSequenceCursor {
  mutationSeq: string;
  id: string;
}

// Real-Time Notification Event Payloads
export interface NotificationCreatedPayload {
  notification: Notification;
  mutationSeq: string;
}

export interface NotificationReadPayload {
  notificationId: string;
  readAt: string;
  mutationSeq: string;
}

export interface NotificationUnreadPayload {
  notificationId: string;
  mutationSeq: string;
}

export interface NotificationReadAllPayload {
  organizationId?: string | null;
  affectedCount: number;
  unreadCount: number;
  readAt: string;
  mutationSeq: string;
}

export interface NotificationDeletedPayload {
  notificationId: string;
  mutationSeq: string;
}

// Notification Synchronization Contracts
export interface NotificationSyncQuery {
  activeCursor?: string;
  deletionCursor?: string;
  snapshotMutationSeq?: string;
  since?: string;
  limit?: number;
}

export interface NotificationSyncResponse {
  syncedAt: string;
  snapshotMutationSeq: string;
  upserted: Notification[];
  deletedIds: string[];
  unreadCount: number;
  activeCursor: string | null;
  deletionCursor: string | null;
  hasMoreActive: boolean;
  hasMoreDeletions: boolean;
}

export const PHASE9_ERROR_CODES = {
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  NOTIFICATION_FORBIDDEN: 'NOTIFICATION_FORBIDDEN',
  INVALID_NOTIFICATION_TYPE: 'INVALID_NOTIFICATION_TYPE',
  INVALID_RESOURCE_TYPE: 'INVALID_RESOURCE_TYPE',
  NOTIFICATION_ALREADY_READ: 'NOTIFICATION_ALREADY_READ',
  ORGANIZATION_MISMATCH: 'ORGANIZATION_MISMATCH',
} as const;

export type Phase9ErrorCode = (typeof PHASE9_ERROR_CODES)[keyof typeof PHASE9_ERROR_CODES];

// ============================================================================
// Phase 9D-A: Notification Preferences, Type Overrides & Channel Mutes
// ============================================================================

export interface UserNotificationPreferences {
  realtimeEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesRequest {
  realtimeEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
}

export interface UserNotificationTypePreference {
  notificationType: NotificationType;
  realtimeEnabled: boolean | null;
  pushEnabled: boolean | null;
  emailEnabled: boolean | null;
  updatedAt: string;
}

export interface UpdateNotificationTypePreferenceRequest {
  realtimeEnabled?: boolean | null;
  pushEnabled?: boolean | null;
  emailEnabled?: boolean | null;
}

export interface ChannelNotificationMute {
  channelId: string;
  muted: boolean;
  mutedUntil: string | null;
}

export interface MuteChannelRequest {
  mutedUntil?: string | null;
}

export interface NotificationDeliveryPolicyResult {
  realtimeAllowed: boolean;
  pushAllowed: boolean;
  emailAllowed: boolean;
  isChannelMuted: boolean;
  mutedUntil: string | null;
}

export const PHASE9D_ERROR_CODES = {
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  INVALID_NOTIFICATION_TYPE: 'INVALID_NOTIFICATION_TYPE',
  INVALID_MUTE_DURATION: 'INVALID_MUTE_DURATION',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
} as const;

export type Phase9DErrorCode = (typeof PHASE9D_ERROR_CODES)[keyof typeof PHASE9D_ERROR_CODES];

// ============================================================================
// Phase 9D-B: Push Notifications & Device Registration
// ============================================================================

export type PushPlatform = 'android' | 'ios' | 'desktop';
export type PushProvider = 'fcm' | 'apns';
export type PushDeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DISABLED';

export interface PushDevice {
  id: string;
  userId: string;
  platform: PushPlatform;
  provider: PushProvider;
  tokenHash: string; // SHA-256 hash of token (raw token is never returned)
  appVersion: string | null;
  deviceName: string | null;
  enabled: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPushDeviceRequest {
  platform: PushPlatform;
  provider: PushProvider;
  pushToken: string;
  appVersion?: string;
  deviceName?: string;
}

export interface PushNotificationPayload {
  notificationId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  resourceType?: NotificationResourceType;
  resourceId?: string;
  channelId?: string;
  conversationId?: string;
  meetingId?: string;
  deepLink?: string;
}

export interface PushDelivery {
  id: string;
  notificationId: string;
  deviceId: string;
  status: PushDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export const PHASE9D_B_ERROR_CODES = {
  INVALID_PUSH_PLATFORM: 'INVALID_PUSH_PLATFORM',
  INVALID_PUSH_PROVIDER: 'INVALID_PUSH_PROVIDER',
  INCOMPATIBLE_PLATFORM_PROVIDER: 'INCOMPATIBLE_PLATFORM_PROVIDER',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  INVALID_PUSH_TOKEN: 'INVALID_PUSH_TOKEN',
  PUSH_DELIVERY_FAILED: 'PUSH_DELIVERY_FAILED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
} as const;

export type Phase9DBErrorCode = (typeof PHASE9D_B_ERROR_CODES)[keyof typeof PHASE9D_B_ERROR_CODES];

// ============================================================================
// Phase 9D-C: Email Notifications
// ============================================================================

export type EmailDeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DISABLED';

export interface EmailDelivery {
  id: string;
  notificationId: string;
  recipientUserId: string;
  emailAddressSnapshot: string;
  status: EmailDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface EmailNotificationContent {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const PHASE9D_C_ERROR_CODES = {
  INVALID_EMAIL_RECIPIENT: 'INVALID_EMAIL_RECIPIENT',
  EMAIL_DELIVERY_FAILED: 'EMAIL_DELIVERY_FAILED',
  EMAIL_PROVIDER_NOT_CONFIGURED: 'EMAIL_PROVIDER_NOT_CONFIGURED',
  EMAIL_RECIPIENT_INACTIVE: 'EMAIL_RECIPIENT_INACTIVE',
} as const;

export type Phase9DCErrorCode = (typeof PHASE9D_C_ERROR_CODES)[keyof typeof PHASE9D_C_ERROR_CODES];

// ==============================================================================
// Phase 9E: Search & Discovery Types
// ==============================================================================

export type SearchResultType =
  | 'user'
  | 'team'
  | 'channel'
  | 'conversation'
  | 'message'
  | 'meeting'
  | 'file';

export type SearchCategoryFilter =
  | 'all'
  | 'users'
  | 'teams'
  | 'channels'
  | 'conversations'
  | 'messages'
  | 'meetings'
  | 'files';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  snippet?: string;
  timestamp?: string;
  relevance: number;
  resourceType: SearchResultType;
  resourceId: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchRequestQuery {
  q: string;
  type?: SearchCategoryFilter;
  cursor?: string;
  limit?: number;
  organizationId?: string;
}

export interface SearchResponseData {
  items: SearchResultItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalMatches?: number;
  grouped?: Partial<Record<SearchResultType, SearchResultItem[]>>;
}

export interface SearchCursorData {
  relevance: number;
  createdAt: string;
  id: string;
}

export const PHASE9E_ERROR_CODES = {
  EMPTY_QUERY: 'EMPTY_QUERY',
  QUERY_TOO_LONG: 'QUERY_TOO_LONG',
  INVALID_SEARCH_TYPE: 'INVALID_SEARCH_TYPE',
  INVALID_CURSOR: 'INVALID_CURSOR',
  INVALID_LIMIT: 'INVALID_LIMIT',
  SEARCH_FAILED: 'SEARCH_FAILED',
} as const;

export type Phase9EErrorCode = (typeof PHASE9E_ERROR_CODES)[keyof typeof PHASE9E_ERROR_CODES];

// ============================================================================
// Phase 10: Calendar & Scheduling Contracts
// ============================================================================

export type CalendarEventVisibility = 'PRIVATE' | 'ORGANIZATION' | 'TEAM';
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type CalendarAttendeeResponseStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';

export interface CalendarEvent {
  id: string;
  organizationId: string | null;
  teamId: string | null;
  organizerUserId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string; // ISO-8601 UTC
  endAt: string; // ISO-8601 UTC
  timezone: string; // IANA timezone string
  allDay: boolean;
  visibility: CalendarEventVisibility;
  status: CalendarEventStatus;
  meetingId: string | null;
  actualStartAt?: string | null; // ISO-8601 UTC
  actualEndAt?: string | null; // ISO-8601 UTC
  recurrenceRule: string | null;
  recurrenceUntil: string | null; // ISO-8601 UTC
  recurrenceTimezone: string | null;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  deletedAt: string | null; // ISO-8601 UTC
}

export interface CalendarEventAttendee {
  id: string;
  eventId: string;
  userId: string;
  responseStatus: CalendarAttendeeResponseStatus;
  isOrganizer: boolean;
  respondedAt: string | null; // ISO-8601 UTC
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
}

export interface CalendarEventAttendeeWithUser extends CalendarEventAttendee {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface CalendarReminder {
  id: string;
  eventId: string;
  userId: string;
  minutesBefore: number;
  isSent: boolean;
  sentAt: string | null; // ISO-8601 UTC
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
}

export interface CalendarEventWithDetails extends CalendarEvent {
  organizer: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
  attendees: CalendarEventAttendeeWithUser[];
  reminders?: CalendarReminder[];
  meeting?: {
    id: string;
    title: string;
    status: string;
  } | null;
  isVirtualInstance?: boolean;
  instanceDate?: string;
}

export interface CreateCalendarEventRequest {
  organizationId?: string | null;
  teamId?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  timezone?: string;
  allDay?: boolean;
  visibility?: CalendarEventVisibility;
  meetingId?: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  recurrenceTimezone?: string | null;
  attendeeUserIds?: string[];
  reminders?: number[]; // minutes before
  idempotencyKey?: string;
}

export interface UpdateCalendarEventRequest {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  allDay?: boolean;
  visibility?: CalendarEventVisibility;
  status?: CalendarEventStatus;
  meetingId?: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  recurrenceTimezone?: string | null;
  attendeeUserIds?: string[];
  reminders?: number[];
}

export interface CalendarEventQuery {
  start: string; // ISO-8601 UTC
  end: string; // ISO-8601 UTC
  organizationId?: string;
  teamId?: string;
  userId?: string;
}

export interface CalendarRespondRequest {
  responseStatus: CalendarAttendeeResponseStatus;
}

export interface AddCalendarAttendeeRequest {
  userId: string;
}

export interface CalendarAvailabilityRequest {
  userIds: string[];
  start: string; // ISO-8601 UTC
  end: string; // ISO-8601 UTC
  organizationId?: string;
}

export interface CalendarAvailabilityBlock {
  userId: string;
  start: string; // ISO-8601 UTC
  end: string; // ISO-8601 UTC
  status: 'busy' | 'tentative';
}

export interface CalendarAvailabilityResponse {
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  busyBlocks: Record<string, CalendarAvailabilityBlock[]>;
}

export interface CalendarSyncResponse {
  events: CalendarEventWithDetails[];
  syncedAt: string;
  windowStart: string;
  windowEnd: string;
}

export interface CalendarEventRealtimePayload {
  event: CalendarEventWithDetails;
  action: 'created' | 'updated' | 'deleted';
}

export const PHASE10_ERROR_CODES = {
  CALENDAR_EVENT_NOT_FOUND: 'CALENDAR_EVENT_NOT_FOUND',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_RECURRENCE_RULE: 'INVALID_RECURRENCE_RULE',
  PATHOLOGICAL_RECURRENCE: 'PATHOLOGICAL_RECURRENCE',
  INVALID_EVENT_CHRONOLOGY: 'INVALID_EVENT_CHRONOLOGY',
  QUERY_WINDOW_TOO_LARGE: 'QUERY_WINDOW_TOO_LARGE',
  MAX_ATTENDEES_EXCEEDED: 'MAX_ATTENDEES_EXCEEDED',
  ATTENDEE_NOT_FOUND: 'ATTENDEE_NOT_FOUND',
  ORGANIZER_CANNOT_BE_REMOVED: 'ORGANIZER_CANNOT_BE_REMOVED',
  UNAUTHORIZED_CALENDAR_ACCESS: 'UNAUTHORIZED_CALENDAR_ACCESS',
  UNAUTHORIZED_CALENDAR_MODIFICATION: 'UNAUTHORIZED_CALENDAR_MODIFICATION',
  CROSS_TENANT_CALENDAR_ACCESS: 'CROSS_TENANT_CALENDAR_ACCESS',
  MEETING_AUTHORIZATION_FAILED: 'MEETING_AUTHORIZATION_FAILED',
  REMINDER_MINUTES_INVALID: 'REMINDER_MINUTES_INVALID',
  DUPLICATE_IDEMPOTENT_EVENT: 'DUPLICATE_IDEMPOTENT_EVENT',
} as const;

export type Phase10ErrorCode = (typeof PHASE10_ERROR_CODES)[keyof typeof PHASE10_ERROR_CODES];

// ============================================================================
// Phase 11: Advanced Meetings — Media, Recording, Transcription, Artifacts
// ============================================================================

// --- Media Session Types ---

export type MediaSessionConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'disconnected';

export type MediaTrackState = 'published' | 'unpublished' | 'failed';

export type NetworkQuality = 'UNKNOWN' | 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED';

export interface MediaSession {
  id: string;
  meetingId: string;
  userId: string;
  provider: string;
  providerSessionId: string | null;
  connectionState: MediaSessionConnectionState;
  audioTrackState: MediaTrackState;
  videoTrackState: MediaTrackState;
  screenTrackState: MediaTrackState;
  joinedAt: string; // ISO-8601 UTC
  leftAt: string | null; // ISO-8601 UTC
  lastSeenAt: string; // ISO-8601 UTC
  reconnectCount: number;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
}

export interface JoinMediaSessionRequest {
  provider?: string;
  providerSessionId?: string;
}

export interface UpdateNetworkQualityRequest {
  quality: NetworkQuality;
}

export interface ReportActiveSpeakerRequest {
  speakerUserId: string;
  audioLevel?: number; // 0–100, optional
}

// --- Recording Types ---

export type RecordingStatus =
  | 'REQUESTED'
  | 'STARTING'
  | 'RECORDING'
  | 'STOPPING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface MeetingRecording {
  id: string;
  meetingId: string;
  startedBy: string; // userId
  stoppedBy: string | null; // userId
  status: RecordingStatus;
  mimeType: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  provider: string;
  consentNotifiedAt: string | null; // ISO-8601 UTC
  startedAt: string | null; // ISO-8601 UTC
  endedAt: string | null; // ISO-8601 UTC
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  // NOTE: storageKey is NEVER exposed. Use download-url endpoint.
}

export interface RecordingDownloadUrlResponse {
  downloadUrl: string; // Short-lived presigned URL
  expiresAt: string; // ISO-8601 UTC
}

// --- Transcript Types ---

export type TranscriptStatus =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  recordingId: string | null;
  requestedBy: string; // userId
  status: TranscriptStatus;
  language: string | null;
  wordCount: number | null;
  speakerCount: number | null;
  provider: string;
  startedAt: string | null; // ISO-8601 UTC
  completedAt: string | null; // ISO-8601 UTC
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  // NOTE: storageKey is NEVER exposed. Use download-url endpoint.
  // NOTE: Raw transcript content is never included in this response.
}

export interface TranscriptDownloadUrlResponse {
  downloadUrl: string; // Short-lived presigned URL
  expiresAt: string; // ISO-8601 UTC
}

export interface RequestTranscriptRequest {
  recordingId?: string | null;
  language?: string;
}

// --- Artifact Types ---

export type MeetingArtifactType = 'recording' | 'transcript';

export interface MeetingArtifact {
  id: string;
  meetingId: string;
  artifactType: MeetingArtifactType;
  recordingId: string | null;
  transcriptId: string | null;
  createdBy: string; // userId
  title: string | null;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  // Embedded status from referenced record
  status: RecordingStatus | TranscriptStatus;
}

// --- Meeting History ---

export interface MeetingHistory {
  meetingId: string;
  title: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  durationSeconds: number | null; // Derived from actual start/end only
  status: MeetingStatus;
  hostId: string;
  participantCount: number;
  hasRecording: boolean;
  hasTranscript: boolean;
  isLocked: boolean;
}

// --- Participant History ---

export interface ParticipantHistoryEntry {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: MeetingParticipantRole;
  finalStatus: MeetingParticipantStatus;
  joinedAt: string; // ISO-8601 UTC
  leftAt: string | null; // ISO-8601 UTC
  networkQuality: NetworkQuality;
}

// --- Active Speaker (Ephemeral) ---

export interface ActiveSpeakerPayload {
  meetingId: string;
  speakerUserId: string;
  audioLevel?: number;
  timestamp: string; // ISO-8601 UTC
}

// --- Network Quality (Bounded Telemetry) ---

export interface NetworkQualityPayload {
  meetingId: string;
  userId: string;
  quality: NetworkQuality;
  timestamp: string; // ISO-8601 UTC
}

// --- Recording State Changed ---

export interface RecordingStateChangedPayload {
  meetingId: string;
  recordingId: string;
  status: RecordingStatus;
  startedBy: string;
  timestamp: string; // ISO-8601 UTC
}

// --- Transcript State Changed ---

export interface TranscriptStateChangedPayload {
  meetingId: string;
  transcriptId: string;
  status: TranscriptStatus;
  requestedBy: string;
  timestamp: string; // ISO-8601 UTC
}

// --- Meeting Lock ---

export interface MeetingLockedPayload {
  meetingId: string;
  lockedBy: string; // userId
  timestamp: string; // ISO-8601 UTC
}

export interface MeetingUnlockedPayload {
  meetingId: string;
  unlockedBy: string; // userId
  timestamp: string; // ISO-8601 UTC
}

// --- Participant Moderation Payloads ---

export interface ParticipantMutedPayload {
  meetingId: string;
  userId: string;
  mutedBy: string;
  timestamp: string;
}

export interface ParticipantScreenShareStoppedPayload {
  meetingId: string;
  userId: string;
  stoppedBy: string;
  timestamp: string;
}

export interface ParticipantDeniedPayload {
  meetingId: string;
  userId: string;
  deniedBy: string;
  timestamp: string;
}

// --- Media Session State Changed ---

export interface MediaSessionStateChangedPayload {
  meetingId: string;
  userId: string;
  connectionState: MediaSessionConnectionState;
  reconnectCount: number;
  timestamp: string;
}

// --- Extend RealtimeEventName with Phase 11 events ---
// (Declaration merging not possible with type aliases; we re-export a superset.)

export type Phase11RealtimeEventName =
  | RealtimeEventName
  | 'meeting.active_speaker.changed'
  | 'meeting.recording.state_changed'
  | 'meeting.transcript.state_changed'
  | 'meeting.network_quality.changed'
  | 'meeting.locked'
  | 'meeting.unlocked'
  | 'meeting.participant.muted'
  | 'meeting.participant.screen_share_stopped'
  | 'meeting.participant.denied'
  | 'meeting.media_session.state_changed'
  | 'meeting.participant.media.changed';

// Phase 11 Error Codes
export const PHASE11_ERROR_CODES = {
  RECORDING_NOT_FOUND: 'RECORDING_NOT_FOUND',
  RECORDING_ALREADY_ACTIVE: 'RECORDING_ALREADY_ACTIVE',
  RECORDING_NOT_ACTIVE: 'RECORDING_NOT_ACTIVE',
  RECORDING_ACCESS_DENIED: 'RECORDING_ACCESS_DENIED',
  RECORDING_PROVIDER_ERROR: 'RECORDING_PROVIDER_ERROR',
  TRANSCRIPT_NOT_FOUND: 'TRANSCRIPT_NOT_FOUND',
  TRANSCRIPT_ACCESS_DENIED: 'TRANSCRIPT_ACCESS_DENIED',
  TRANSCRIPT_ALREADY_REQUESTED: 'TRANSCRIPT_ALREADY_REQUESTED',
  TRANSCRIPT_PROVIDER_ERROR: 'TRANSCRIPT_PROVIDER_ERROR',
  MEDIA_SESSION_NOT_FOUND: 'MEDIA_SESSION_NOT_FOUND',
  MEDIA_SESSION_ACCESS_DENIED: 'MEDIA_SESSION_ACCESS_DENIED',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  ARTIFACT_ACCESS_DENIED: 'ARTIFACT_ACCESS_DENIED',
  MEETING_LOCKED: 'MEETING_LOCKED',
  MEETING_ALREADY_LOCKED: 'MEETING_ALREADY_LOCKED',
  MEETING_NOT_LOCKED: 'MEETING_NOT_LOCKED',
  CANNOT_MUTE_HOST: 'CANNOT_MUTE_HOST',
  CANNOT_STOP_HOST_SCREEN_SHARE: 'CANNOT_STOP_HOST_SCREEN_SHARE',
  INVALID_NETWORK_QUALITY: 'INVALID_NETWORK_QUALITY',
  INVALID_RECORDING_STATE_TRANSITION: 'INVALID_RECORDING_STATE_TRANSITION',
  INVALID_TRANSCRIPT_STATE_TRANSITION: 'INVALID_TRANSCRIPT_STATE_TRANSITION',
  STORAGE_KEY_FORBIDDEN: 'STORAGE_KEY_FORBIDDEN',
  PROVIDER_CREDENTIALS_NOT_CONFIGURED: 'PROVIDER_CREDENTIALS_NOT_CONFIGURED',
  HISTORY_QUERY_WINDOW_TOO_LARGE: 'HISTORY_QUERY_WINDOW_TOO_LARGE',
  SENSITIVE_PROVIDER_CREDENTIAL_LEAK: 'SENSITIVE_PROVIDER_CREDENTIAL_LEAK',
} as const;

export type Phase11ErrorCode = (typeof PHASE11_ERROR_CODES)[keyof typeof PHASE11_ERROR_CODES];

// Extended Meeting type with Phase 11 fields
export interface MeetingWithAdvancedState extends Meeting {
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
}

// Extended sync response with Phase 11 state
export interface AdvancedMeetingSyncResponse extends MeetingSyncResponse {
  recording: MeetingRecording | null;
  transcript: MeetingTranscript | null;
  isLocked: boolean;
}

// --- Participant Lifecycle History ---
export type ParticipantLifecycleEventType =
  | 'waiting'
  | 'admitted'
  | 'denied'
  | 'joined'
  | 'left'
  | 'rejoined'
  | 'removed';

export interface ParticipantLifecycleEvent {
  id: string;
  meetingId: string;
  userId: string;
  eventType: ParticipantLifecycleEventType;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ParticipantHistoryItem {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  finalStatus: string;
  joinedAt: string;
  leftAt: string | null;
  networkQuality: string;
  events: Array<{
    id: string;
    eventType: ParticipantLifecycleEventType;
    actorId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

// ============================================================================
// Phase 12: AI Assistant & AI Workspace Types
// ============================================================================

export const PHASE12_ERROR_CODES = {
  AI_INVALID_REQUEST: 'AI_INVALID_REQUEST',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  AI_TOOL_NOT_ALLOWED: 'AI_TOOL_NOT_ALLOWED',
  AI_TOOL_INVALID_ARGUMENTS: 'AI_TOOL_INVALID_ARGUMENTS',
  AI_TOOL_UNAUTHORIZED: 'AI_TOOL_UNAUTHORIZED',
  AI_CONFIRMATION_REQUIRED: 'AI_CONFIRMATION_REQUIRED',
  AI_CONTEXT_TOO_LARGE: 'AI_CONTEXT_TOO_LARGE',
  AI_TOOL_LIMIT_EXCEEDED: 'AI_TOOL_LIMIT_EXCEEDED',
  AI_ACTION_FAILED: 'AI_ACTION_FAILED',
  AI_ACTION_ALREADY_RESOLVED: 'AI_ACTION_ALREADY_RESOLVED',
  AI_ACTION_EXPIRED: 'AI_ACTION_EXPIRED',
  AI_CONVERSATION_NOT_FOUND: 'AI_CONVERSATION_NOT_FOUND',
  AI_ACTION_NOT_FOUND: 'AI_ACTION_NOT_FOUND',
  AI_CONCURRENCY_EXCEEDED: 'AI_CONCURRENCY_EXCEEDED',
} as const;

export type Phase12ErrorCode = (typeof PHASE12_ERROR_CODES)[keyof typeof PHASE12_ERROR_CODES];

export type AIMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
  createdAt: string;
}

export interface AIConversation {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type AIActionStatus =
  | 'PROPOSED'
  | 'CONFIRMED'
  | 'EXECUTED'
  | 'FAILED'
  | 'CANCELLED';

export interface AIActionProposal {
  id: string;
  conversationId: string;
  userId: string;
  organizationId: string | null;
  toolName: string;
  toolArguments: Record<string, unknown>;
  status: AIActionStatus;
  summary: string;
  confirmationToken?: string; // High-entropy token returned only when first proposed; stored only as hash
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIChatRequest {
  conversationId?: string;
  message: string;
  organizationId?: string;
  context?: Record<string, unknown>;
  responseMode?: 'standard' | 'structured';
}

export interface AIConfirmActionRequest {
  confirmationToken: string;
}

export interface AIResponse {
  conversationId: string;
  message: AIMessage;
  actionProposal?: AIActionProposal;
  toolCalls?: AIToolCall[];
  executionTimeMs: number;
}

// ============================================================================
// Phase 13: Administration, Governance, User Settings & Security Management
// ============================================================================

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  jobTitle: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileRequest {
  displayName?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  locale?: string | null;
  jobTitle?: string | null;
}

export interface UserSecuritySummary {
  createdAt: string;
  lastLoginAt: string | null;
  activeSessionCount: number;
  activeDeviceCount: number;
  status: UserStatus;
}

export interface UserSessionItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  isCurrent: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type DefaultNotificationBehavior = 'all' | 'mentions_only' | 'muted';

export interface OrganizationGovernanceSettings {
  organizationId: string;
  aiAssistantEnabled: boolean;
  allowGuestInvites: boolean;
  defaultNotificationBehavior: DefaultNotificationBehavior;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateGovernanceSettingsRequest {
  aiAssistantEnabled?: boolean;
  allowGuestInvites?: boolean;
  defaultNotificationBehavior?: DefaultNotificationBehavior;
}

export type OrganizationMemberStatus = 'active' | 'invited' | 'suspended';

export interface UpdateOrganizationMemberRequest {
  role?: OrganizationRole;
  status?: OrganizationMemberStatus;
}

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogQuery {
  cursor?: string;
  limit?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogPaginatedResponse {
  items: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const PHASE13_ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROFILE_UPDATE_INVALID: 'PROFILE_UPDATE_INVALID',
  PASSWORD_CHANGE_INVALID: 'PASSWORD_CHANGE_INVALID',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  PASSWORD_REUSE_FORBIDDEN: 'PASSWORD_REUSE_FORBIDDEN',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_REVOKED: 'SESSION_ALREADY_REVOKED',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_ACCESS_DENIED: 'ORGANIZATION_ACCESS_DENIED',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  MEMBER_ACCESS_DENIED: 'MEMBER_ACCESS_DENIED',
  MEMBER_SUSPENDED: 'MEMBER_SUSPENDED',
  ROLE_CHANGE_FORBIDDEN: 'ROLE_CHANGE_FORBIDDEN',
  OWNER_OPERATION_FORBIDDEN: 'OWNER_OPERATION_FORBIDDEN',
  CANNOT_MODIFY_OWNER: 'CANNOT_MODIFY_OWNER',
  CANNOT_MODIFY_ADMIN: 'CANNOT_MODIFY_ADMIN',
  CANNOT_PROMOTE_TO_ADMIN: 'CANNOT_PROMOTE_TO_ADMIN',
  CANNOT_PROMOTE_TO_OWNER: 'CANNOT_PROMOTE_TO_OWNER',
  OWNER_CANNOT_LEAVE: 'OWNER_CANNOT_LEAVE',
  GOVERNANCE_UPDATE_FORBIDDEN: 'GOVERNANCE_UPDATE_FORBIDDEN',
  AUDIT_ACCESS_DENIED: 'AUDIT_ACCESS_DENIED',
  RESOURCE_ACCESS_DENIED: 'RESOURCE_ACCESS_DENIED',
  AI_ORGANIZATION_DISABLED: 'AI_ORGANIZATION_DISABLED',
  GUEST_INVITES_DISABLED: 'GUEST_INVITES_DISABLED',
  INVALID_AUDIT_FILTER: 'INVALID_AUDIT_FILTER',
} as const;

export type Phase13ErrorCode = (typeof PHASE13_ERROR_CODES)[keyof typeof PHASE13_ERROR_CODES];

export const PHASE14_ERROR_CODES = {
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  DEPENDENCY_FAILED: 'DEPENDENCY_FAILED',
  SHUTTING_DOWN: 'SHUTTING_DOWN',
} as const;

export type Phase14ErrorCode = (typeof PHASE14_ERROR_CODES)[keyof typeof PHASE14_ERROR_CODES];


