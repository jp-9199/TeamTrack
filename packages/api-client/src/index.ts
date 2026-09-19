import type {
  ApiHealthResponse,
  ApiResponse,
  AuthUser,
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
  LogoutResponse,
  Organization,
  OrganizationMemberWithUser,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  AddOrganizationMemberRequest,
  UpdateOrganizationMemberRoleRequest,
  TransferOrganizationOwnershipRequest,
  Team,
  TeamMember,
  TeamMemberWithUser,
  TeamWithMembership,
  CreateTeamRequest,
  UpdateTeamRequest,
  AddTeamMemberRequest,
  Channel,
  ChannelMemberWithUser,
  CreateChannelRequest,
  UpdateChannelRequest,
  AddChannelMemberRequest,
  MessageWithSender,
  MessageReaction,
  Conversation,
  ConversationWithMembers,
  ConversationMember,
  SendMessageRequest,
  EditMessageRequest,
  AddReactionRequest,
  CreateConversationRequest,
  MarkReadRequest,
  ChannelReadState,
  CursorPaginatedResponse,
  ChannelSyncResponse,
  ConversationSyncResponse,
  WebSocketTicketResponse,
  Meeting,
  MeetingWithHost,
  MeetingParticipant,
  MeetingParticipantWithUser,
  CreateMeetingRequest,
  TransferHostRequest,
  UpdateMediaStateRequest,
  MeetingSyncResponse,
  FileMetadata,
  FileUploadIntentRequest,
  FileUploadIntentResponse,
  Notification,
  NotificationType,
  NotificationSyncQuery,
  NotificationSyncResponse,
  NotificationReadAllPayload,
  RealtimeEnvelope,
  UserNotificationPreferences,
  UpdateNotificationPreferencesRequest,
  UserNotificationTypePreference,
  UpdateNotificationTypePreferenceRequest,
  ChannelNotificationMute,
  MuteChannelRequest,
  PushDevice,
  RegisterPushDeviceRequest,
  SearchRequestQuery,
  SearchResponseData,
  SearchResultItem,
  CalendarEvent,
  CalendarEventWithDetails,
  CalendarEventAttendee,
  CalendarEventAttendeeWithUser,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventQuery,
  CalendarRespondRequest,
  AddCalendarAttendeeRequest,
  CalendarAvailabilityRequest,
  CalendarAvailabilityResponse,
  CalendarSyncResponse,
  AIChatRequest,
  AIResponse,
  AIConversation,
  AIMessage,
  AIActionProposal,
  AIConfirmActionRequest,
  UserProfile,
  UpdateUserProfileRequest,
  UserSecuritySummary,
  UserSessionItem,
  ChangePasswordRequest,
  OrganizationGovernanceSettings,
  UpdateGovernanceSettingsRequest,
  UpdateOrganizationMemberRequest,
  AuditLogEntry,
  AuditLogQuery,
  AuditLogPaginatedResponse,
  ApiReadyResponse,
} from '@teamtrack/shared-types';


export interface NativeSecureStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  removeRefreshToken(): Promise<void>;
}

export interface ApiClientConfig {
  baseUrl: string;
  platform?: 'web' | 'desktop' | 'mobile';
  timeoutMs?: number;
  secureStorage?: NativeSecureStorage;
  onAuthFailure?: () => void;
}

export interface ApiClient {
  getBaseUrl(): string;
  getPlatform(): 'web' | 'desktop' | 'mobile';
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  checkHealth(): Promise<ApiHealthResponse>;
  getHealth(): Promise<ApiHealthResponse>;
  getReady(correlationId?: string): Promise<ApiReadyResponse>;

  // Authentication
  register(req: RegisterRequest): Promise<ApiResponse<AuthResponse>>;
  login(req: LoginRequest): Promise<ApiResponse<AuthResponse>>;
  refresh(): Promise<ApiResponse<AuthResponse>>;
  logout(): Promise<ApiResponse<LogoutResponse>>;
  getCurrentUser(): Promise<ApiResponse<AuthUser>>;
  fetchWithAuth<T = unknown>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;

  // Organizations
  createOrganization(req: CreateOrganizationRequest): Promise<ApiResponse<{ organization: Organization }>>;
  listOrganizations(): Promise<ApiResponse<{ organizations: Organization[] }>>;
  getOrganization(organizationId: string): Promise<ApiResponse<{ organization: Organization; memberRole: string }>>;
  updateOrganization(organizationId: string, req: UpdateOrganizationRequest): Promise<ApiResponse<{ organization: Organization }>>;
  archiveOrganization(organizationId: string): Promise<ApiResponse<{ organization: Organization }>>;
  transferOrganizationOwnership(organizationId: string, req: TransferOrganizationOwnershipRequest): Promise<ApiResponse<{ organization: Organization }>>;
  listOrganizationMembers(organizationId: string): Promise<ApiResponse<{ members: OrganizationMemberWithUser[] }>>;
  addOrganizationMember(organizationId: string, req: AddOrganizationMemberRequest): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>>;
  updateOrganizationMemberRole(organizationId: string, userId: string, req: UpdateOrganizationMemberRoleRequest): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>>;
  removeOrganizationMember(organizationId: string, userId: string): Promise<ApiResponse<{ message: string }>>;

  // Teams
  createTeam(organizationId: string, req: CreateTeamRequest): Promise<ApiResponse<{ team: Team }>>;
  listTeams(organizationId: string): Promise<ApiResponse<{ teams: TeamWithMembership[] }>>;
  getTeam(teamId: string): Promise<ApiResponse<{ team: Team; memberRole?: string }>>;
  joinTeam(teamId: string): Promise<ApiResponse<{ member: TeamMember }>>;
  updateTeam(teamId: string, req: UpdateTeamRequest): Promise<ApiResponse<{ team: Team }>>;
  archiveTeam(teamId: string): Promise<ApiResponse<{ team: Team }>>;
  listTeamMembers(teamId: string): Promise<ApiResponse<{ members: TeamMemberWithUser[] }>>;
  addTeamMember(teamId: string, req: AddTeamMemberRequest): Promise<ApiResponse<{ member: TeamMemberWithUser }>>;
  removeTeamMember(teamId: string, userId: string): Promise<ApiResponse<{ message: string }>>;

  // Channels
  createChannel(teamId: string, req: CreateChannelRequest): Promise<ApiResponse<{ channel: Channel }>>;
  listChannels(teamId: string): Promise<ApiResponse<{ channels: Channel[] }>>;
  getChannel(channelId: string): Promise<ApiResponse<{ channel: Channel; memberRole?: string }>>;
  updateChannel(channelId: string, req: UpdateChannelRequest): Promise<ApiResponse<{ channel: Channel }>>;
  archiveChannel(channelId: string): Promise<ApiResponse<{ channel: Channel }>>;
  listChannelMembers(channelId: string): Promise<ApiResponse<{ members: ChannelMemberWithUser[] }>>;
  addChannelMember(channelId: string, req: AddChannelMemberRequest): Promise<ApiResponse<{ member: ChannelMemberWithUser }>>;
  removeChannelMember(channelId: string, userId: string): Promise<ApiResponse<{ message: string }>>;
  listChannelMessages(channelId: string, options?: { cursor?: string; limit?: number }): Promise<ApiResponse<CursorPaginatedResponse<MessageWithSender>>>;
  sendChannelMessage(channelId: string, req: SendMessageRequest): Promise<ApiResponse<{ message: MessageWithSender }>>;
  syncChannel(channelId: string, since?: string): Promise<ApiResponse<ChannelSyncResponse>>;
  markChannelRead(channelId: string, req?: MarkReadRequest): Promise<ApiResponse<{ readState: ChannelReadState }>>;

  // Realtime WS Ticket
  requestWsTicket(): Promise<ApiResponse<WebSocketTicketResponse>>;
  createWsTicket(): Promise<ApiResponse<WebSocketTicketResponse>>;

