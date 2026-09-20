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
  private speedDialList: Map<string, SpeedDialItem[]> = new Map();

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
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      await pool.query(
        `INSERT INTO call_logs (id, caller_id, caller_name, callee_id, callee_name, call_type, direction, status, duration_seconds, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          record.callerId,
          record.callerName,
          record.calleeId,
          record.calleeName,
          record.callType,
          record.direction,
          record.status,
          record.durationSeconds,
          timestamp,
        ]
      );
    } catch (err) {
      console.error('[CallRepository] Failed to insert into call_logs in db, continuing:', err);
    }

    return {
      id,
      ...record,
      timestamp,
    };
  }

  async listUserCalls(userId: string, filter?: 'all' | 'missed' | 'incoming' | 'outgoing'): Promise<CallLogItem[]> {
    try {
      let query = `
        SELECT id, caller_id AS "callerId", caller_name AS "callerName",
               callee_id AS "calleeId", callee_name AS "calleeName",
               call_type AS "callType", direction, status,
               duration_seconds AS "durationSeconds", created_at AS "timestamp"
        FROM call_logs
        WHERE caller_id = $1 OR callee_id = $1 OR caller_id = 'self' OR callee_id = 'self'
      `;
      const params: any[] = [userId];

      if (filter === 'missed') {
        query += ` AND (direction = 'missed' OR status = 'missed')`;
      } else if (filter === 'incoming') {
        query += ` AND direction = 'incoming'`;
      } else if (filter === 'outgoing') {
        query += ` AND direction = 'outgoing'`;
      }

      query += ` ORDER BY created_at DESC LIMIT 50`;

      const res = await pool.query(query, params);
      return res.rows.map((r: any) => ({
        ...r,
        durationSeconds: Number(r.durationSeconds) || 0,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      }));
    } catch (err) {
      console.error('[CallRepository] Failed to query call_logs:', err);
      return [];
    }
  }

  async listSpeedDial(userId: string): Promise<SpeedDialItem[]> {
    const customList = this.speedDialList.get(userId) || [];
    if (customList.length > 0) {
      return Promise.all(
        customList.map(async (contact) => {
          const pres = await presenceService.getUserPresence(contact.contactUserId);
          return {
            ...contact,
            presence: pres.status,
          };
        })
      );
    }

    try {
      const res = await pool.query(
        `SELECT id, display_name, email FROM users WHERE id != $1 AND status = 'active' LIMIT 10`,
        [userId]
      );
      return Promise.all(
        res.rows.map(async (row: any) => {
          const pres = await presenceService.getUserPresence(row.id);
          return {
            id: row.id,
            contactUserId: row.id,
            displayName: row.display_name,
            email: row.email,
            role: 'Member',
            presence: pres.status,
          };
        })
      );
    } catch {
      return [];
    }
  }

  async addSpeedDial(userId: string, contact: Omit<SpeedDialItem, 'id' | 'presence'>): Promise<SpeedDialItem> {
    const contacts = this.speedDialList.get(userId) || [];
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
    const contacts = this.speedDialList.get(userId) || [];
    const filtered = contacts.filter((c) => c.id !== contactId && c.contactUserId !== contactId);
    this.speedDialList.set(userId, filtered);
    return true;
  }

  // ── Contact Management ──
  async listContacts(userId: string, filter?: 'all' | 'active'): Promise<ContactItem[]> {
    const contacts: ContactItem[] = [];

    // 1. Fetch registered users from PostgreSQL
    try {
      const userRes = await pool.query(
        `SELECT id, display_name, email FROM users WHERE id != $1 AND status = 'active' ORDER BY display_name ASC`,
        [userId]
      );

      const colors = ['#0078D4', '#107C10', '#D13438', '#8764B8', '#008272', '#B4009E'];
      for (const row of userRes.rows) {
        const pres = await presenceService.getUserPresence(row.id);
        const charCode = (row.display_name || 'U').charCodeAt(0);
        const avatarBg = colors[charCode % colors.length];

        contacts.push({
          id: row.id,
          userId: row.id,
          name: row.display_name || row.email.split('@')[0],
          email: row.email,
          phone: '',
          avatarBg,
          isRegistered: true,
          presence: pres?.status || 'available',
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[CallRepository] Failed to list users for contacts:', err);
    }

    // 2. Fetch custom contacts added by this user
    try {
      const customRes = await pool.query(
        `SELECT id, name, email, phone, avatar_bg, created_at FROM custom_contacts WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      for (const row of customRes.rows) {
        contacts.push({
          id: row.id,
          name: row.name,
          email: row.email || '',
          phone: row.phone || '',
          avatarBg: row.avatar_bg || '#0078D4',
          isRegistered: false,
          presence: 'available',
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        });
      }
    } catch (err) {
      console.error('[CallRepository] Failed to list custom_contacts:', err);
    }

    if (filter === 'active') {
      return contacts.filter((c) => c.presence === 'available' || c.presence === 'busy');
    }
    return contacts;
  }

  async addContact(userId: string, contact: { name: string; email?: string; phone?: string }): Promise<ContactItem> {
    const id = crypto.randomUUID();
    const colors = ['#D13438', '#E3008C', '#8764B8', '#0078D4', '#00B7C3', '#107C10', '#B4009E', '#C239B3'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const createdAt = new Date().toISOString();

    try {
      await pool.query(
        `INSERT INTO custom_contacts (id, user_id, name, email, phone, avatar_bg, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          userId,
          contact.name.trim(),
          contact.email?.trim() || '',
          contact.phone?.trim() || '',
          randomColor,
          createdAt,
        ]
      );
    } catch (err) {
      console.error('[CallRepository] Failed to insert custom_contact:', err);
    }

    return {
      id,
      name: contact.name.trim(),
      email: contact.email?.trim() || '',
      phone: contact.phone?.trim() || '',
      avatarBg: randomColor,
      isRegistered: false,
      presence: 'available',
      createdAt,
    };
  }

  async deleteContact(userId: string, contactId: string): Promise<boolean> {
    try {
      await pool.query(`DELETE FROM custom_contacts WHERE id = $1 AND user_id = $2`, [contactId, userId]);
    } catch (err) {
      console.error('[CallRepository] Failed to delete custom_contact:', err);
    }
    return true;
  }
}

export const callRepository = new CallRepository();
