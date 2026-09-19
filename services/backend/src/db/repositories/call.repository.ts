import crypto from 'crypto';
import { pool } from '../pool.js';
import { presenceService } from '../../realtime/presence.service.js';

export interface CallLogItem {
  id: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  callType: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'declined';
  durationSeconds: number;
  timestamp: string;
}

export interface SpeedDialItem {
  id: string;
  contactUserId: string;
  displayName: string;
  email: string;
  role: string;
  presence: 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline';
}

export interface ContactItem {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  avatarBg: string;
  isRegistered: boolean;
  presence: 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline';
  createdAt: string;
}

export class CallRepository {
  // Real call logs & contacts storage
  private callLogs: CallLogItem[] = [];
  private speedDialList: Map<string, SpeedDialItem[]> = new Map();
  private contactsList: Map<string, ContactItem[]> = new Map();

  constructor() {}

  async createCallRecord(record: {
    callerId: string;
    callerName: string;
    calleeId: string;
    calleeName: string;
    callType: 'audio' | 'video';
    direction: 'incoming' | 'outgoing' | 'missed';
    status: 'completed' | 'missed' | 'declined';
    durationSeconds: number;
  }): Promise<CallLogItem> {
    const item: CallLogItem = {
      id: crypto.randomUUID(),
      ...record,
      timestamp: new Date().toISOString(),
    };
    this.callLogs.unshift(item);
    return item;
  }

  async listUserCalls(userId: string, filter?: 'all' | 'missed' | 'incoming' | 'outgoing'): Promise<CallLogItem[]> {
    let items = this.callLogs.filter(
      (c) => c.callerId === userId || c.calleeId === userId || c.callerId === 'self' || c.calleeId === 'self'
    );

    if (filter === 'missed') {
      items = items.filter((c) => c.direction === 'missed' || c.status === 'missed');
    } else if (filter === 'incoming') {
      items = items.filter((c) => c.direction === 'incoming');
    } else if (filter === 'outgoing') {
      items = items.filter((c) => c.direction === 'outgoing');
    }

    return items;
  }

  async listSpeedDial(userId: string): Promise<SpeedDialItem[]> {
    const userContacts = this.speedDialList.get(userId) || this.speedDialList.get('default') || [];
    // Enrich with dynamic presence
    const enriched = await Promise.all(
      userContacts.map(async (contact) => {
        const pres = await presenceService.getUserPresence(contact.contactUserId);
        return {
          ...contact,
          presence: pres.status,
        };
      })
    );
    return enriched;
  }

  async addSpeedDial(userId: string, contact: Omit<SpeedDialItem, 'id' | 'presence'>): Promise<SpeedDialItem> {
    const contacts = this.speedDialList.get(userId) || [...(this.speedDialList.get('default') || [])];
    const newItem: SpeedDialItem = {
      id: crypto.randomUUID(),
      ...contact,
      presence: 'available',
    };
    contacts.push(newItem);
    this.speedDialList.set(userId, contacts);
    return newItem;
  }

  async removeSpeedDial(userId: string, contactId: string): Promise<boolean> {
    const contacts = this.speedDialList.get(userId) || [...(this.speedDialList.get('default') || [])];
    const filtered = contacts.filter((c) => c.id !== contactId && c.contactUserId !== contactId);
    this.speedDialList.set(userId, filtered);
    return true;
  }

  // ── Contact Management ──
  async listContacts(userId: string, filter?: 'all' | 'active'): Promise<ContactItem[]> {
    const list = this.contactsList.get(userId) || this.contactsList.get('default') || [];
    // Enrich with dynamic presence
    const enriched = await Promise.all(
      list.map(async (c) => {
        let presence: 'available' | 'busy' | 'do_not_disturb' | 'away' | 'offline' = c.presence || 'available';
        if (c.userId) {
          const pres = await presenceService.getUserPresence(c.userId);
          if (pres?.status) presence = pres.status as any;
        }
        return {
          ...c,
          presence,
        };
      })
    );

    if (filter === 'active') {
      return enriched.filter((c) => c.presence === 'available' || c.presence === 'busy');
    }
    return enriched;
  }

  async addContact(userId: string, contact: { name: string; email?: string; phone?: string }): Promise<ContactItem> {
    const contacts = this.contactsList.get(userId) || [...(this.contactsList.get('default') || [])];
    const colors = ['#D13438', '#E3008C', '#8764B8', '#0078D4', '#00B7C3', '#107C10', '#B4009E', '#C239B3'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newContact: ContactItem = {
      id: crypto.randomUUID(),
      name: contact.name.trim(),
      email: contact.email?.trim() || '',
      phone: contact.phone?.trim() || '',
      avatarBg: randomColor,
      isRegistered: false,
      presence: 'available',
      createdAt: new Date().toISOString(),
    };
    contacts.push(newContact);
    this.contactsList.set(userId, contacts);
    return newContact;
  }

  async deleteContact(userId: string, contactId: string): Promise<boolean> {
    const contacts = this.contactsList.get(userId) || [...(this.contactsList.get('default') || [])];
    const filtered = contacts.filter((c) => c.id !== contactId);
    this.contactsList.set(userId, filtered);
    return true;
  }
}

export const callRepository = new CallRepository();