  // Direct Conversations
  createConversation(req: CreateConversationRequest): Promise<ApiResponse<{ conversation: ConversationWithMembers }>>;
  listConversations(): Promise<ApiResponse<{ conversations: ConversationWithMembers[] }>>;
  getConversation(conversationId: string): Promise<ApiResponse<{ conversation: ConversationWithMembers }>>;
  listConversationMessages(conversationId: string, options?: { cursor?: string; limit?: number }): Promise<ApiResponse<CursorPaginatedResponse<MessageWithSender>>>;
  sendConversationMessage(conversationId: string, req: SendMessageRequest): Promise<ApiResponse<{ message: MessageWithSender }>>;
  syncConversation(conversationId: string, since?: string): Promise<ApiResponse<ConversationSyncResponse>>;
  markConversationRead(conversationId: string, req?: MarkReadRequest): Promise<ApiResponse<{ readState: ConversationMember }>>;

  // Messages & Reactions
  getMessage(messageId: string): Promise<ApiResponse<{ message: MessageWithSender }>>;
  editMessage(messageId: string, req: EditMessageRequest): Promise<ApiResponse<{ message: MessageWithSender }>>;
  deleteMessage(messageId: string): Promise<ApiResponse<{ message: MessageWithSender }>>;
  addReaction(messageId: string, req: AddReactionRequest): Promise<ApiResponse<{ reaction: MessageReaction }>>;
  removeReaction(messageId: string, reactionCode: string): Promise<ApiResponse<{ message: string }>>;

  // Meetings
  createMeeting(req: CreateMeetingRequest): Promise<ApiResponse<{ meeting: MeetingWithHost }>>;
  listMeetings(organizationId: string): Promise<ApiResponse<{ meetings: MeetingWithHost[] }>>;
  getMeeting(meetingId: string): Promise<ApiResponse<{ meeting: MeetingWithHost }>>;
  startMeeting(meetingId: string): Promise<ApiResponse<{ meeting: MeetingWithHost }>>;
  joinMeeting(meetingId: string): Promise<ApiResponse<{ meeting: Meeting; participant: MeetingParticipant }>>;
  leaveMeeting(meetingId: string): Promise<ApiResponse<{ message: string }>>;
  endMeeting(meetingId: string): Promise<ApiResponse<{ meeting: Meeting }>>;
  transferHost(meetingId: string, req: TransferHostRequest): Promise<ApiResponse<{ meeting: Meeting }>>;
  updateMediaState(meetingId: string, req: UpdateMediaStateRequest): Promise<ApiResponse<{ participant: MeetingParticipant }>>;
  listParticipants(meetingId: string): Promise<ApiResponse<{ participants: MeetingParticipantWithUser[] }>>;
  admitParticipant(meetingId: string, userId: string): Promise<ApiResponse<{ participant: MeetingParticipant }>>;
  removeParticipant(meetingId: string, userId: string): Promise<ApiResponse<{ message: string }>>;
  syncMeeting(meetingId: string, since?: string): Promise<ApiResponse<MeetingSyncResponse>>;

  // File Management
  createUploadIntent(
    organizationId: string,
    req: FileUploadIntentRequest
  ): Promise<ApiResponse<FileUploadIntentResponse>>;
  finalizeFile(fileId: string): Promise<ApiResponse<{ file: FileMetadata }>>;
  getFile(fileId: string): Promise<ApiResponse<{ file: FileMetadata }>>;
  getFileDownloadUrl(fileId: string): Promise<ApiResponse<{ downloadUrl: string }>>;
  deleteFile(fileId: string): Promise<ApiResponse<{ message: string }>>;
  listOrganizationFiles(
    organizationId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<ApiResponse<CursorPaginatedResponse<FileMetadata>>>;

  // Phase 9B: Notification Management
  listNotifications(
    options?: { cursor?: string; limit?: number }
  ): Promise<ApiResponse<CursorPaginatedResponse<Notification>>>;
  listUnreadNotifications(
    options?: { cursor?: string; limit?: number }
  ): Promise<ApiResponse<CursorPaginatedResponse<Notification>>>;
  getUnreadNotificationCount(
    organizationId?: string
  ): Promise<ApiResponse<{ unreadCount: number }>>;
  getNotification(
    id: string
  ): Promise<ApiResponse<{ notification: Notification }>>;
  markNotificationRead(
    id: string
  ): Promise<ApiResponse<{ notification: Notification }>>;
  markNotificationUnread(
    id: string
  ): Promise<ApiResponse<{ notification: Notification }>>;
  markAllNotificationsRead(
    organizationId?: string
  ): Promise<ApiResponse<{ message: string; updatedCount: number }>>;
  deleteNotification(
    id: string
  ): Promise<ApiResponse<{ message: string }>>;
  syncNotifications(
    query?: NotificationSyncQuery
  ): Promise<ApiResponse<NotificationSyncResponse>>;
  

  // Phase 9D-A: Notification Preferences & Channel Mute
  getNotificationPreferences(): Promise<ApiResponse<UserNotificationPreferences>>;
  updateNotificationPreferences(
    req: UpdateNotificationPreferencesRequest
  ): Promise<ApiResponse<UserNotificationPreferences>>;
  getNotificationTypePreferences(): Promise<ApiResponse<{ preferences: UserNotificationTypePreference[] }>>;
  updateNotificationTypePreference(
    notificationType: NotificationType,
    req: UpdateNotificationTypePreferenceRequest
  ): Promise<ApiResponse<UserNotificationTypePreference>>;
  getChannelNotificationMute(
    channelId: string
  ): Promise<ApiResponse<ChannelNotificationMute>>;
  muteChannel(
    channelId: string,
    req?: MuteChannelRequest
  ): Promise<ApiResponse<ChannelNotificationMute>>;
  unmuteChannel(
    channelId: string
  ): Promise<ApiResponse<ChannelNotificationMute>>;

  // Phase 9D-B: Push Devices
  registerPushDevice(
    req: RegisterPushDeviceRequest
  ): Promise<ApiResponse<PushDevice>>;
  listPushDevices(): Promise<ApiResponse<PushDevice[]>>;
  deletePushDevice(
    deviceId: string
  ): Promise<ApiResponse<void>>;

  // Phase 9E: Search & Discovery
  search(
    query: SearchRequestQuery
  ): Promise<ApiResponse<SearchResponseData>>;
  getSearchSuggestions(
    query: string,
    organizationId?: string
  ): Promise<ApiResponse<{ items: SearchResultItem[] }>>;

  // Phase 10: Calendar & Scheduling
  createCalendarEvent(
    req: CreateCalendarEventRequest
  ): Promise<ApiResponse<CalendarEventWithDetails>>;
  listCalendarEvents(
    query: CalendarEventQuery
  ): Promise<ApiResponse<CalendarSyncResponse>>;
  getCalendarEvent(
    eventId: string
  ): Promise<ApiResponse<CalendarEventWithDetails>>;
  updateCalendarEvent(
    eventId: string,
    req: UpdateCalendarEventRequest
  ): Promise<ApiResponse<CalendarEventWithDetails>>;
  deleteCalendarEvent(
    eventId: string
  ): Promise<ApiResponse<null>>;
  respondToCalendarEvent(
    eventId: string,
    req: CalendarRespondRequest
  ): Promise<ApiResponse<CalendarEventAttendee>>;
  addCalendarAttendee(
    eventId: string,
    req: AddCalendarAttendeeRequest
  ): Promise<ApiResponse<CalendarEventAttendeeWithUser>>;
  removeCalendarAttendee(
    eventId: string,
    userId: string
  ): Promise<ApiResponse<null>>;
  listCalendarAttendees(
    eventId: string
  ): Promise<ApiResponse<CalendarEventAttendeeWithUser[]>>;
  getCalendarAvailability(
    req: CalendarAvailabilityRequest
  ): Promise<ApiResponse<CalendarAvailabilityResponse>>;

  // AI Assistant & AI Workspace
  sendAiChat(req: AIChatRequest): Promise<ApiResponse<AIResponse>>;
  listAiConversations(organizationId?: string): Promise<ApiResponse<{ conversations: AIConversation[] }>>;
  getAiConversation(conversationId: string): Promise<ApiResponse<{ conversation: AIConversation; messages: AIMessage[] }>>;
  deleteAiConversation(conversationId: string): Promise<ApiResponse<{ message: string }>>;
  confirmAiAction(actionId: string, req: AIConfirmActionRequest): Promise<ApiResponse<{ action: AIActionProposal; result?: unknown }>>;
  cancelAiAction(actionId: string): Promise<ApiResponse<{ action: AIActionProposal }>>;

  // Phase 13: User Profile & Security
  getUserProfile(): Promise<ApiResponse<UserProfile>>;
  updateUserProfile(req: UpdateUserProfileRequest): Promise<ApiResponse<UserProfile>>;
  getUserSecurity(): Promise<ApiResponse<UserSecuritySummary>>;
  changePassword(req: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>>;
  getUserSessions(): Promise<ApiResponse<{ sessions: UserSessionItem[] }>>;
  revokeSession(sessionId: string): Promise<ApiResponse<{ message: string }>>;
  revokeAllSessions(preserveCurrent?: boolean): Promise<ApiResponse<{ message: string; revokedCount: number }>>;

  // Phase 13: Governance & Administration
  getOrganizationGovernance(organizationId: string): Promise<ApiResponse<OrganizationGovernanceSettings>>;
  updateOrganizationGovernance(organizationId: string, req: UpdateGovernanceSettingsRequest): Promise<ApiResponse<OrganizationGovernanceSettings>>;
  getOrganizationAuditLogs(organizationId: string, query?: AuditLogQuery): Promise<ApiResponse<AuditLogPaginatedResponse>>;
  updateOrganizationMember(organizationId: string, userId: string, req: UpdateOrganizationMemberRequest): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>>;
  suspendOrganizationMember(organizationId: string, userId: string): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>>;
  restoreOrganizationMember(organizationId: string, userId: string): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {

  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const platform = config.platform || 'web';
  const isWeb = platform === 'web';

  let inMemoryAccessToken: string | null = null;
  let activeRefreshPromise: Promise<ApiResponse<AuthResponse>> | null = null;

  async function handleAuthSuccess(data: AuthResponse): Promise<void> {
    inMemoryAccessToken = data.tokens.accessToken;

    if (!isWeb && data.tokens.refreshToken && config.secureStorage) {
      await config.secureStorage.setRefreshToken(data.tokens.refreshToken);
    }
  }

  async function handleAuthFailure(): Promise<void> {
    inMemoryAccessToken = null;

    if (!isWeb && config.secureStorage) {
      try {
        await config.secureStorage.removeRefreshToken();
      } catch {
        // Ignore removal error during cleanup
      }
    }

    if (config.onAuthFailure) {
      config.onAuthFailure();
    }
  }

  async function baseRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    headers.set('X-Client-Platform', platform);

    if (inMemoryAccessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
        credentials: isWeb ? 'include' : 'same-origin',
      });
      clearTimeout(timeoutId);

      const json = (await response.json()) as ApiResponse<T>;
      return json;
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: {
          code: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: err?.name === 'AbortError' ? 'Request timed out' : (err?.message || 'Network request failed'),
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Single-flight refresh mechanism: concurrent requests share the exact same refresh promise
  async function performSingleFlightRefresh(): Promise<ApiResponse<AuthResponse>> {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }

    activeRefreshPromise = (async () => {
      try {
        let refreshBody: RefreshRequest | undefined = undefined;

        if (!isWeb && config.secureStorage) {
          const storedToken = await config.secureStorage.getRefreshToken();
          if (!storedToken) {
            throw new Error('No refresh token available in secure storage');
          }
          refreshBody = { refreshToken: storedToken };
        }

        const res = await baseRequest<AuthResponse>('/api/v1/auth/refresh', {
          method: 'POST',
          body: refreshBody ? JSON.stringify(refreshBody) : undefined,
        });

        if (!res.success || !res.data) {
          await handleAuthFailure();
          return res;
        }

        await handleAuthSuccess(res.data);
        return res;
      } catch (err) {
        await handleAuthFailure();
        throw err;
      } finally {
        activeRefreshPromise = null;
      }
    })();

    return activeRefreshPromise;
  }

  const client: ApiClient = {
    getBaseUrl(): string {
      return baseUrl;
    },

    getPlatform(): 'web' | 'desktop' | 'mobile' {
      return platform;
    },

    getAccessToken(): string | null {
      return inMemoryAccessToken;
    },

    setAccessToken(token: string | null): void {
      inMemoryAccessToken = token;
    },

    async checkHealth(): Promise<ApiHealthResponse> {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
      return (await response.json()) as ApiHealthResponse;
    },

    async getHealth(): Promise<ApiHealthResponse> {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
      return (await response.json()) as ApiHealthResponse;
    },

    async getReady(correlationId?: string): Promise<ApiReadyResponse> {
      const headers: Record<string, string> = {};
      if (correlationId) {
        headers['X-Correlation-Id'] = correlationId;
      }
      const response = await fetch(`${baseUrl}/ready`, { headers });
      return (await response.json()) as ApiReadyResponse;
    },

    async register(req: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
      const res = await baseRequest<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(req),
      });

      if (res.success && res.data) {
        await handleAuthSuccess(res.data);
      }

      return res;
    },

    async login(req: LoginRequest): Promise<ApiResponse<AuthResponse>> {
      const res = await baseRequest<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(req),
      });

