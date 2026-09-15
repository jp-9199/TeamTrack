import { searchService } from '../search/search.service.js';
import { meetingService } from '../meetings/meeting.service.js';
import { calendarService } from '../calendar/calendar.service.js';
import { messagingService } from '../messaging/messaging.service.js';
import { conversationService } from '../conversations/conversation.service.js';
import { fileService } from '../files/file.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { authorizationService } from '../authorization/authorization.service.js';
import { conversationRepository } from '../../db/repositories/conversation.repository.js';
import { messageRepository } from '../../db/repositories/message.repository.js';
import type { AIToolDefinition, AIToolContext } from './ai.tool.types.js';

export class AIToolRegistry {
  private static tools: Map<string, AIToolDefinition> = new Map();

  static register(tool: AIToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  static get(name: string): AIToolDefinition | undefined {
    return this.tools.get(name);
  }

  static list(): AIToolDefinition[] {
    return Array.from(this.tools.values());
  }

  static getSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

// ----------------------------------------------------------------------------
// 1. search_teamtrack (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'search_teamtrack',
  description: 'Searches authorized TeamTrack resources including messages, meetings, files, and channels using existing multi-tenant search.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'SEARCH',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or keywords' },
      category: { type: 'string', description: 'Optional category filter: messages, channels, meetings, files' },
      limit: { type: 'number', description: 'Max items to return (1-50)' },
    },
    required: ['query'],
  },
  validateArgs: (args) => {
    if (!args.query || typeof args.query !== 'string' || !args.query.trim()) {
      throw new Error('Search query is required and must not be empty');
    }
  },
  execute: async (args, context) => {
    const results = await searchService.search(context.callerId, {
      q: args.query.trim(),
      type: args.category || 'all',
      limit: Math.min(Math.max(Number(args.limit) || 10, 1), 50),
      organizationId: context.organizationId || undefined,
    });
    return {
      items: results.items,
      totalMatches: results.totalMatches,
    };
  },
});

// ----------------------------------------------------------------------------
// 2. get_meeting (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'get_meeting',
  description: 'Retrieves an authorized meeting details and participant list.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'MEETINGS',
  parameters: {
    type: 'object',
    properties: {
      meetingId: { type: 'string', description: 'UUID of the meeting' },
    },
    required: ['meetingId'],
  },
  validateArgs: (args) => {
    if (!args.meetingId || typeof args.meetingId !== 'string') {
      throw new Error('Valid meetingId is required');
    }
  },
  execute: async (args, context) => {
    return await meetingService.getMeeting(context.callerId, args.meetingId);
  },
});

// ----------------------------------------------------------------------------
// 3. get_calendar_event (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'get_calendar_event',
  description: 'Retrieves an authorized calendar event and attendee details.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'CALENDAR',
  parameters: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'UUID of the calendar event' },
    },
    required: ['eventId'],
  },
  validateArgs: (args) => {
    if (!args.eventId || typeof args.eventId !== 'string') {
      throw new Error('Valid eventId is required');
    }
  },
  execute: async (args, context) => {
    return await calendarService.getEvent(context.callerId, args.eventId);
  },
});

// ----------------------------------------------------------------------------
// 4. list_calendar_events (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'list_calendar_events',
  description: 'Lists authorized calendar events for the user in a given date range.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'CALENDAR',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'ISO 8601 start date' },
      endDate: { type: 'string', description: 'ISO 8601 end date' },
      limit: { type: 'number', description: 'Max events to return (1-100)' },
    },
    required: ['startDate', 'endDate'],
  },
  validateArgs: (args) => {
    if (!args.startDate || !args.endDate) {
      throw new Error('startDate and endDate are required');
    }
  },
  execute: async (args, context) => {
    return await calendarService.listEvents(context.callerId, {
      start: args.startDate,
      end: args.endDate,
    });
  },
});

