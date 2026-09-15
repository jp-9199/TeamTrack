import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AuthorizationService } from '../src/modules/authorization/authorization.service.js';
import type { DbOrganization, DbOrganizationMember } from '../src/db/repositories/organization.repository.js';
import type { DbTeam, DbTeamMember } from '../src/db/repositories/team.repository.js';
import type { DbChannel, DbChannelMember } from '../src/db/repositories/channel.repository.js';

describe('Centralized Authorization & Hierarchy Resolution (Anti-IDOR)', () => {
  // In-memory mock database state for testing authorization hierarchy resolution
  const orgA: DbOrganization = {
    id: 'org-aaa-111',
    name: 'Acme Corp',
    slug: 'acme',
    owner_id: 'user-owner',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const orgB: DbOrganization = {
    id: 'org-bbb-222',
    name: 'Beta Inc',
    slug: 'beta',
    owner_id: 'user-beta-owner',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const orgMembers: DbOrganizationMember[] = [
    {
      id: 'om-1',
      organization_id: orgA.id,
      user_id: 'user-owner',
      role: 'owner',
      status: 'active',
      joined_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'om-2',
      organization_id: orgA.id,
      user_id: 'user-admin',
      role: 'admin',
      status: 'active',
      joined_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'om-3',
      organization_id: orgA.id,
      user_id: 'user-member',
      role: 'member',
      status: 'active',
      joined_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'om-4',
      organization_id: orgA.id,
      user_id: 'user-guest',
      role: 'guest',
      status: 'active',
      joined_at: new Date(),
      updated_at: new Date(),
    },
    // User in Org B
    {
      id: 'om-5',
      organization_id: orgB.id,
      user_id: 'user-foreign',
      role: 'member',
      status: 'active',
      joined_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const team1: DbTeam = {
    id: 'team-pub-1',
    organization_id: orgA.id,
    name: 'Engineering',
    slug: 'engineering',
    description: 'Tech team',
    is_private: false,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const teamPrivate: DbTeam = {
    id: 'team-priv-2',
    organization_id: orgA.id,
    name: 'Executive',
    slug: 'executive',
    description: 'Secret team',
    is_private: true,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const teamMembers: DbTeamMember[] = [
    {
      id: 'tm-1',
      team_id: team1.id,
      user_id: 'user-admin',
      role: 'lead',
      joined_at: new Date(),
    },
    {
      id: 'tm-2',
      team_id: team1.id,
      user_id: 'user-member',
      role: 'member',
      joined_at: new Date(),
    },
    {
      id: 'tm-3',
      team_id: teamPrivate.id,
      user_id: 'user-owner',
      role: 'lead',
      joined_at: new Date(),
    },
  ];

  const channelPublic: DbChannel = {
    id: 'chan-pub-1',
    team_id: team1.id,
    name: 'general',
    description: 'General channel',
    is_private: false,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const channelPrivate: DbChannel = {
    id: 'chan-priv-2',
    team_id: team1.id,
    name: 'backend-secret',
    description: 'Confidential channel',
    is_private: true,
    is_archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const channelMembers: DbChannelMember[] = [
    {
      id: 'cm-1',
      channel_id: channelPrivate.id,
      user_id: 'user-member',
      role: 'member',
      joined_at: new Date(),
    },
  ];

  // Mock DB Queryable
  const mockDb: any = {
    query: async (text: string, params: any[] = []) => {
      // Find Org by ID
      if (text.includes('FROM organizations') && text.includes('WHERE id = $1')) {
        const org = [orgA, orgB].find((o) => o.id === params[0] && o.deleted_at === null);
        return { rows: org ? [org] : [] };
      }
      // Get Org Member
      if (text.includes('FROM organization_members') && text.includes('WHERE organization_id = $1 AND user_id = $2')) {
        const member = orgMembers.find((m) => m.organization_id === params[0] && m.user_id === params[1]);
        return { rows: member ? [member] : [] };
      }
      // Find Team by ID
      if (text.includes('FROM teams') && text.includes('WHERE id = $1')) {
        const t = [team1, teamPrivate].find((team) => team.id === params[0] && team.deleted_at === null);
        return { rows: t ? [t] : [] };
      }
      // Get Team Member
      if (text.includes('FROM team_members') && text.includes('WHERE team_id = $1 AND user_id = $2')) {
        const tm = teamMembers.find((m) => m.team_id === params[0] && m.user_id === params[1]);
        return { rows: tm ? [tm] : [] };
      }
      // Find Channel by ID
      if (text.includes('FROM channels') && text.includes('WHERE id = $1')) {
        const c = [channelPublic, channelPrivate].find((ch) => ch.id === params[0] && ch.deleted_at === null);
        return { rows: c ? [c] : [] };
      }
      // Get Channel Member
      if (text.includes('FROM channel_members') && text.includes('WHERE channel_id = $1 AND user_id = $2')) {
        const cm = channelMembers.find((m) => m.channel_id === params[0] && m.user_id === params[1]);
        return { rows: cm ? [cm] : [] };
      }
      return { rows: [] };
    },
  };

  const authService = new AuthorizationService();

  describe('Organization Authorization', () => {
    it('identifies owner with full privileges', async () => {
      const auth = await authService.getOrganizationAuth('user-owner', orgA.id, mockDb);
      assert.strictEqual(auth.isMember, true);
      assert.strictEqual(auth.isOwner, true);
      assert.strictEqual(auth.isAdmin, true);
      assert.strictEqual(auth.isGuest, false);
      assert.strictEqual(auth.role, 'owner');
    });

    it('identifies admin with operational privileges', async () => {
      const auth = await authService.getOrganizationAuth('user-admin', orgA.id, mockDb);
      assert.strictEqual(auth.isMember, true);
      assert.strictEqual(auth.isOwner, false);
      assert.strictEqual(auth.isAdmin, true);
      assert.strictEqual(auth.isGuest, false);
    });

    it('identifies guest with restricted privileges', async () => {
      const auth = await authService.getOrganizationAuth('user-guest', orgA.id, mockDb);
      assert.strictEqual(auth.isMember, true);
      assert.strictEqual(auth.isGuest, true);
      assert.strictEqual(auth.isAdmin, false);
      assert.strictEqual(auth.isOwner, false);
    });

    it('Anti-IDOR: rejects user from foreign organization (treats as not found)', async () => {
      const auth = await authService.getOrganizationAuth('user-foreign', orgA.id, mockDb);
      assert.strictEqual(auth.isMember, false);
    });

    it('Anti-IDOR: rejects non-existent organization', async () => {
      const auth = await authService.getOrganizationAuth('user-owner', 'non-existent-org-id', mockDb);
      assert.strictEqual(auth.isMember, false);
    });
  });

  describe('Team Authorization & Anti-Enumeration', () => {
    it('allows team member to access public team', async () => {
      const auth = await authService.getTeamAuth('user-member', team1.id, mockDb);
      assert.strictEqual(auth.teamExists, true);
      assert.strictEqual(auth.isMember, true);
      assert.strictEqual(auth.isLead, false);
    });

    it('allows team lead with isLead = true', async () => {
      const auth = await authService.getTeamAuth('user-admin', team1.id, mockDb);
      assert.strictEqual(auth.teamExists, true);
      assert.strictEqual(auth.isMember, true);
      assert.strictEqual(auth.isLead, true);
      assert.strictEqual(auth.isOrgOwnerOrAdmin, true);
    });

    it('Anti-Enumeration: hides private team from non-members (returns teamExists = false for 404)', async () => {
      const auth = await authService.getTeamAuth('user-member', teamPrivate.id, mockDb);
      assert.strictEqual(auth.teamExists, false, 'Private team must be hidden (404) from unauthorized users');
    });

    it('allows org owner to access private team even if not explicitly listed', async () => {
      const auth = await authService.getTeamAuth('user-owner', teamPrivate.id, mockDb);
      assert.strictEqual(auth.teamExists, true);
      assert.strictEqual(auth.isOrgOwnerOrAdmin, true);
    });

    it('Anti-IDOR: hides team completely from foreign organization user', async () => {
      const auth = await authService.getTeamAuth('user-foreign', team1.id, mockDb);
      assert.strictEqual(auth.teamExists, false);
    });
  });

  describe('Channel Authorization & Private Channel Isolation', () => {
    it('allows active team member to access public channel', async () => {
      const auth = await authService.getChannelAuth('user-member', channelPublic.id, mockDb);
      assert.strictEqual(auth.channelExists, true);
      assert.strictEqual(auth.canAccess, true);
      assert.strictEqual(auth.isPrivate, false);
    });

    it('allows explicit member to access private channel', async () => {
      const auth = await authService.getChannelAuth('user-member', channelPrivate.id, mockDb);
      assert.strictEqual(auth.channelExists, true);
      assert.strictEqual(auth.canAccess, true);
      assert.strictEqual(auth.isPrivate, true);
      assert.strictEqual(auth.isChannelMember, true);
    });

    it('Anti-Enumeration: hides private channel from team member who is not a channel member', async () => {
      // user-guest has no channel membership
      const auth = await authService.getChannelAuth('user-guest', channelPrivate.id, mockDb);
      assert.strictEqual(auth.channelExists, false, 'Private channel must be hidden (404) from non-members');
      assert.strictEqual(auth.canAccess, false);
    });

    it('allows team lead or org admin to access private channel', async () => {
      const auth = await authService.getChannelAuth('user-admin', channelPrivate.id, mockDb);
      assert.strictEqual(auth.channelExists, true);
      assert.strictEqual(auth.canAccess, true);
      assert.strictEqual(auth.isLeadOrOrgAdmin, true);
    });

    it('Anti-IDOR: cross-tenant user accessing channel gets 404 NOT_FOUND', async () => {
      const auth = await authService.getChannelAuth('user-foreign', channelPublic.id, mockDb);
      assert.strictEqual(auth.channelExists, false);
      assert.strictEqual(auth.canAccess, false);
    });
  });
});