      if (res.success && res.data) {
        await handleAuthSuccess(res.data);
      }

      return res;
    },

    async refresh(): Promise<ApiResponse<AuthResponse>> {
      return performSingleFlightRefresh();
    },

    async logout(): Promise<ApiResponse<LogoutResponse>> {
      try {
        let refreshBody: RefreshRequest | undefined = undefined;

        if (!isWeb && config.secureStorage) {
          const storedToken = await config.secureStorage.getRefreshToken();
          if (storedToken) {
            refreshBody = { refreshToken: storedToken };
          }
        }

        const res = await baseRequest<LogoutResponse>('/api/v1/auth/logout', {
          method: 'POST',
          body: refreshBody ? JSON.stringify(refreshBody) : undefined,
        });

        return res;
      } finally {
        await handleAuthFailure();
      }
    },

    async getCurrentUser(): Promise<ApiResponse<AuthUser>> {
      const res = await this.fetchWithAuth<{ user: AuthUser }>('/api/v1/auth/me', {
        method: 'GET',
      });
      if (res.success && res.data) {
        return {
          success: true,
          data: res.data.user,
          timestamp: res.timestamp,
        };
      }
      return res as ApiResponse<any>;
    },

    async fetchWithAuth<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
      if (!inMemoryAccessToken && isWeb) {
        try {
          const refreshRes = await performSingleFlightRefresh();
          if (!refreshRes.success) {
            return {
              success: false,
              error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
              timestamp: new Date().toISOString(),
            };
          }
        } catch {
          return {
            success: false,
            error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
            timestamp: new Date().toISOString(),
          };
        }
      }

      const initialRes = await baseRequest<T>(endpoint, options);

      if (
        !initialRes.success &&
        (initialRes.error?.code === 'TOKEN_EXPIRED' || initialRes.error?.code === 'INVALID_TOKEN')
      ) {
        const refreshRes = await performSingleFlightRefresh();

        if (refreshRes.success) {
          return baseRequest<T>(endpoint, options);
        }

        return initialRes;
      }

      return initialRes;
    },

    // Organizations
    async createOrganization(req: CreateOrganizationRequest): Promise<ApiResponse<{ organization: Organization }>> {
      return this.fetchWithAuth<{ organization: Organization }>('/api/v1/organizations', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listOrganizations(): Promise<ApiResponse<{ organizations: Organization[] }>> {
      return this.fetchWithAuth<{ organizations: Organization[] }>('/api/v1/organizations', {
        method: 'GET',
      });
    },

    async getOrganization(organizationId: string): Promise<ApiResponse<{ organization: Organization; memberRole: string }>> {
      return this.fetchWithAuth<{ organization: Organization; memberRole: string }>(`/api/v1/organizations/${organizationId}`, {
        method: 'GET',
      });
    },

    async updateOrganization(organizationId: string, req: UpdateOrganizationRequest): Promise<ApiResponse<{ organization: Organization }>> {
      return this.fetchWithAuth<{ organization: Organization }>(`/api/v1/organizations/${organizationId}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async archiveOrganization(organizationId: string): Promise<ApiResponse<{ organization: Organization }>> {
      return this.fetchWithAuth<{ organization: Organization }>(`/api/v1/organizations/${organizationId}/archive`, {
        method: 'POST',
      });
    },

    async transferOrganizationOwnership(organizationId: string, req: TransferOrganizationOwnershipRequest): Promise<ApiResponse<{ organization: Organization }>> {
      return this.fetchWithAuth<{ organization: Organization }>(`/api/v1/organizations/${organizationId}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listOrganizationMembers(organizationId: string): Promise<ApiResponse<{ members: OrganizationMemberWithUser[] }>> {
      return this.fetchWithAuth<{ members: OrganizationMemberWithUser[] }>(`/api/v1/organizations/${organizationId}/members`, {
        method: 'GET',
      });
    },

    async addOrganizationMember(organizationId: string, req: AddOrganizationMemberRequest): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>> {
      return this.fetchWithAuth<{ member: OrganizationMemberWithUser }>(`/api/v1/organizations/${organizationId}/members`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async updateOrganizationMemberRole(organizationId: string, userId: string, req: UpdateOrganizationMemberRoleRequest): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>> {
      return this.fetchWithAuth<{ member: OrganizationMemberWithUser }>(`/api/v1/organizations/${organizationId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async removeOrganizationMember(organizationId: string, userId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(`/api/v1/organizations/${organizationId}/members/${userId}`, {
        method: 'DELETE',
      });
    },

    // Teams
    async createTeam(organizationId: string, req: CreateTeamRequest): Promise<ApiResponse<{ team: Team }>> {
      return this.fetchWithAuth<{ team: Team }>(`/api/v1/organizations/${organizationId}/teams`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listTeams(organizationId: string): Promise<ApiResponse<{ teams: TeamWithMembership[] }>> {
      return this.fetchWithAuth<{ teams: TeamWithMembership[] }>(`/api/v1/organizations/${organizationId}/teams`, {
        method: 'GET',
      });
    },

    async getTeam(teamId: string): Promise<ApiResponse<{ team: Team; memberRole?: string }>> {
      return this.fetchWithAuth<{ team: Team; memberRole?: string }>(`/api/v1/teams/${teamId}`, {
        method: 'GET',
      });
    },

    async joinTeam(teamId: string): Promise<ApiResponse<{ member: TeamMember }>> {
      return this.fetchWithAuth<{ member: TeamMember }>(`/api/v1/teams/${teamId}/join`, {
        method: 'POST',
      });
    },

    async updateTeam(teamId: string, req: UpdateTeamRequest): Promise<ApiResponse<{ team: Team }>> {
      return this.fetchWithAuth<{ team: Team }>(`/api/v1/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async archiveTeam(teamId: string): Promise<ApiResponse<{ team: Team }>> {
      return this.fetchWithAuth<{ team: Team }>(`/api/v1/teams/${teamId}/archive`, {
        method: 'POST',
      });
    },

    async listTeamMembers(teamId: string): Promise<ApiResponse<{ members: TeamMemberWithUser[] }>> {
      return this.fetchWithAuth<{ members: TeamMemberWithUser[] }>(`/api/v1/teams/${teamId}/members`, {
        method: 'GET',
      });
    },

    async addTeamMember(teamId: string, req: AddTeamMemberRequest): Promise<ApiResponse<{ member: TeamMemberWithUser }>> {
      return this.fetchWithAuth<{ member: TeamMemberWithUser }>(`/api/v1/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async removeTeamMember(teamId: string, userId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(`/api/v1/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
      });
    },

    // Channels
    async createChannel(teamId: string, req: CreateChannelRequest): Promise<ApiResponse<{ channel: Channel }>> {
      return this.fetchWithAuth<{ channel: Channel }>(`/api/v1/teams/${teamId}/channels`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listChannels(teamId: string): Promise<ApiResponse<{ channels: Channel[] }>> {
      return this.fetchWithAuth<{ channels: Channel[] }>(`/api/v1/teams/${teamId}/channels`, {
        method: 'GET',
      });
    },

    async getChannel(channelId: string): Promise<ApiResponse<{ channel: Channel }>> {
      return this.fetchWithAuth<{ channel: Channel }>(`/api/v1/channels/${channelId}`, {
        method: 'GET',
      });
    },

    async updateChannel(channelId: string, req: UpdateChannelRequest): Promise<ApiResponse<{ channel: Channel }>> {
      return this.fetchWithAuth<{ channel: Channel }>(`/api/v1/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async archiveChannel(channelId: string): Promise<ApiResponse<{ channel: Channel }>> {
      return this.fetchWithAuth<{ channel: Channel }>(`/api/v1/channels/${channelId}/archive`, {
        method: 'POST',
      });
    },

    async listChannelMembers(channelId: string): Promise<ApiResponse<{ members: ChannelMemberWithUser[] }>> {
      return this.fetchWithAuth<{ members: ChannelMemberWithUser[] }>(`/api/v1/channels/${channelId}/members`, {
        method: 'GET',
      });
    },

    async addChannelMember(channelId: string, req: AddChannelMemberRequest): Promise<ApiResponse<{ member: ChannelMemberWithUser }>> {
      return this.fetchWithAuth<{ member: ChannelMemberWithUser }>(`/api/v1/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async removeChannelMember(channelId: string, userId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(`/api/v1/channels/${channelId}/members/${userId}`, {
        method: 'DELETE',
      });
    },

    // Auth / Realtime
    async requestWsTicket(): Promise<ApiResponse<WebSocketTicketResponse>> {
      return this.fetchWithAuth<WebSocketTicketResponse>('/api/v1/auth/ws-ticket', {
        method: 'POST',
      });
    },

    // Channel Messaging & Sync
    async sendChannelMessage(channelId: string, req: SendMessageRequest): Promise<ApiResponse<{ message: MessageWithSender }>> {
      return this.fetchWithAuth<{ message: MessageWithSender }>(`/api/v1/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listChannelMessages(
      channelId: string,
      options?: { cursor?: string; limit?: number }
    ): Promise<ApiResponse<CursorPaginatedResponse<MessageWithSender>>> {
      const params = new URLSearchParams();
      if (options?.cursor) params.set('cursor', options.cursor);
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';

      return this.fetchWithAuth<CursorPaginatedResponse<MessageWithSender>>(`/api/v1/channels/${channelId}/messages${qs}`, {
        method: 'GET',
      });
    },

    async syncChannel(channelId: string, since: string): Promise<ApiResponse<ChannelSyncResponse>> {
      const qs = `?since=${encodeURIComponent(since)}`;
      return this.fetchWithAuth<ChannelSyncResponse>(`/api/v1/channels/${channelId}/sync${qs}`, {
        method: 'GET',
      });
    },

    async markChannelRead(channelId: string, req?: MarkReadRequest): Promise<ApiResponse<{ readState: ChannelReadState }>> {
      return this.fetchWithAuth<{ readState: ChannelReadState }>(`/api/v1/channels/${channelId}/read`, {
        method: 'POST',
        body: JSON.stringify(req || {}),
      });
    },

    // Conversations
    async createConversation(req: CreateConversationRequest): Promise<ApiResponse<{ conversation: ConversationWithMembers }>> {
      return this.fetchWithAuth<{ conversation: ConversationWithMembers }>('/api/v1/conversations', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listConversations(): Promise<ApiResponse<{ conversations: ConversationWithMembers[] }>> {
      return this.fetchWithAuth<{ conversations: ConversationWithMembers[] }>('/api/v1/conversations', {
        method: 'GET',
      });
    },

    async getConversation(conversationId: string): Promise<ApiResponse<{ conversation: ConversationWithMembers }>> {
      return this.fetchWithAuth<{ conversation: ConversationWithMembers }>(`/api/v1/conversations/${conversationId}`, {
        method: 'GET',
      });
    },

    async sendConversationMessage(
      conversationId: string,
      req: SendMessageRequest
    ): Promise<ApiResponse<{ message: MessageWithSender }>> {
      return this.fetchWithAuth<{ message: MessageWithSender }>(`/api/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listConversationMessages(
      conversationId: string,
      options?: { cursor?: string; limit?: number }
    ): Promise<ApiResponse<CursorPaginatedResponse<MessageWithSender>>> {
      const params = new URLSearchParams();
      if (options?.cursor) params.set('cursor', options.cursor);
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';

      return this.fetchWithAuth<CursorPaginatedResponse<MessageWithSender>>(
        `/api/v1/conversations/${conversationId}/messages${qs}`,
        {
          method: 'GET',
        }
      );
    },

    async syncConversation(conversationId: string, since: string): Promise<ApiResponse<ConversationSyncResponse>> {
      const qs = `?since=${encodeURIComponent(since)}`;
      return this.fetchWithAuth<ConversationSyncResponse>(`/api/v1/conversations/${conversationId}/sync${qs}`, {
        method: 'GET',
      });
    },

    async markConversationRead(
      conversationId: string,
      req?: MarkReadRequest
    ): Promise<ApiResponse<{ readState: ConversationMember }>> {
      return this.fetchWithAuth<{ readState: ConversationMember }>(`/api/v1/conversations/${conversationId}/read`, {
        method: 'POST',
        body: JSON.stringify(req || {}),
      });
    },

    // Messages & Reactions
    async getMessage(messageId: string): Promise<ApiResponse<{ message: MessageWithSender }>> {
      return this.fetchWithAuth<{ message: MessageWithSender }>(`/api/v1/messages/${messageId}`, {
        method: 'GET',
      });
    },

    async editMessage(messageId: string, req: EditMessageRequest): Promise<ApiResponse<{ message: MessageWithSender }>> {
      return this.fetchWithAuth<{ message: MessageWithSender }>(`/api/v1/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async deleteMessage(messageId: string): Promise<ApiResponse<{ message: MessageWithSender }>> {
      return this.fetchWithAuth<{ message: MessageWithSender }>(`/api/v1/messages/${messageId}`, {
        method: 'DELETE',
      });
    },

    async addReaction(messageId: string, req: AddReactionRequest): Promise<ApiResponse<{ reaction: MessageReaction }>> {
      return this.fetchWithAuth<{ reaction: MessageReaction }>(`/api/v1/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async removeReaction(messageId: string, reactionCode: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(
        `/api/v1/messages/${messageId}/reactions/${encodeURIComponent(reactionCode)}`,
        {
          method: 'DELETE',
        }
      );
    },

    // Realtime WS Ticket
    async createWsTicket(): Promise<ApiResponse<WebSocketTicketResponse>> {
      return this.fetchWithAuth<WebSocketTicketResponse>('/api/v1/auth/ws-ticket', {
        method: 'POST',
      });
    },

    // Meetings
    async createMeeting(req: CreateMeetingRequest): Promise<ApiResponse<{ meeting: MeetingWithHost }>> {
      return this.fetchWithAuth<{ meeting: MeetingWithHost }>('/api/v1/meetings', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listMeetings(organizationId: string): Promise<ApiResponse<{ meetings: MeetingWithHost[] }>> {
      return this.fetchWithAuth<{ meetings: MeetingWithHost[] }>(
        `/api/v1/meetings?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: 'GET',
        }
      );
    },

    async getMeeting(meetingId: string): Promise<ApiResponse<{ meeting: MeetingWithHost }>> {
      return this.fetchWithAuth<{ meeting: MeetingWithHost }>(`/api/v1/meetings/${meetingId}`, {
        method: 'GET',
      });
    },

    async startMeeting(meetingId: string): Promise<ApiResponse<{ meeting: MeetingWithHost }>> {
      return this.fetchWithAuth<{ meeting: MeetingWithHost }>(`/api/v1/meetings/${meetingId}/start`, {
        method: 'POST',
      });
    },

    async joinMeeting(meetingId: string): Promise<ApiResponse<{ meeting: Meeting; participant: MeetingParticipant }>> {
      return this.fetchWithAuth<{ meeting: Meeting; participant: MeetingParticipant }>(`/api/v1/meetings/${meetingId}/join`, {
        method: 'POST',
      });
    },

    async leaveMeeting(meetingId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(`/api/v1/meetings/${meetingId}/leave`, {
        method: 'POST',
      });
    },

    async endMeeting(meetingId: string): Promise<ApiResponse<{ meeting: Meeting }>> {
      return this.fetchWithAuth<{ meeting: Meeting }>(`/api/v1/meetings/${meetingId}/end`, {
        method: 'POST',
      });
    },

    async transferHost(meetingId: string, req: TransferHostRequest): Promise<ApiResponse<{ meeting: Meeting }>> {
      return this.fetchWithAuth<{ meeting: Meeting }>(`/api/v1/meetings/${meetingId}/host-transfer`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async updateMediaState(meetingId: string, req: UpdateMediaStateRequest): Promise<ApiResponse<{ participant: MeetingParticipant }>> {
      return this.fetchWithAuth<{ participant: MeetingParticipant }>(`/api/v1/meetings/${meetingId}/media-state`, {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async listParticipants(meetingId: string): Promise<ApiResponse<{ participants: MeetingParticipantWithUser[] }>> {
      return this.fetchWithAuth<{ participants: MeetingParticipantWithUser[] }>(`/api/v1/meetings/${meetingId}/participants`, {
        method: 'GET',
      });
    },

    async admitParticipant(meetingId: string, userId: string): Promise<ApiResponse<{ participant: MeetingParticipant }>> {
      return this.fetchWithAuth<{ participant: MeetingParticipant }>(`/api/v1/meetings/${meetingId}/participants/${userId}/admit`, {
        method: 'POST',
      });
    },

    async removeParticipant(meetingId: string, userId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(`/api/v1/meetings/${meetingId}/participants/${userId}/remove`, {
        method: 'POST',
      });
    },

    async syncMeeting(meetingId: string, since?: string): Promise<ApiResponse<MeetingSyncResponse>> {
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      return this.fetchWithAuth<MeetingSyncResponse>(`/api/v1/meetings/${meetingId}/sync${qs}`, {
        method: 'GET',
      });
    },

    // File Management
    async createUploadIntent(
      organizationId: string,
      req: FileUploadIntentRequest
    ): Promise<ApiResponse<FileUploadIntentResponse>> {
      return this.fetchWithAuth<FileUploadIntentResponse>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/files/upload-intent`,
        {
          method: 'POST',
          body: JSON.stringify(req),
        }
      );
    },

    async finalizeFile(fileId: string): Promise<ApiResponse<{ file: FileMetadata }>> {
      return this.fetchWithAuth<{ file: FileMetadata }>(
        `/api/v1/files/${encodeURIComponent(fileId)}/finalize`,
        {
          method: 'POST',
        }
      );
    },

    async getFile(fileId: string): Promise<ApiResponse<{ file: FileMetadata }>> {
      return this.fetchWithAuth<{ file: FileMetadata }>(
        `/api/v1/files/${encodeURIComponent(fileId)}`,
        {
          method: 'GET',
        }
      );
    },

    async getFileDownloadUrl(fileId: string): Promise<ApiResponse<{ downloadUrl: string }>> {
      return this.fetchWithAuth<{ downloadUrl: string }>(
        `/api/v1/files/${encodeURIComponent(fileId)}/download-url`,
        {
          method: 'GET',
        }
      );
    },

    async deleteFile(fileId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(
        `/api/v1/files/${encodeURIComponent(fileId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async listOrganizationFiles(
      organizationId: string,
      options?: { cursor?: string; limit?: number }
    ): Promise<ApiResponse<CursorPaginatedResponse<FileMetadata>>> {
      const params = new URLSearchParams();
      if (options?.cursor) params.set('cursor', options.cursor);
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return this.fetchWithAuth<CursorPaginatedResponse<FileMetadata>>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/files${qs}`,
        {
          method: 'GET',
        }
      );
    },

    // Phase 9B: Notification Management
    async listNotifications(
      options?: { cursor?: string; limit?: number }
    ): Promise<ApiResponse<CursorPaginatedResponse<Notification>>> {
      const params = new URLSearchParams();
      if (options?.cursor) params.set('cursor', options.cursor);
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return this.fetchWithAuth<CursorPaginatedResponse<Notification>>(
        `/api/v1/notifications${qs}`,
        {
          method: 'GET',
        }
      );
    },

    async listUnreadNotifications(
      options?: { cursor?: string; limit?: number }
    ): Promise<ApiResponse<CursorPaginatedResponse<Notification>>> {
      const params = new URLSearchParams();
      if (options?.cursor) params.set('cursor', options.cursor);
      if (options?.limit) params.set('limit', String(options.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return this.fetchWithAuth<CursorPaginatedResponse<Notification>>(
        `/api/v1/notifications/unread${qs}`,
        {
          method: 'GET',
        }
      );
    },

    async getUnreadNotificationCount(
      organizationId?: string
    ): Promise<ApiResponse<{ unreadCount: number }>> {
      const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
      return this.fetchWithAuth<{ unreadCount: number }>(
        `/api/v1/notifications/unread-count${qs}`,
        {
          method: 'GET',
        }
      );
    },

    async getNotification(
      notificationId: string
    ): Promise<ApiResponse<{ notification: Notification }>> {
      return this.fetchWithAuth<{ notification: Notification }>(
        `/api/v1/notifications/${encodeURIComponent(notificationId)}`,
        {
          method: 'GET',
        }
      );
    },

    async markNotificationRead(
      notificationId: string
    ): Promise<ApiResponse<{ notification: Notification }>> {
      return this.fetchWithAuth<{ notification: Notification }>(
        `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
        {
          method: 'POST',
        }
      );
    },

    async markNotificationUnread(
      notificationId: string
    ): Promise<ApiResponse<{ notification: Notification }>> {
      return this.fetchWithAuth<{ notification: Notification }>(
        `/api/v1/notifications/${encodeURIComponent(notificationId)}/unread`,
        {
          method: 'POST',
        }
      );
    },

    async markAllNotificationsRead(
      organizationId?: string
    ): Promise<ApiResponse<{ message: string; updatedCount: number }>> {
      return this.fetchWithAuth<{ message: string; updatedCount: number }>(
        '/api/v1/notifications/read-all',
        {
          method: 'POST',
          body: organizationId ? JSON.stringify({ organizationId }) : undefined,
        }
      );
    },

    async deleteNotification(
      notificationId: string
    ): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(
        `/api/v1/notifications/${encodeURIComponent(notificationId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async syncNotifications(
      query?: NotificationSyncQuery
    ): Promise<ApiResponse<NotificationSyncResponse>> {
      const params = new URLSearchParams();
      if (query?.activeCursor) params.set('activeCursor', query.activeCursor);
      if (query?.deletionCursor) params.set('deletionCursor', query.deletionCursor);
      if (query?.snapshotMutationSeq) params.set('snapshotMutationSeq', query.snapshotMutationSeq);
      if (query?.since) params.set('since', query.since);
      if (query?.limit !== undefined) params.set('limit', String(query.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      return this.fetchWithAuth<NotificationSyncResponse>(
        `/api/v1/notifications/sync${qs}`,
        {
          method: 'GET',
        }
      );
    },

    // Phase 9D-A: Notification Preferences & Channel Mute
    async getNotificationPreferences(): Promise<ApiResponse<UserNotificationPreferences>> {
      return this.fetchWithAuth<UserNotificationPreferences>('/api/v1/notifications/preferences', {
        method: 'GET',
      });
    },

    async updateNotificationPreferences(
      req: UpdateNotificationPreferencesRequest
    ): Promise<ApiResponse<UserNotificationPreferences>> {
      return this.fetchWithAuth<UserNotificationPreferences>('/api/v1/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async getNotificationTypePreferences(): Promise<ApiResponse<{ preferences: UserNotificationTypePreference[] }>> {
      return this.fetchWithAuth<{ preferences: UserNotificationTypePreference[] }>(
        '/api/v1/notifications/preferences/types',
        {
          method: 'GET',
        }
      );
    },

    async updateNotificationTypePreference(
      notificationType: NotificationType,
      req: UpdateNotificationTypePreferenceRequest
    ): Promise<ApiResponse<UserNotificationTypePreference>> {
      return this.fetchWithAuth<UserNotificationTypePreference>(
        `/api/v1/notifications/preferences/types/${encodeURIComponent(notificationType)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(req),
        }
      );
    },

    async getChannelNotificationMute(
      channelId: string
    ): Promise<ApiResponse<ChannelNotificationMute>> {
      return this.fetchWithAuth<ChannelNotificationMute>(
        `/api/v1/channels/${encodeURIComponent(channelId)}/notification-mute`,
        {
          method: 'GET',
        }
      );
    },

    async muteChannel(
      channelId: string,
      req?: MuteChannelRequest
    ): Promise<ApiResponse<ChannelNotificationMute>> {
      return this.fetchWithAuth<ChannelNotificationMute>(
        `/api/v1/channels/${encodeURIComponent(channelId)}/notification-mute`,
        {
          method: 'PUT',
          body: req ? JSON.stringify(req) : JSON.stringify({}),
        }
      );
    },

    async unmuteChannel(
      channelId: string
    ): Promise<ApiResponse<ChannelNotificationMute>> {
      return this.fetchWithAuth<ChannelNotificationMute>(
        `/api/v1/channels/${encodeURIComponent(channelId)}/notification-mute`,
        {
          method: 'DELETE',
        }
      );
    },

    // Phase 9D-B: Push Devices
    async registerPushDevice(
      req: RegisterPushDeviceRequest
    ): Promise<ApiResponse<PushDevice>> {
      return this.fetchWithAuth<PushDevice>('/api/v1/devices/push', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listPushDevices(): Promise<ApiResponse<PushDevice[]>> {
      return this.fetchWithAuth<PushDevice[]>('/api/v1/devices/push', {
        method: 'GET',
      });
    },

    async deletePushDevice(
      deviceId: string
    ): Promise<ApiResponse<void>> {
      return this.fetchWithAuth<void>(
        `/api/v1/devices/push/${encodeURIComponent(deviceId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    // Phase 9E: Search & Discovery
    async search(
      query: SearchRequestQuery
    ): Promise<ApiResponse<SearchResponseData>> {
      const params = new URLSearchParams();
      params.set('q', query.q);
      if (query.type) params.set('type', query.type);
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.organizationId) params.set('organizationId', query.organizationId);

      return this.fetchWithAuth<SearchResponseData>(
        `/api/v1/search?${params.toString()}`,
        {
          method: 'GET',
        }
      );
    },

    async getSearchSuggestions(
      query: string,
      organizationId?: string
    ): Promise<ApiResponse<{ items: SearchResultItem[] }>> {
      const params = new URLSearchParams();
      params.set('q', query);
      if (organizationId) params.set('organizationId', organizationId);

      return this.fetchWithAuth<{ items: SearchResultItem[] }>(
        `/api/v1/search/suggestions?${params.toString()}`,
        {
          method: 'GET',
        }
      );
    },

    // Phase 10: Calendar & Scheduling
    async createCalendarEvent(
      req: CreateCalendarEventRequest
    ): Promise<ApiResponse<CalendarEventWithDetails>> {
      return this.fetchWithAuth<CalendarEventWithDetails>('/api/v1/calendar/events', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listCalendarEvents(
      query: CalendarEventQuery
    ): Promise<ApiResponse<CalendarSyncResponse>> {
      const params = new URLSearchParams();
      params.set('start', query.start);
      params.set('end', query.end);
      if (query.organizationId) params.set('organizationId', query.organizationId);
      if (query.teamId) params.set('teamId', query.teamId);
      if (query.userId) params.set('userId', query.userId);

      return this.fetchWithAuth<CalendarSyncResponse>(`/api/v1/calendar/events?${params.toString()}`, {
        method: 'GET',
      });
    },

    async getCalendarEvent(
      eventId: string
    ): Promise<ApiResponse<CalendarEventWithDetails>> {
      return this.fetchWithAuth<CalendarEventWithDetails>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}`,
        {
          method: 'GET',
        }
      );
    },

    async updateCalendarEvent(
      eventId: string,
      req: UpdateCalendarEventRequest
    ): Promise<ApiResponse<CalendarEventWithDetails>> {
      return this.fetchWithAuth<CalendarEventWithDetails>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(req),
        }
      );
    },

    async deleteCalendarEvent(
      eventId: string
    ): Promise<ApiResponse<null>> {
      return this.fetchWithAuth<null>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async respondToCalendarEvent(
      eventId: string,
      req: CalendarRespondRequest
    ): Promise<ApiResponse<CalendarEventAttendee>> {
      return this.fetchWithAuth<CalendarEventAttendee>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}/respond`,
        {
          method: 'POST',
          body: JSON.stringify(req),
        }
      );
    },

    async addCalendarAttendee(
      eventId: string,
      req: AddCalendarAttendeeRequest
    ): Promise<ApiResponse<CalendarEventAttendeeWithUser>> {
      return this.fetchWithAuth<CalendarEventAttendeeWithUser>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}/attendees`,
        {
          method: 'POST',
          body: JSON.stringify(req),
        }
      );
    },

    async removeCalendarAttendee(
      eventId: string,
      userId: string
    ): Promise<ApiResponse<null>> {
      return this.fetchWithAuth<null>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async listCalendarAttendees(
      eventId: string
    ): Promise<ApiResponse<CalendarEventAttendeeWithUser[]>> {
      return this.fetchWithAuth<CalendarEventAttendeeWithUser[]>(
        `/api/v1/calendar/events/${encodeURIComponent(eventId)}/attendees`,
        {
          method: 'GET',
        }
      );
    },

    async getCalendarAvailability(
      req: CalendarAvailabilityRequest
    ): Promise<ApiResponse<CalendarAvailabilityResponse>> {
      const params = new URLSearchParams();
      params.set('userIds', req.userIds.join(','));
      params.set('start', req.start);
      params.set('end', req.end);
      if (req.organizationId) params.set('organizationId', req.organizationId);

      return this.fetchWithAuth<CalendarAvailabilityResponse>(
        `/api/v1/calendar/availability?${params.toString()}`,
        {
          method: 'GET',
        }
      );
    },

    async sendAiChat(req: AIChatRequest): Promise<ApiResponse<AIResponse>> {
      return this.fetchWithAuth<AIResponse>('/api/v1/ai/chat', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async listAiConversations(
      organizationId?: string
    ): Promise<ApiResponse<{ conversations: AIConversation[] }>> {
      const endpoint = organizationId
        ? `/api/v1/ai/conversations?organizationId=${encodeURIComponent(organizationId)}`
        : '/api/v1/ai/conversations';
      return this.fetchWithAuth<{ conversations: AIConversation[] }>(endpoint, {
        method: 'GET',
      });
    },

    async getAiConversation(
      conversationId: string
    ): Promise<ApiResponse<{ conversation: AIConversation; messages: AIMessage[] }>> {
      return this.fetchWithAuth<{ conversation: AIConversation; messages: AIMessage[] }>(
        `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
        {
          method: 'GET',
        }
      );
    },

    async deleteAiConversation(
      conversationId: string
    ): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(
        `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async confirmAiAction(
      actionId: string,
      req: AIConfirmActionRequest
    ): Promise<ApiResponse<{ action: AIActionProposal; result?: unknown }>> {
      return this.fetchWithAuth<{ action: AIActionProposal; result?: unknown }>(
        `/api/v1/ai/actions/${encodeURIComponent(actionId)}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify(req),
        }
      );
    },

    async cancelAiAction(
      actionId: string
    ): Promise<ApiResponse<{ action: AIActionProposal }>> {
      return this.fetchWithAuth<{ action: AIActionProposal }>(
        `/api/v1/ai/actions/${encodeURIComponent(actionId)}/cancel`,
        {
          method: 'POST',
        }
      );
    },

    // Phase 13: User Profile & Security
    async getUserProfile(): Promise<ApiResponse<UserProfile>> {
      return this.fetchWithAuth<UserProfile>('/api/v1/users/me', {
        method: 'GET',
      });
    },

    async updateUserProfile(req: UpdateUserProfileRequest): Promise<ApiResponse<UserProfile>> {
      return this.fetchWithAuth<UserProfile>('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify(req),
      });
    },

    async getUserSecurity(): Promise<ApiResponse<UserSecuritySummary>> {
      return this.fetchWithAuth<UserSecuritySummary>('/api/v1/users/me/security', {
        method: 'GET',
      });
    },

    async changePassword(req: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>('/api/v1/users/me/password', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async getUserSessions(): Promise<ApiResponse<{ sessions: UserSessionItem[] }>> {
      return this.fetchWithAuth<{ sessions: UserSessionItem[] }>('/api/v1/users/me/sessions', {
        method: 'GET',
      });
    },

    async revokeSession(sessionId: string): Promise<ApiResponse<{ message: string }>> {
      return this.fetchWithAuth<{ message: string }>(
        `/api/v1/users/me/sessions/${encodeURIComponent(sessionId)}/revoke`,
        {
          method: 'POST',
        }
      );
    },

    async revokeAllSessions(preserveCurrent: boolean = true): Promise<ApiResponse<{ message: string; revokedCount: number }>> {
      return this.fetchWithAuth<{ message: string; revokedCount: number }>(
        '/api/v1/users/me/sessions/revoke-all',
        {
          method: 'POST',
          body: JSON.stringify({ preserveCurrent }),
        }
      );
    },

    // Phase 13: Governance & Administration
    async getOrganizationGovernance(organizationId: string): Promise<ApiResponse<OrganizationGovernanceSettings>> {
      return this.fetchWithAuth<OrganizationGovernanceSettings>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/governance`,
        {
          method: 'GET',
        }
      );
    },

    async updateOrganizationGovernance(
      organizationId: string,
      req: UpdateGovernanceSettingsRequest
    ): Promise<ApiResponse<OrganizationGovernanceSettings>> {
      return this.fetchWithAuth<OrganizationGovernanceSettings>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/governance`,
        {
          method: 'PATCH',
          body: JSON.stringify(req),
        }
      );
    },

    async getOrganizationAuditLogs(
      organizationId: string,
      query?: AuditLogQuery
    ): Promise<ApiResponse<AuditLogPaginatedResponse>> {
      const params = new URLSearchParams();
      if (query?.cursor) params.set('cursor', query.cursor);
      if (query?.limit) params.set('limit', String(query.limit));
      if (query?.action) params.set('action', query.action);
      if (query?.actorId) params.set('actorId', query.actorId);
      if (query?.entityType) params.set('entityType', query.entityType);
      if (query?.startDate) params.set('startDate', query.startDate);
      if (query?.endDate) params.set('endDate', query.endDate);
      const qs = params.toString();
      return this.fetchWithAuth<AuditLogPaginatedResponse>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/audit-logs${qs ? `?${qs}` : ''}`,
        {
          method: 'GET',
        }
      );
    },

    async updateOrganizationMember(
      organizationId: string,
      userId: string,
      req: UpdateOrganizationMemberRequest
    ): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>> {
      return this.fetchWithAuth<{ member: OrganizationMemberWithUser }>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(req),
        }
      );
    },

    async suspendOrganizationMember(
      organizationId: string,
      userId: string
    ): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>> {
      return this.updateOrganizationMember(organizationId, userId, { status: 'suspended' });
    },

    async restoreOrganizationMember(
      organizationId: string,
      userId: string
    ): Promise<ApiResponse<{ member: OrganizationMemberWithUser }>> {
      return this.updateOrganizationMember(organizationId, userId, { status: 'active' });
    },
  };

  return client;
}

export interface NotificationSyncManagerOptions {
  apiClient: ApiClient;
  onGapDetected?: () => void;
  onStateChanged?: (state: { unreadCount: number; notifications: Notification[] }) => void;
}

/**
 * Client-side notification synchronization state machine.
 * Enforces strictly sequential event processing, out-of-order event buffering,
 * gap resolution, and sequence-bounded snapshot reconciliation.
 */
export class NotificationSyncManager {
  private apiClient: ApiClient;
  private localSeq: bigint = 0n;
  private unreadCount: number = 0;
  private notifications: Map<string, Notification> = new Map();
  private pendingSequenceEvents: Map<string, RealtimeEnvelope<any>> = new Map();
  private gapResolutionTimer: any = null;
  private onGapDetected?: () => void;
  private onStateChanged?: (state: { unreadCount: number; notifications: Notification[] }) => void;

  constructor(options: NotificationSyncManagerOptions) {
    this.apiClient = options.apiClient;
    this.onGapDetected = options.onGapDetected;
    this.onStateChanged = options.onStateChanged;
  }

  getLocalSeq(): bigint {
    return this.localSeq;
  }

  getUnreadCount(): number {
    return this.unreadCount;
  }

  getNotifications(): Notification[] {
    return Array.from(this.notifications.values()).sort((a, b) => {
      if (b.mutationSeq !== a.mutationSeq) {
        return BigInt(b.mutationSeq) > BigInt(a.mutationSeq) ? 1 : -1;
      }
      return b.id.localeCompare(a.id);
    });
  }

  getPendingCount(): number {
    return this.pendingSequenceEvents.size;
  }

  /**
   * Initializes the manager with a batch of notifications (e.g. from initial REST fetch).
   */
  setInitialNotifications(notifications: Notification[], unreadCount?: number, localSeq?: bigint): void {
    this.notifications.clear();
    for (const notif of notifications) {
      this.notifications.set(notif.id, notif);
    }
    if (unreadCount !== undefined) {
      this.unreadCount = unreadCount;
    } else {
      this.unreadCount = notifications.filter((n) => n.readAt === null).length;
    }
    if (localSeq !== undefined) {
      this.localSeq = localSeq;
    } else {
      let maxSeq = this.localSeq;
      for (const notif of notifications) {
        if (notif.mutationSeq) {
          const s = BigInt(notif.mutationSeq);
          if (s > maxSeq) maxSeq = s;
        }
      }
      this.localSeq = maxSeq;
    }
    this.notifyStateChanged();
  }

  /**
   * Appends older paginated notifications without overwriting newer items.
   */
  appendOlderNotifications(notifications: Notification[]): void {
    let added = 0;
    for (const notif of notifications) {
      if (!this.notifications.has(notif.id)) {
        this.notifications.set(notif.id, notif);
        added++;
      }
    }
    if (added > 0) {
      this.notifyStateChanged();
    }
  }

  /**
   * Optimistic mark-read mutation.
   */
  markReadOptimistic(notificationId: string): void {
    const existing = this.notifications.get(notificationId);
    if (existing && existing.readAt === null) {
      existing.readAt = new Date().toISOString();
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notifyStateChanged();
    }
  }

  /**
   * Optimistic mark-unread mutation.
   */
  markUnreadOptimistic(notificationId: string): void {
    const existing = this.notifications.get(notificationId);
    if (existing && existing.readAt !== null) {
      existing.readAt = null;
      this.unreadCount += 1;
      this.notifyStateChanged();
    }
  }

  /**
   * Optimistic mark-all-read mutation.
   */
  markAllReadOptimistic(readAt?: string, organizationId?: string): void {
    const timestamp = readAt || new Date().toISOString();
    let updated = 0;
    for (const item of this.notifications.values()) {
      if (organizationId && item.organizationId !== organizationId) {
        continue;
      }
      if (item.readAt === null) {
        item.readAt = timestamp;
        updated++;
      }
    }
    this.unreadCount = Math.max(0, this.unreadCount - updated);
    this.notifyStateChanged();
  }

  /**
   * Optimistic delete mutation.
   */
  deleteOptimistic(notificationId: string): void {
    const existing = this.notifications.get(notificationId);
    if (existing) {
      if (existing.readAt === null) {
        this.unreadCount = Math.max(0, this.unreadCount - 1);
      }
      this.notifications.delete(notificationId);
      this.notifyStateChanged();
    }
  }

  /**
   * Captures snapshot for rollback if an API mutation fails.
   */
  getSnapshot(): { notifications: Notification[]; unreadCount: number; localSeq: bigint } {
    return {
      notifications: Array.from(this.notifications.values()).map((n) => ({ ...n })),
      unreadCount: this.unreadCount,
      localSeq: this.localSeq,
    };
  }

  /**
   * Restores snapshot on mutation rollback.
   */
  restoreSnapshot(snapshot: { notifications: Notification[]; unreadCount: number; localSeq: bigint }): void {
    this.notifications.clear();
    for (const n of snapshot.notifications) {
      this.notifications.set(n.id, { ...n });
    }
    this.unreadCount = snapshot.unreadCount;
    this.localSeq = snapshot.localSeq;
    this.notifyStateChanged();
  }

  /**
   * Applies an authoritative catch-up sync response from GET /api/v1/notifications/sync.
   */
  applySyncResponse(sync: NotificationSyncResponse): void {
    const snapshotSeq = BigInt(sync.snapshotMutationSeq);
    this.localSeq = snapshotSeq;
    this.unreadCount = sync.unreadCount;

    for (const notif of sync.upserted) {
      this.notifications.set(notif.id, notif);
    }

    for (const id of sync.deletedIds) {
      this.notifications.delete(id);
    }

    this.drainPendingSequenceEvents();
    this.notifyStateChanged();
  }

  /**
   * Processes an incoming realtime WebSocket envelope using the sequence state machine.
   */
  handleRealtimeEvent(envelope: RealtimeEnvelope<any>): void {
    if (!envelope.payload || typeof envelope.payload.mutationSeq !== 'string') {
      return;
    }

    const incomingSeq = BigInt(envelope.payload.mutationSeq);

    // Case 1: Stale or duplicate event
    if (incomingSeq <= this.localSeq) {
      return;
    }

    // Case 2: Exact next sequential event
    if (incomingSeq === this.localSeq + 1n) {
      this.applyEventDirectly(envelope);
      this.localSeq = incomingSeq;
      this.drainPendingSequenceEvents();
      this.notifyStateChanged();
      return;
    }

    // Case 3: Sequence gap detected (incomingSeq > localSeq + 1n)
    this.pendingSequenceEvents.set(envelope.payload.mutationSeq, envelope);

    if (this.onGapDetected) {
      this.onGapDetected();
    }

    if (!this.gapResolutionTimer) {
      this.gapResolutionTimer = setTimeout(() => {
        this.gapResolutionTimer = null;
        if (this.pendingSequenceEvents.size > 0 && this.onGapDetected) {
          this.onGapDetected();
        }
      }, 500);
    }
  }

  private applyEventDirectly(envelope: RealtimeEnvelope<any>): void {
    switch (envelope.event) {
      case 'notification.created': {
        const notif = envelope.payload.notification as Notification;
        if (notif) {
          this.notifications.set(notif.id, notif);
          if (notif.readAt === null) {
            this.unreadCount += 1;
          }
        }
        break;
      }
      case 'notification.read': {
        const { notificationId, readAt, mutationSeq } = envelope.payload;
        const existing = this.notifications.get(notificationId);
        if (existing) {
          if (existing.readAt === null) {
            this.unreadCount = Math.max(0, this.unreadCount - 1);
          }
          existing.readAt = readAt;
          existing.mutationSeq = mutationSeq;
        }
        break;
      }
      case 'notification.unread': {
        const { notificationId, mutationSeq } = envelope.payload;
        const existing = this.notifications.get(notificationId);
        if (existing) {
          if (existing.readAt !== null) {
            this.unreadCount += 1;
          }
          existing.readAt = null;
          existing.mutationSeq = mutationSeq;
        }
        break;
      }
      case 'notification.read_all': {
        const payload = envelope.payload as NotificationReadAllPayload;
        this.unreadCount = payload.unreadCount;
        const readTimestamp = payload.readAt;
        const readAllSeq = BigInt(payload.mutationSeq);

        for (const item of this.notifications.values()) {
          if (payload.organizationId && item.organizationId !== payload.organizationId) {
            continue;
          }
          // Strictly preserve newer rows modified after read_all
          if (BigInt(item.mutationSeq) > readAllSeq) {
            continue;
          }
          if (item.readAt === null) {
            item.readAt = readTimestamp;
            item.mutationSeq = payload.mutationSeq;
          }
        }
        break;
      }
      case 'notification.deleted': {
        const { notificationId } = envelope.payload;
        const existing = this.notifications.get(notificationId);
        if (existing) {
          if (existing.readAt === null) {
            this.unreadCount = Math.max(0, this.unreadCount - 1);
          }
          this.notifications.delete(notificationId);
        }
        break;
      }
    }
  }

  private drainPendingSequenceEvents(): void {
    while (true) {
      const nextSeqStr = (this.localSeq + 1n).toString();
      const nextEvent = this.pendingSequenceEvents.get(nextSeqStr);
      if (!nextEvent) break;

      this.pendingSequenceEvents.delete(nextSeqStr);
      this.applyEventDirectly(nextEvent);
      this.localSeq = this.localSeq + 1n;
    }

    if (this.pendingSequenceEvents.size === 0 && this.gapResolutionTimer) {
      clearTimeout(this.gapResolutionTimer);
      this.gapResolutionTimer = null;
    }
  }

  private notifyStateChanged(): void {
    if (this.onStateChanged) {
      this.onStateChanged({
        unreadCount: this.unreadCount,
        notifications: this.getNotifications(),
      });
    }
  }
}