// ----------------------------------------------------------------------------
// 5. get_channel_context (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'get_channel_context',
  description: 'Retrieves authorized channel context and recent messages.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'MESSAGING',
  parameters: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'UUID of the channel' },
      limit: { type: 'number', description: 'Max recent messages to fetch (1-50)' },
    },
    required: ['channelId'],
  },
  validateArgs: (args) => {
    if (!args.channelId || typeof args.channelId !== 'string') {
      throw new Error('Valid channelId is required');
    }
  },
  execute: async (args, context) => {
    const auth = await authorizationService.getChannelAuth(context.callerId, args.channelId);
    if (!auth.canAccess) {
      throw new Error('Channel not found or access denied');
    }

    const messages = await messageRepository.listChannelMessages(args.channelId, {
      limit: Math.min(Math.max(Number(args.limit) || 20, 1), 50),
    });

    return {
      channelId: args.channelId,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        createdAt: m.createdAt,
      })),
    };
  },
});

// ----------------------------------------------------------------------------
// 6. get_conversation_context (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'get_conversation_context',
  description: 'Retrieves authorized direct conversation context and recent messages.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'MESSAGING',
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'string', description: 'UUID of the direct conversation' },
      limit: { type: 'number', description: 'Max recent messages to fetch (1-50)' },
    },
    required: ['conversationId'],
  },
  validateArgs: (args) => {
    if (!args.conversationId || typeof args.conversationId !== 'string') {
      throw new Error('Valid conversationId is required');
    }
  },
  execute: async (args, context) => {
    const membership = await conversationRepository.getMember(args.conversationId, context.callerId);
    if (!membership) {
      throw new Error('Conversation not found or access denied');
    }

    const messages = await messageRepository.listConversationMessages(args.conversationId, {
      limit: Math.min(Math.max(Number(args.limit) || 20, 1), 50),
    });

    return {
      conversationId: args.conversationId,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        createdAt: m.createdAt,
      })),
    };
  },
});

// ----------------------------------------------------------------------------
// 7. get_file_metadata (Read)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'get_file_metadata',
  description: 'Retrieves metadata for an authorized file. Storage keys and presigned credentials are never exposed.',
  isWrite: false,
  requiresConfirmation: false,
  auditCategory: 'FILES',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'UUID of the file' },
    },
    required: ['fileId'],
  },
  validateArgs: (args) => {
    if (!args.fileId || typeof args.fileId !== 'string') {
      throw new Error('Valid fileId is required');
    }
  },
  execute: async (args, context) => {
    const file = await fileService.getFile(args.fileId, context.callerId);
    // Sanitize: strictly omit storage_key and internal bucket references
    return {
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      status: file.status,
      createdAt: file.createdAt,
    };
  },
});

// ----------------------------------------------------------------------------
// 8. create_calendar_event (Write - Requires Confirmation)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'create_calendar_event',
  description: 'Creates a calendar event through CalendarService. Requires explicit user confirmation.',
  isWrite: true,
  requiresConfirmation: true,
  auditCategory: 'CALENDAR',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      startTime: { type: 'string', description: 'ISO 8601 start time' },
      endTime: { type: 'string', description: 'ISO 8601 end time' },
      description: { type: 'string', description: 'Optional description' },
      location: { type: 'string', description: 'Optional location' },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional attendee user IDs',
      },
    },
    required: ['title', 'startTime', 'endTime'],
  },
  validateArgs: (args) => {
    if (!args.title || typeof args.title !== 'string') throw new Error('title is required');
    if (!args.startTime || !args.endTime) throw new Error('startTime and endTime are required');
  },
  authorize: async (args, context) => {
    if (context.organizationId && !context.userOrgs.includes(context.organizationId)) {
      throw new Error('User not in organization');
    }
  },
  execute: async (args, context) => {
    return await calendarService.createEvent(context.callerId, {
      title: args.title,
      startAt: args.startTime,
      endAt: args.endTime,
      description: args.description,
      location: args.location,
      attendeeUserIds: args.attendees,
    });
  },
});

