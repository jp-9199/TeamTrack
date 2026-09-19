/**
 * TeamTrack Desktop — Microsoft Teams Experience
 * Complete client application logic
 */

(function () {
  'use strict';

  // --- Initial Data ---
  const currentUser = {
    name: 'Alex Morgan',
    role: 'Principal Engineer',
    avatar: 'AM',
    email: 'alex.morgan@teamtrack.enterprise',
    status: 'available', // available | busy | away | offline
  };

  const chats = [
    {
      id: 'sarah',
      name: 'Sarah Chen',
      avatar: 'SC',
      role: 'Design Lead',
      status: 'available',
      unread: 0,
      time: '10:42 AM',
      preview: 'I just uploaded the updated Fluent 2 tokens.',
      messages: [
        { id: 1, sender: 'Sarah Chen', avatar: 'SC', time: '10:38 AM', inOut: 'in', text: 'Hey Alex! Did you get a chance to check the new desktop layouts?' },
        { id: 2, sender: 'Alex Morgan', avatar: 'AM', time: '10:40 AM', inOut: 'out', text: 'Yes, looking sharp! The Fluent styling and custom titlebar are spot on.' },
        { id: 3, sender: 'Sarah Chen', avatar: 'SC', time: '10:42 AM', inOut: 'in', text: 'Awesome! I just uploaded the updated Fluent 2 tokens. Let me know if you need anything else.' },
      ]
    },
    {
      id: 'david',
      name: 'David Kim',
      avatar: 'DK',
      role: 'Backend Architect',
      status: 'busy',
      unread: 1,
      time: '9:15 AM',
      preview: 'Redis cluster failover tests passed with zero drops.',
      messages: [
        { id: 1, sender: 'David Kim', avatar: 'DK', time: '9:10 AM', inOut: 'in', text: 'Good morning! Running the Phase 12 & 13 security suites.' },
        { id: 2, sender: 'David Kim', avatar: 'DK', time: '9:15 AM', inOut: 'in', text: 'Redis cluster failover tests passed with zero drops.' },
      ]
    },
    {
      id: 'engineering',
      name: 'Core Engineering',
      avatar: 'CE',
      role: '5 members',
      status: 'available',
      isGroup: true,
      unread: 0,
      time: 'Yesterday',
      preview: 'Pushed the new Electron 33 secureStorage integration.',
      messages: [
        { id: 1, sender: 'Alex Rivera', avatar: 'AR', time: 'Yesterday 4:15 PM', inOut: 'in', text: 'Reminder: Code freeze is at 6 PM today.' },
        { id: 2, sender: 'Alex Morgan', avatar: 'AM', time: 'Yesterday 4:30 PM', inOut: 'out', text: 'Pushed the new Electron 33 secureStorage integration.' },
        { id: 3, sender: 'Sarah Chen', avatar: 'SC', time: 'Yesterday 4:32 PM', inOut: 'in', text: 'LGTM! Tested on Windows and Mac.' },
      ]
    },
    {
      id: 'alex-r',
      name: 'Alex Rivera',
      avatar: 'AR',
      role: 'VP Product',
      status: 'away',
      unread: 0,
      time: 'Sep 18',
      preview: 'Great work on the enterprise governance compliance.',
      messages: [
        { id: 1, sender: 'Alex Rivera', avatar: 'AR', time: 'Sep 18', inOut: 'in', text: 'Great work on the enterprise governance compliance.' },
      ]
    }
  ];

  const teams = [
    {
      id: 'eng-team',
      name: 'Engineering Core',
      avatar: 'EC',
      color: '#5B5FC7',
      channels: [
        { id: 'eng-general', name: 'General', unread: 0 },
        { id: 'eng-arch', name: 'Architecture & Design', unread: 2 },
        { id: 'eng-releases', name: 'Releases & CI/CD', unread: 0 },
      ]
    },
    {
      id: 'prod-team',
      name: 'Product & Design',
      avatar: 'PD',
      color: '#008272',
      channels: [
        { id: 'prod-general', name: 'General', unread: 0 },
        { id: 'prod-design-tokens', name: 'Fluent Design System', unread: 0 },
      ]
    },
    {
      id: 'org-team',
      name: 'All Company',
      avatar: 'AC',
      color: '#C4314B',
      channels: [
        { id: 'all-announcements', name: 'Announcements', unread: 0 },
        { id: 'all-watercooler', name: 'Watercooler', unread: 0 },
      ]
    }
  ];

  const channelPosts = {
    'eng-general': [
      {
        id: 1,
        author: 'David Kim',
        avatar: 'DK',
        date: 'Today at 9:30 AM',
        subject: 'TypeScript 5.6 & Node 22 Upgrade Complete',
        content: 'All packages in the workspace now compile cleanly with TS 5.6. Zero direct database access from Electron renderer, full IPC isolation enforced.',
        replies: [
          { author: 'Sarah Chen', text: 'Verified frontend packages build smoothly!' },
          { author: 'Alex Morgan', text: 'Confirmed desktop test suite passes 100%.' }
        ]
      },
      {
        id: 2,
        author: 'Alex Rivera',
        avatar: 'AR',
        date: 'Yesterday at 3:00 PM',
        subject: 'Sprint 14 Kickoff',
        content: 'Focus areas this week: Microsoft Teams native experience, mobile bottom bar navigation, and complete test validation.',
        replies: []
      }
    ],
    'eng-arch': [
      {
        id: 3,
        author: 'Alex Morgan',
        avatar: 'AM',
        date: 'Today at 8:45 AM',
        subject: 'Electron IPC Architecture Review',
        content: 'We have updated preload.js with window controls, shell, and notification bridges conforming to Microsoft Fluent guidelines.',
        replies: [
          { author: 'David Kim', text: 'Looks rock solid. SafeStorage abstraction is fully protected.' }
        ]
      }
    ]
  };

  const calendarEvents = [
    { id: 1, title: 'Daily Engineering Standup', time: '10:00 AM - 10:30 AM', organizer: 'David Kim', room: 'Teams Virtual Room 1', active: true },
    { id: 2, title: 'Q3 Enterprise Architecture Sync', time: '1:00 PM - 2:00 PM', organizer: 'Alex Rivera', room: 'Teams Virtual Room 4', active: false },
    { id: 3, title: 'Fluent 2 Mobile UI/UX Review', time: '3:30 PM - 4:15 PM', organizer: 'Sarah Chen', room: 'Design Stage', active: false },
    { id: 4, title: 'Executive Demo & Deployment Prep', time: '5:00 PM - 5:45 PM', organizer: 'Alex Morgan', room: 'Boardroom A', active: false },
  ];

  const notifications = [
    { id: 1, title: 'Sarah Chen mentioned you in #Architecture', body: '@Alex Morgan could you review the component layout?', time: '10m ago', unread: true },
    { id: 2, title: 'David Kim reacted 👍 to your message', body: 'Pushed the new Electron 33 secureStorage integration.', time: '1h ago', unread: true },
    { id: 3, title: 'Upcoming Meeting: Daily Standup', body: 'Starts in 15 minutes in Virtual Room 1.', time: '15m ago', unread: true },
    { id: 4, title: 'CI/CD Pipeline Succeeded', body: 'Build #419 completed with 0 errors across 41 test suites.', time: '2h ago', unread: false },
  ];

  const cloudFiles = [
    { name: 'TeamTrack_Architecture_Spec_v2.docx', type: 'docx', size: '2.4 MB', modified: 'Today by Alex Morgan' },
    { name: 'Q3_Enterprise_Roadmap_Final.pptx', type: 'pptx', size: '14.8 MB', modified: 'Yesterday by Alex Rivera' },
    { name: 'Security_Audit_Report_Phase13.pdf', type: 'pdf', size: '3.1 MB', modified: 'Sep 18 by David Kim' },
    { name: 'Sprint_Metrics_2026.xlsx', type: 'xlsx', size: '840 KB', modified: 'Sep 17 by Sarah Chen' },
    { name: 'Design_System_Tokens_Fluent2.json', type: 'docx', size: '128 KB', modified: 'Sep 16 by Sarah Chen' },
  ];

  // --- State ---
  let activeTab = 'chat';
  let activeChatId = 'sarah';
  let activeChannelId = 'eng-general';
  let activeTeamName = 'Engineering Core';
  let activeChannelName = 'General';
  let inMeeting = false;
  let meetingSeconds = 0;
  let meetingTimerInterval = null;
  let isMicMuted = false;
  let isCameraOff = false;
  let isScreenSharing = false;

  // --- DOM Elements ---
  const railItems = document.querySelectorAll('.rail-item[data-tab]');
  const sidebar = document.getElementById('sidebar');
  const stage = document.getElementById('stage');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const avatarBtn = document.getElementById('avatar-btn');
  const userMenu = document.getElementById('user-menu');
  const userMenuOverlay = document.getElementById('user-menu-overlay');

  // Titlebar controls
  const btnMin = document.getElementById('btn-minimize');
  const btnMax = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  // Search input
  const globalSearchInput = document.getElementById('global-search-input');

  // --- Initial Setup ---
  function init() {
    setupWindowControls();
    setupNavigation();
    setupUserMenu();
    setupKeyboardShortcuts();
    renderCurrentView();
  }

  // --- Window Controls ---
  function setupWindowControls() {
    btnMin?.addEventListener('click', () => {
      if (window.teamtrack?.window?.minimize) {
        window.teamtrack.window.minimize();
      }
    });

    btnMax?.addEventListener('click', async () => {
      if (window.teamtrack?.window?.maximize) {
        window.teamtrack.window.maximize();
      }
    });

    btnClose?.addEventListener('click', () => {
      if (window.teamtrack?.window?.close) {
        window.teamtrack.window.close();
      } else {
        window.close();
      }
    });

    sidebarToggle?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
    });
  }

  // --- Navigation ---
  function setupNavigation() {
    railItems.forEach((item) => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (!tab) return;
        switchTab(tab);
      });
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    railItems.forEach((item) => {
      if (item.getAttribute('data-tab') === tab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    renderCurrentView();
  }

  // --- User Menu & Status ---
  function setupUserMenu() {
    avatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = userMenu?.classList.contains('hidden');
      if (isHidden) {
        openUserMenu();
      } else {
        closeUserMenu();
      }
    });

    userMenuOverlay?.addEventListener('click', closeUserMenu);

    document.querySelectorAll('.status-picker-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const newStatus = opt.getAttribute('data-status');
        if (newStatus) {
          currentUser.status = newStatus;
          updateStatusIndicators();
          closeUserMenu();
        }
      });
    });

    document.getElementById('menu-toggle-dark-mode')?.addEventListener('click', () => {
      toggleDarkMode();
      closeUserMenu();
    });
  }

  function openUserMenu() {
    userMenu?.classList.remove('hidden');
    userMenuOverlay?.classList.remove('hidden');
  }

  function closeUserMenu() {
    userMenu?.classList.add('hidden');
    userMenuOverlay?.classList.add('hidden');
  }

  function updateStatusIndicators() {
    const statusColors = {
      available: '#92C353',
      busy: '#C4314B',
      away: '#F8D22A',
      offline: '#8A8886'
    };
    const color = statusColors[currentUser.status] || '#92C353';
    const dot = document.getElementById('avatar-status');
    if (dot) dot.style.backgroundColor = color;
  }

  function toggleDarkMode() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('teamtrack_theme', isDark ? 'dark' : 'light');
  }

  // --- Keyboard Shortcuts ---
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'k')) {
        e.preventDefault();
        globalSearchInput?.focus();
      }
      if (e.key === 'Escape') {
        closeUserMenu();
        closeModal();
      }
    });
  }

  // --- Render Orchestration ---
  function renderCurrentView() {
    renderSidebar();
    renderStage();
  }

  // --- Render Sidebar ---
  function renderSidebar() {
    if (!sidebar) return;

    if (activeTab === 'chat') {
      renderChatSidebar();
    } else if (activeTab === 'teams') {
      renderTeamsSidebar();
    } else if (activeTab === 'activity') {
      renderActivitySidebar();
    } else if (activeTab === 'calendar') {
      renderCalendarSidebar();
    } else if (activeTab === 'calls') {
      renderCallsSidebar();
    } else if (activeTab === 'files') {
      renderFilesSidebar();
    } else if (activeTab === 'copilot') {
      renderCopilotSidebar();
    } else if (activeTab === 'settings') {
      renderSettingsSidebar();
    }
  }

  // 1. Chat Sidebar
  function renderChatSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Chat</span>
        <div class="sidebar-actions">
          <button class="sidebar-action-btn" id="btn-new-chat" title="New chat (Ctrl+N)">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        </div>
      </div>
      <div class="sidebar-filter-pills">
        <button class="filter-pill active">All</button>
        <button class="filter-pill">Unread</button>
        <button class="filter-pill">Meetings</button>
      </div>
      <div class="sidebar-search">
        <div class="sidebar-search-input">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="opacity:0.6;">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
          </svg>
          <input type="text" id="chat-filter-input" placeholder="Filter by name..." />
        </div>
      </div>
      <div class="sidebar-list" id="chat-items-list">
        <div class="section-heading">Pinned</div>
        ${renderChatRows(chats.slice(0, 2))}
        <div class="section-heading">Recent</div>
        ${renderChatRows(chats.slice(2))}
      </div>
    `;

    document.querySelectorAll('.chat-item[data-chat-id]').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-chat-id');
        if (id) {
          activeChatId = id;
          renderCurrentView();
        }
      });
    });

    document.getElementById('btn-new-chat')?.addEventListener('click', openNewChatModal);
  }

  function renderChatRows(chatList) {
    return chatList.map((c) => `
      <div class="chat-item ${c.id === activeChatId ? 'selected' : ''}" data-chat-id="${c.id}">
        <div class="chat-item-avatar">
          ${c.avatar}
          <div class="avatar-status-dot" style="background:${getStatusColor(c.status)};"></div>
        </div>
        <div class="chat-item-info">
          <div class="chat-item-name">${escapeHtml(c.name)}</div>
          <div class="chat-item-preview">${escapeHtml(c.preview)}</div>
        </div>
        <div class="chat-item-meta">
          <div class="chat-item-time">${c.time}</div>
          ${c.unread > 0 ? `<div class="unread-dot"></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // 2. Teams Sidebar
  function renderTeamsSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Teams</span>
        <div class="sidebar-actions">
          <button class="sidebar-action-btn" title="Join or create a team" id="btn-create-team">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div class="sidebar-list">
        ${teams.map((t) => `
          <div class="team-header">
            <div class="team-avatar" style="background:${t.color};">${t.avatar}</div>
            <div class="team-name">${escapeHtml(t.name)}</div>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="color:var(--text-tertiary);">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
          <div style="padding-left:14px; margin-bottom:8px;">
            ${t.channels.map((ch) => `
              <div class="channel-row ${ch.id === activeChannelId ? 'selected' : ''}" data-team-name="${escapeHtml(t.name)}" data-channel-id="${ch.id}" data-channel-name="${escapeHtml(ch.name)}">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.56-2.242a1 1 0 111.94.484L14.53 6H17a1 1 0 110 2h-2.97l-.5 2H16a1 1 0 110 2h-2.97l-.56 2.242a1 1 0 11-1.94-.484L11.03 12H8.09l-.56 2.242a1 1 0 01-1.94-.484L6.03 12H3a1 1 0 110-2h3.47l.5-2H4a1 1 0 110-2h3.47l.56-2.242a1 1 0 011.213-.728zM8.59 8l-.5 2h2.94l.5-2H8.59z" clip-rule="evenodd" />
                </svg>
                <span>${escapeHtml(ch.name)}</span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    document.querySelectorAll('.channel-row[data-channel-id]').forEach((row) => {
      row.addEventListener('click', () => {
        activeChannelId = row.getAttribute('data-channel-id') || 'eng-general';
        activeChannelName = row.getAttribute('data-channel-name') || 'General';
        activeTeamName = row.getAttribute('data-team-name') || 'Engineering Core';
        renderCurrentView();
      });
    });
  }

  // 3. Activity Sidebar
  function renderActivitySidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Activity</span>
      </div>
      <div class="sidebar-filter-pills">
        <button class="filter-pill active">Feed</button>
        <button class="filter-pill">My Activity</button>
      </div>
      <div class="notif-list">
        ${notifications.map((n) => `
          <div class="notif-item ${n.unread ? 'unread' : ''}">
            <div class="notif-icon">🔔</div>
            <div class="notif-content">
              <div class="notif-title">${escapeHtml(n.title)}</div>
              <div class="notif-body">${escapeHtml(n.body)}</div>
              <div class="notif-time">${n.time}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 4. Calendar Sidebar
  function renderCalendarSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Calendar</span>
        <div class="sidebar-actions">
          <button class="sidebar-action-btn" id="btn-schedule-meeting" title="New meeting">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div style="padding: 12px 16px;">
        <button class="btn-primary w-full" id="btn-sidebar-meet-now" style="justify-content:center; margin-bottom:12px;">
          📹 Meet Now
        </button>
        <button class="btn-secondary w-full" id="btn-sidebar-new-meeting" style="justify-content:center;">
          📅 Schedule Meeting
        </button>
      </div>
      <div class="section-heading">Today's Schedule</div>
      <div class="sidebar-list">
        ${calendarEvents.map((ev) => `
          <div class="meeting-card" style="margin-bottom:8px; padding:10px 12px;">
            <div class="meeting-card-info">
              <div class="meeting-card-title" style="font-size:13px;">${escapeHtml(ev.title)}</div>
              <div class="meeting-card-sub">${ev.time}</div>
            </div>
            ${ev.active ? `<button class="meeting-card-join" style="padding:4px 10px; font-size:11px;" onclick="window.startTeamsCall('${escapeHtml(ev.title)}')">Join</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('btn-sidebar-meet-now')?.addEventListener('click', () => {
      startVideoMeeting('Ad-hoc Quick Sync');
    });
    document.getElementById('btn-sidebar-new-meeting')?.addEventListener('click', openNewMeetingModal);
    document.getElementById('btn-schedule-meeting')?.addEventListener('click', openNewMeetingModal);
  }

  // 5. Calls Sidebar
  function renderCallsSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Calls</span>
      </div>
      <div class="sidebar-filter-pills">
        <button class="filter-pill active">Speed Dial</button>
        <button class="filter-pill">History</button>
      </div>
      <div class="sidebar-list">
        <div class="section-heading">Speed Dial</div>
        ${chats.map((c) => `
          <div class="chat-item" onclick="window.startTeamsCall('${escapeHtml(c.name)}')">
            <div class="chat-item-avatar">
              ${c.avatar}
              <div class="avatar-status-dot" style="background:${getStatusColor(c.status)};"></div>
            </div>
            <div class="chat-item-info">
              <div class="chat-item-name">${escapeHtml(c.name)}</div>
              <div class="chat-item-preview">${escapeHtml(c.role)}</div>
            </div>
            <button class="chat-action-btn brand" title="Call">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 6. Files Sidebar
  function renderFilesSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Files</span>
      </div>
      <div class="sidebar-list">
        <div class="section-heading">Cloud Storage</div>
        <div class="channel-row selected">
          <span>📁 Microsoft OneDrive / Teams</span>
        </div>
        <div class="channel-row">
          <span>⬇️ Downloads</span>
        </div>
      </div>
    `;
  }

  // 7. Copilot Sidebar
  function renderCopilotSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Copilot</span>
      </div>
      <div class="sidebar-list" style="padding:12px;">
        <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.5; margin-bottom:14px;">
          Microsoft 365 Copilot in TeamTrack helps summarize discussions, write status reports, and prepare meeting agendas.
        </p>
        <div class="section-heading">Suggested Prompts</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="ai-suggestion-chip" onclick="window.sendCopilotPrompt('Summarize unread messages across all channels')">
            ✨ Summarize unread messages
          </button>
          <button class="ai-suggestion-chip" onclick="window.sendCopilotPrompt('Prepare an agenda for the Daily Standup')">
            📝 Prepare standup agenda
          </button>
          <button class="ai-suggestion-chip" onclick="window.sendCopilotPrompt('Draft release notes for Phase 13')">
            🚀 Draft Phase 13 release notes
          </button>
        </div>
      </div>
    `;
  }

  // 8. Settings Sidebar
  function renderSettingsSidebar() {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">Settings</span>
      </div>
      <div class="sidebar-list">
        <div class="settings-nav-item active">
          <span>👤 General & Account</span>
        </div>
        <div class="settings-nav-item">
          <span>🎨 Appearance</span>
        </div>
        <div class="settings-nav-item">
          <span>🔔 Notifications</span>
        </div>
        <div class="settings-nav-item">
          <span>🎙️ Devices (Audio & Video)</span>
        </div>
      </div>
    `;
  }

  // --- Render Stage ---
  function renderStage() {
    if (!stage) return;

    if (inMeeting) {
      renderVideoCallStage();
      return;
    }

    if (activeTab === 'chat') {
      renderChatStage();
    } else if (activeTab === 'teams') {
      renderChannelStage();
    } else if (activeTab === 'activity') {
      renderActivityStage();
    } else if (activeTab === 'calendar') {
      renderCalendarStage();
    } else if (activeTab === 'calls') {
      renderCallsStage();
    } else if (activeTab === 'files') {
      renderFilesStage();
    } else if (activeTab === 'copilot') {
      renderCopilotStage();
    } else if (activeTab === 'settings') {
      renderSettingsStage();
    }
  }

  // 1. Chat Stage
  function renderChatStage() {
    const currentChat = chats.find((c) => c.id === activeChatId) || chats[0];
    stage.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-left">
          <div class="chat-header-avatar">${currentChat.avatar}</div>
          <div>
            <div class="chat-header-name">${escapeHtml(currentChat.name)}</div>
            <div class="chat-header-sub">${currentChat.isGroup ? currentChat.role : `${capitalize(currentChat.status)} • ${currentChat.role}`}</div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="chat-action-btn brand" id="btn-audio-call" title="Start audio call">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
            </svg>
          </button>
          <button class="chat-action-btn brand" id="btn-video-call" title="Start video call">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </button>
          <button class="chat-action-btn" id="btn-screen-share" title="Share screen">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div class="messages-area" id="messages-container">
        ${currentChat.messages.map((m) => `
          <div class="message-group ${m.inOut === 'out' ? 'mine' : ''}">
            <div class="message-avatar">${m.avatar}</div>
            <div class="message-body">
              <div class="message-meta">
                <span class="message-sender">${escapeHtml(m.sender)}</span>
                <span class="message-time">${m.time}</span>
              </div>
              <div class="message-bubble ${m.inOut === 'out' ? 'out' : 'in'}">
                ${escapeHtml(m.text)}
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="composer-wrap">
        <div class="composer-box">
          <textarea
            class="composer-textarea"
            id="chat-composer-textarea"
            placeholder="Type a message. Press Enter to send..."
            rows="2"
          ></textarea>
          <div class="composer-actions">
            <div class="composer-tools">
              <button class="composer-tool-btn" title="Format"><strong>B</strong></button>
              <button class="composer-tool-btn" title="Attach file">📎</button>
              <button class="composer-tool-btn" title="Emoji">😊</button>
              <button class="composer-tool-btn" title="GIF">GIF</button>
            </div>
            <button class="send-btn active" id="btn-send-message" title="Send (Enter)">
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    scrollToBottom();

    const textarea = document.getElementById('chat-composer-textarea');
    const sendBtn = document.getElementById('btn-send-message');

    function handleSend() {
      const text = textarea?.value.trim();
      if (!text) return;
      sendMessage(text);
      if (textarea) textarea.value = '';
    }

    sendBtn?.addEventListener('click', handleSend);

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    document.getElementById('btn-video-call')?.addEventListener('click', () => {
      startVideoMeeting(`Call with ${currentChat.name}`);
    });

    document.getElementById('btn-audio-call')?.addEventListener('click', () => {
      startVideoMeeting(`Audio Call with ${currentChat.name}`);
    });
  }

  function sendMessage(text) {
    const currentChat = chats.find((c) => c.id === activeChatId);
    if (!currentChat) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    currentChat.messages.push({
      id: Date.now(),
      sender: currentUser.name,
      avatar: currentUser.avatar,
      time: timeStr,
      inOut: 'out',
      text
    });
    currentChat.preview = text;
    currentChat.time = timeStr;

    renderStage();
    renderSidebar();

    if (window.teamtrack?.system?.showNotification) {
      window.teamtrack.system.showNotification('Message Sent', text);
    }

    setTimeout(() => {
      simulateReply(currentChat);
    }, 1000);
  }

  function simulateReply(chat) {
    const replies = [
      "Sounds great! Looking forward to reviewing this in the standup.",
      "Got it! That aligns perfectly with our enterprise roadmap.",
      "Thanks for the update! All tests are passing on our end as well.",
      "Awesome, will test that immediately."
    ];
    const replyText = replies[Math.floor(Math.random() * replies.length)];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    chat.messages.push({
      id: Date.now(),
      sender: chat.name,
      avatar: chat.avatar,
      time: timeStr,
      inOut: 'in',
      text: replyText
    });
    chat.preview = replyText;
    chat.time = timeStr;

    if (activeTab === 'chat' && activeChatId === chat.id) {
      renderStage();
    }
    renderSidebar();

    if (window.teamtrack?.system?.showNotification) {
      window.teamtrack.system.showNotification(chat.name, replyText);
    }
  }

  function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // 2. Channel Stage (Teams Posts)
  function renderChannelStage() {
    const posts = channelPosts[activeChannelId] || [
      {
        id: 1,
        author: 'Alex Morgan',
        avatar: 'AM',
        date: 'Today at 10:00 AM',
        subject: `Welcome to #${activeChannelName}`,
        content: `This is the start of the #${activeChannelName} channel in ${activeTeamName}. Share files, conversations, and updates here.`,
        replies: []
      }
    ];

    stage.innerHTML = `
      <div class="channel-stage">
        <div class="channel-header">
          <div class="channel-header-title">
            <span style="color:var(--text-tertiary);">#</span>
            <span>${escapeHtml(activeChannelName)}</span>
          </div>
          <button class="btn-primary" onclick="window.startTeamsCall('Channel Sync: #${escapeHtml(activeChannelName)}')">
            📹 Meet
          </button>
        </div>
        <div class="channel-tabs">
          <div class="channel-tab active">Posts</div>
          <div class="channel-tab">Files</div>
          <div class="channel-tab">Notes</div>
        </div>
        <div class="channel-feed">
          ${posts.map((p) => `
            <div class="post-card">
              <div class="post-header">
                <div class="message-avatar">${p.avatar}</div>
                <div>
                  <div class="post-author">${escapeHtml(p.author)}</div>
                  <div class="post-date">${p.date}</div>
                </div>
              </div>
              <div class="post-subject">${escapeHtml(p.subject)}</div>
              <div class="post-content">${escapeHtml(p.content)}</div>
              ${p.replies.length > 0 ? `
                <div class="post-replies">
                  ${p.replies.map((r) => `
                    <div class="post-reply-item">
                      <strong>${escapeHtml(r.author)}:</strong> ${escapeHtml(r.text)}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              <div class="post-reply-btn" onclick="window.promptReply(${p.id})">
                💬 Reply
              </div>
            </div>
          `).join('')}
          <div class="new-post-box" onclick="window.promptNewPost()">
            <span>✏️ Start a new post in #${escapeHtml(activeChannelName)}...</span>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Video Call Stage
  function renderVideoCallStage() {
    stage.innerHTML = `
      <div class="video-stage">
        <div class="video-header">
          <div class="video-meeting-title">
            <span style="color:#4ADE80;">●</span>
            <span>TeamTrack Meeting</span>
            <span class="video-meeting-duration" id="meeting-duration-label">00:00</span>
          </div>
          <div style="font-size:12px; color:#C8C6C4;">4 Participants • Encrypted</div>
        </div>

        <div class="video-grid">
          <div class="video-tile active-speaker">
            <div class="video-tile-avatar" style="background:#5B5FC7;">AM</div>
            <div class="video-tile-name">${currentUser.name} (You)</div>
            <div class="video-tile-badge">🎤 Speaking</div>
          </div>
          <div class="video-tile">
            <div class="video-tile-avatar" style="background:#008272;">SC</div>
            <div class="video-tile-name">Sarah Chen</div>
            <div class="video-tile-badge">Design Lead</div>
          </div>
          <div class="video-tile">
            <div class="video-tile-avatar" style="background:#C4314B;">DK</div>
            <div class="video-tile-name">David Kim</div>
            <div class="video-tile-badge">Backend Architect</div>
          </div>
          <div class="video-tile">
            <div class="video-tile-avatar" style="background:#B146C2;">AR</div>
            <div class="video-tile-name">Alex Rivera</div>
            <div class="video-tile-badge">VP Product</div>
          </div>
        </div>

        <div class="video-controls-bar">
          <button class="video-btn ${isMicMuted ? 'active' : ''}" id="btn-call-mic" title="Mute/Unmute microphone">
            ${isMicMuted ? '🔇' : '🎙️'}
          </button>
          <button class="video-btn ${isCameraOff ? 'active' : ''}" id="btn-call-cam" title="Turn camera on/off">
            ${isCameraOff ? '🚫' : '📹'}
          </button>
          <button class="video-btn ${isScreenSharing ? 'active' : ''}" id="btn-call-share" title="Share Screen">
            🖥️
          </button>
          <button class="video-btn" title="Raise Hand">
            ✋
          </button>
          <button class="video-btn" title="Reactions">
            👏
          </button>
          <button class="video-btn leave" id="btn-call-leave" title="Leave meeting">
            Leave
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-call-mic')?.addEventListener('click', () => {
      isMicMuted = !isMicMuted;
      renderVideoCallStage();
    });

    document.getElementById('btn-call-cam')?.addEventListener('click', () => {
      isCameraOff = !isCameraOff;
      renderVideoCallStage();
    });

    document.getElementById('btn-call-share')?.addEventListener('click', () => {
      isScreenSharing = !isScreenSharing;
      renderVideoCallStage();
    });

    document.getElementById('btn-call-leave')?.addEventListener('click', endVideoMeeting);
  }

  function startVideoMeeting(title) {
    inMeeting = true;
    meetingSeconds = 0;
    if (meetingTimerInterval) clearInterval(meetingTimerInterval);
    meetingTimerInterval = setInterval(() => {
      meetingSeconds++;
      const mins = String(Math.floor(meetingSeconds / 60)).padStart(2, '0');
      const secs = String(meetingSeconds % 60).padStart(2, '0');
      const label = document.getElementById('meeting-duration-label');
      if (label) label.textContent = `${mins}:${secs}`;
    }, 1000);

    renderStage();
  }

  function endVideoMeeting() {
    inMeeting = false;
    if (meetingTimerInterval) {
      clearInterval(meetingTimerInterval);
      meetingTimerInterval = null;
    }
    renderStage();
  }

  // 4. Calendar Stage
  function renderCalendarStage() {
    stage.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div class="calendar-header">
          <div class="calendar-nav">
            <button class="calendar-today-btn">Today</button>
            <button class="calendar-nav-btn">‹</button>
            <button class="calendar-nav-btn">›</button>
            <span class="calendar-month-label">September 2026</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-secondary" onclick="window.startTeamsCall('Instant Meeting')">📹 Meet Now</button>
            <button class="btn-primary" id="btn-stage-new-meeting">+ New Meeting</button>
          </div>
        </div>

        <div class="calendar-grid-wrap">
          <div class="calendar-weekdays">
            <div class="calendar-weekday">Sun</div>
            <div class="calendar-weekday">Mon</div>
            <div class="calendar-weekday">Tue</div>
            <div class="calendar-weekday">Wed</div>
            <div class="calendar-weekday">Thu</div>
            <div class="calendar-weekday">Fri</div>
            <div class="calendar-weekday">Sat</div>
          </div>
          <div class="calendar-grid">
            ${renderCalendarCells()}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-stage-new-meeting')?.addEventListener('click', openNewMeetingModal);
  }

  function renderCalendarCells() {
    let cells = '';
    for (let day = 1; day <= 30; day++) {
      const isToday = day === 19;
      cells += `
        <div class="calendar-cell ${isToday ? 'today' : ''}">
          <div class="day-num">${day}</div>
          ${day === 19 ? `
            <div class="cal-event" onclick="window.startTeamsCall('Daily Standup')">10:00 AM Standup</div>
            <div class="cal-event" style="background:#E0F2FE; color:#0284C7;">1:00 PM Arch Sync</div>
          ` : ''}
          ${day === 20 ? `<div class="cal-event" style="background:#FEF3C7; color:#D97706;">11:00 AM Demo</div>` : ''}
        </div>
      `;
    }
    return cells;
  }

  // 5. Activity Stage
  function renderActivityStage() {
    stage.innerHTML = `
      <div style="flex:1; padding:24px; overflow-y:auto;">
        <h2 style="font-size:20px; font-weight:700; margin-bottom:16px;">Activity Feed</h2>
        <div class="settings-card">
          ${notifications.map((n) => `
            <div class="settings-row" style="cursor:pointer;" onclick="window.switchTab('chat')">
              <div>
                <div class="settings-row-label">${escapeHtml(n.title)}</div>
                <div class="settings-row-sub">${escapeHtml(n.body)}</div>
              </div>
              <span style="font-size:11px; color:var(--text-tertiary);">${n.time}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 6. Calls Stage
  function renderCallsStage() {
    stage.innerHTML = `
      <div class="people-header">
        <h2 style="font-size:20px; font-weight:700;">People & Contacts</h2>
        <div class="people-search">
          <input type="text" placeholder="Search contacts by name or role..." />
        </div>
      </div>
      <div class="people-grid">
        ${chats.map((c) => `
          <div class="person-card" onclick="window.startTeamsCall('${escapeHtml(c.name)}')">
            <div class="person-card-avatar">
              ${c.avatar}
              <div class="person-card-status" style="background:${getStatusColor(c.status)};"></div>
            </div>
            <div class="person-card-name">${escapeHtml(c.name)}</div>
            <div class="person-card-role">${escapeHtml(c.role)}</div>
            <div class="person-card-actions">
              <button class="person-action-btn" title="Call">📞</button>
              <button class="person-action-btn" title="Video">📹</button>
              <button class="person-action-btn" title="Message" onclick="event.stopPropagation(); window.openChatWith('${c.id}')">💬</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 7. Files Stage
  function renderFilesStage() {
    stage.innerHTML = `
      <div class="files-stage">
        <div class="files-header">
          <h2 style="font-size:18px; font-weight:700;">Microsoft OneDrive & Teams Files</h2>
          <button class="btn-primary" onclick="alert('Upload file simulated.')">+ Upload File</button>
        </div>
        <div style="flex:1; overflow-y:auto;">
          <table class="files-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Modified</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              ${cloudFiles.map((f) => `
                <tr>
                  <td>
                    <div class="file-name-cell">
                      <div class="file-type-icon file-${f.type}">${f.type.toUpperCase().slice(0, 3)}</div>
                      <span>${escapeHtml(f.name)}</span>
                    </div>
                  </td>
                  <td style="color:var(--text-secondary);">${f.modified}</td>
                  <td style="color:var(--text-tertiary);">${f.size}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 8. Copilot Stage
  function renderCopilotStage() {
    stage.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div class="chat-header">
          <div class="chat-header-left">
            <div class="ai-icon">✨</div>
            <div>
              <div class="chat-header-name">Microsoft Copilot for TeamTrack</div>
              <div class="chat-header-sub">Enterprise AI Assistant • Connected to Workspace</div>
            </div>
          </div>
        </div>

        <div class="ai-messages-area" id="copilot-messages-container">
          <div class="ai-message">
            <div class="ai-icon">✨</div>
            <div class="ai-bubble assistant">
              Hello Alex! I am your Microsoft 365 Copilot assistant inside TeamTrack. I can help you summarize channels, prepare meeting briefings, and search workspace files. What would you like to work on?
            </div>
          </div>
        </div>

        <div class="composer-wrap">
          <div class="composer-box">
            <textarea
              class="composer-textarea"
              id="copilot-input"
              placeholder="Ask Copilot anything about your team, projects, or schedule..."
              rows="2"
            ></textarea>
            <div class="composer-actions">
              <span style="font-size:11px; color:var(--text-tertiary);">Powered by TeamTrack Enterprise AI</span>
              <button class="send-btn active" id="btn-send-copilot">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const input = document.getElementById('copilot-input');
    const sendBtn = document.getElementById('btn-send-copilot');

    function handleSend() {
      const q = input?.value.trim();
      if (!q) return;
      window.sendCopilotPrompt(q);
      if (input) input.value = '';
    }

    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // 9. Settings Stage
  function renderSettingsStage() {
    stage.innerHTML = `
      <div class="settings-layout">
        <div class="settings-content">
          <h2 class="settings-section-title">Settings</h2>

          <div class="section-heading">Account & Profile</div>
          <div class="settings-card">
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Display Name</div>
                <div class="settings-row-sub">${escapeHtml(currentUser.name)} (${escapeHtml(currentUser.role)})</div>
              </div>
              <button class="btn-secondary">Edit</button>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Email Address</div>
                <div class="settings-row-sub">${escapeHtml(currentUser.email)}</div>
              </div>
              <span style="font-size:12px; color:#107C10; font-weight:600;">Verified Enterprise</span>
            </div>
          </div>

          <div class="section-heading">Appearance</div>
          <div class="settings-card">
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Dark Theme</div>
                <div class="settings-row-sub">Switch between Microsoft Teams Light and Dark themes</div>
              </div>
              <div class="toggle ${document.body.classList.contains('dark-theme') ? 'on' : ''}" id="toggle-dark-mode"></div>
            </div>
          </div>

          <div class="section-heading">Desktop Notifications</div>
          <div class="settings-card">
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Play sound for incoming calls and notifications</div>
                <div class="settings-row-sub">Teams default chime</div>
              </div>
              <div class="toggle on"></div>
            </div>
            <div class="settings-row">
              <div>
                <div class="settings-row-label">Show message preview in banner</div>
                <div class="settings-row-sub">Displays sender name and message snippet</div>
              </div>
              <div class="toggle on"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('toggle-dark-mode')?.addEventListener('click', (e) => {
      toggleDarkMode();
      e.currentTarget.classList.toggle('on');
    });
  }

  // --- Modals ---
  function openNewMeetingModal() {
    showModal({
      title: 'Schedule a Meeting',
      body: `
        <div class="form-group">
          <label class="form-label">Meeting Title</label>
          <input type="text" class="form-input" id="modal-meeting-title" value="Project Sync" />
        </div>
        <div class="form-group">
          <label class="form-label">Date & Time</label>
          <input type="text" class="form-input" id="modal-meeting-time" value="Today at 2:00 PM - 2:30 PM" />
        </div>
        <div class="form-group">
          <label class="form-label">Attendees</label>
          <input type="text" class="form-input" id="modal-meeting-attendees" value="Sarah Chen, David Kim, Alex Rivera" />
        </div>
      `,
      confirmText: 'Schedule',
      onConfirm: () => {
        const title = document.getElementById('modal-meeting-title')?.value || 'Sync';
        const time = document.getElementById('modal-meeting-time')?.value || '2:00 PM';
        calendarEvents.push({
          id: Date.now(),
          title,
          time,
          organizer: currentUser.name,
          room: 'Teams Room',
          active: false
        });
        closeModal();
        renderCurrentView();
      }
    });
  }

  function openNewChatModal() {
    showModal({
      title: 'New Chat',
      body: `
        <div class="form-group">
          <label class="form-label">To:</label>
          <input type="text" class="form-input" id="new-chat-input" placeholder="Type a name or email address..." />
        </div>
      `,
      confirmText: 'Start Chat',
      onConfirm: () => {
        closeModal();
      }
    });
  }

  function showModal({ title, body, confirmText, onConfirm }) {
    const existing = document.getElementById('app-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'app-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(title)}</div>
          <div class="modal-close-btn" id="modal-btn-close">×</div>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn-secondary" id="modal-btn-cancel">Cancel</button>
          <button class="btn-primary" id="modal-btn-confirm">${escapeHtml(confirmText || 'OK')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('modal-btn-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-btn-cancel')?.addEventListener('click', closeModal);
    document.getElementById('modal-btn-confirm')?.addEventListener('click', onConfirm);
  }

  function closeModal() {
    const modal = document.getElementById('app-modal');
    if (modal) modal.remove();
  }

  // --- Global Window Helpers ---
  window.switchTab = switchTab;
  window.startTeamsCall = (title) => {
    startVideoMeeting(title);
  };
  window.openChatWith = (chatId) => {
    activeTab = 'chat';
    activeChatId = chatId;
    renderCurrentView();
  };
  window.promptReply = (postId) => {
    const text = prompt('Write your reply:');
    if (text) {
      const posts = channelPosts[activeChannelId];
      const p = posts?.find((x) => x.id === postId);
      if (p) {
        p.replies.push({ author: currentUser.name, text });
        renderStage();
      }
    }
  };
  window.promptNewPost = () => {
    const subject = prompt('Post Subject:');
    if (!subject) return;
    const content = prompt('Post Message:');
    if (!content) return;

    if (!channelPosts[activeChannelId]) {
      channelPosts[activeChannelId] = [];
    }
    channelPosts[activeChannelId].unshift({
      id: Date.now(),
      author: currentUser.name,
      avatar: currentUser.avatar,
      date: 'Just now',
      subject,
      content,
      replies: []
    });
    renderStage();
  };

  window.sendCopilotPrompt = (promptText) => {
    const container = document.getElementById('copilot-messages-container');
    if (!container) return;

    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message user';
    userMsg.innerHTML = `<div class="ai-bubble user">${escapeHtml(promptText)}</div>`;
    container.appendChild(userMsg);

    const typing = document.createElement('div');
    typing.className = 'ai-message';
    typing.innerHTML = `
      <div class="ai-icon">✨</div>
      <div class="ai-bubble assistant">
        <div class="ai-typing">
          <div class="ai-dot"></div>
          <div class="ai-dot"></div>
          <div class="ai-dot"></div>
        </div>
      </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
      typing.remove();
      const aiMsg = document.createElement('div');
      aiMsg.className = 'ai-message';
      aiMsg.innerHTML = `
        <div class="ai-icon">✨</div>
        <div class="ai-bubble assistant">
          <strong>Summary:</strong> Based on the latest workspace activity across all channels:<br/>
          • <strong>Phase 13:</strong> Enterprise Governance & Security audit complete with 41 passing test suites.<br/>
          • <strong>Desktop Experience:</strong> Microsoft Teams Fluent 2 design implemented with Electron IPC bridge.<br/>
          • <strong>Standup:</strong> Scheduled for today at 10:00 AM in Virtual Room 1.<br/>
          <br/>
          Would you like me to draft a summary email or push updates to the team?
        </div>
      `;
      container.appendChild(aiMsg);
      container.scrollTop = container.scrollHeight;
    }, 1000);
  };

  function getStatusColor(status) {
    const colors = {
      available: '#92C353',
      busy: '#C4314B',
      away: '#F8D22A',
      offline: '#8A8886'
    };
    return colors[status] || '#92C353';
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (localStorage.getItem('teamtrack_theme') === 'dark') {
    document.body.classList.add('dark-theme');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