// ----------------------------------------------------------------------------
// 9. create_meeting (Write - Requires Confirmation)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'create_meeting',
  description: 'Creates a meeting through Meetings domain service. Requires explicit user confirmation.',
  isWrite: true,
  requiresConfirmation: true,
  auditCategory: 'MEETINGS',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Meeting title' },
      scheduledStartTime: { type: 'string', description: 'Optional ISO 8601 start time' },
      scheduledEndTime: { type: 'string', description: 'Optional ISO 8601 end time' },
      organizationId: { type: 'string', description: 'Organization UUID' },
    },
    required: ['title'],
  },
  validateArgs: (args) => {
    if (!args.title || typeof args.title !== 'string') throw new Error('title is required');
  },
  authorize: async (args, context) => {
    const targetOrgId = args.organizationId || context.organizationId || context.userOrgs[0];
    if (!targetOrgId || !context.userOrgs.includes(targetOrgId)) {
      throw new Error('User does not belong to specified organization');
    }
  },
  execute: async (args, context) => {
    const targetOrgId = args.organizationId || context.organizationId || context.userOrgs[0];
    return await meetingService.createMeeting(context.callerId, {
      organizationId: targetOrgId,
      title: args.title,
      scheduledStartAt: args.scheduledStartTime,
    });
  },
});

// ----------------------------------------------------------------------------
// 10. send_message (Write - Requires Confirmation)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'send_message',
  description: 'Sends a message to an authorized channel or direct conversation. Requires explicit user confirmation.',
  isWrite: true,
  requiresConfirmation: true,
  auditCategory: 'MESSAGING',
  parameters: {
    type: 'object',
    properties: {
      targetType: { type: 'string', enum: ['channel', 'conversation'], description: 'channel or conversation' },
      targetId: { type: 'string', description: 'Channel or Conversation UUID' },
      content: { type: 'string', description: 'Message text' },
    },
    required: ['targetType', 'targetId', 'content'],
  },
  validateArgs: (args) => {
    if (!['channel', 'conversation'].includes(args.targetType)) {
      throw new Error('targetType must be channel or conversation');
    }
    if (!args.targetId || typeof args.targetId !== 'string') throw new Error('targetId is required');
    if (!args.content || typeof args.content !== 'string' || !args.content.trim()) {
      throw new Error('content cannot be empty');
    }
  },
  authorize: async (args, context) => {
    if (args.targetType === 'channel') {
      const auth = await authorizationService.getChannelAuth(context.callerId, args.targetId);
      if (!auth.canAccess) {
        throw new Error('Channel not found or access denied');
      }
    } else {
      const membership = await conversationRepository.getMember(args.targetId, context.callerId);
      if (!membership) {
        throw new Error('Conversation not found or access denied');
      }
    }
  },
  execute: async (args, context) => {
    if (args.targetType === 'channel') {
      const res = await messagingService.sendChannelMessage(args.targetId, context.callerId, {
        content: args.content.trim(),
      });
      return { messageId: res.message.id, channelId: args.targetId };
    } else {
      const res = await conversationService.sendConversationMessage(args.targetId, context.callerId, {
        content: args.content.trim(),
      });
      return { messageId: res.message.id, conversationId: args.targetId };
    }
  },
});

// ----------------------------------------------------------------------------
// 11. mark_notification_read (Write - Low Risk, Idempotent)
// ----------------------------------------------------------------------------
AIToolRegistry.register({
  name: 'mark_notification_read',
  description: 'Marks an authorized user notification as read.',
  isWrite: true,
  requiresConfirmation: false, // Low-risk idempotent user action
  auditCategory: 'NOTIFICATIONS',
  parameters: {
    type: 'object',
    properties: {
      notificationId: { type: 'string', description: 'UUID of the notification' },
    },
    required: ['notificationId'],
  },
  validateArgs: (args) => {
    if (!args.notificationId || typeof args.notificationId !== 'string') {
      throw new Error('notificationId is required');
    }
  },
  execute: async (args, context) => {
    await notificationService.markNotificationRead(args.notificationId, context.callerId);
    return { success: true, notificationId: args.notificationId };
  },
});

// ----------------------------------------------------------------------------
// 12. create_reminder (Deferred as documented in Phase 12 specification)
// ----------------------------------------------------------------------------
