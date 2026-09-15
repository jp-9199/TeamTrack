import type { NotificationType } from '@teamtrack/shared-types';

export interface RenderEmailParams {
  notificationType: NotificationType;
  title: string;
  body: string;
  resourceType?: string | null;
  resourceId?: string | null;
  dataPayload?: Record<string, unknown> | null;
  appUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Escapes HTML entities to prevent HTML injection and XSS attacks.
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders a standardized, safe plain-text and HTML notification email.
 * All dynamic user content is strictly entity-escaped.
 * Never includes auth tokens, passwords, secrets, or internal hashes.
 */
export function renderNotificationEmail(params: RenderEmailParams): RenderedEmail {
  const appBaseUrl = (params.appUrl || process.env.TEAMTRACK_APP_URL || 'https://app.teamtrack.internal').replace(/\/$/, '');

  // 1. Determine deep-link URL based on polymorphic resource context
  let actionUrl = `${appBaseUrl}/notifications`;
  let actionLabel = 'View Notifications';

  if (params.resourceType === 'channel' && params.resourceId) {
    actionUrl = `${appBaseUrl}/channels/${encodeURIComponent(params.resourceId)}`;
    actionLabel = 'Open Channel';
  } else if (params.resourceType === 'conversation' && params.resourceId) {
    actionUrl = `${appBaseUrl}/conversations/${encodeURIComponent(params.resourceId)}`;
    actionLabel = 'Open Conversation';
  } else if (params.resourceType === 'meeting' && params.resourceId) {
    actionUrl = `${appBaseUrl}/meetings/${encodeURIComponent(params.resourceId)}`;
    actionLabel = 'Join Meeting';
  } else if (params.resourceType === 'file' && params.resourceId) {
    actionUrl = `${appBaseUrl}/files/${encodeURIComponent(params.resourceId)}`;
    actionLabel = 'View File';
  }

  // 2. Generate clean subject line
  const subject = `[TeamTrack] ${params.title.trim()}`;

  // 3. Plain text body
  const text = [
    `TeamTrack Notification`,
    `======================`,
    ``,
    params.title.trim(),
    ``,
    params.body.trim(),
    ``,
    `----------------------`,
    `${actionLabel}: ${actionUrl}`,
    ``,
    `You are receiving this email based on your TeamTrack notification preferences.`,
    `To manage your preferences, visit ${appBaseUrl}/settings/notifications`,
  ].join('\n');

  // 4. Safe HTML body with escaped variables
  const safeTitle = escapeHtml(params.title.trim());
  const safeBody = escapeHtml(params.body.trim()).replace(/\n/g, '<br/>');
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safePreferencesUrl = escapeHtml(`${appBaseUrl}/settings/notifications`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 20px 24px;">
      <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">TeamTrack</h1>
    </div>
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; margin-bottom: 12px;">${safeTitle}</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">${safeBody}</p>
      <div style="margin-bottom: 24px;">
        <a href="${safeActionUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 500; font-size: 14px;">${safeActionLabel}</a>
      </div>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; margin: 0;">
        You received this email because of your notification preferences. 
        <a href="${safePreferencesUrl}" style="color: #2563eb; text-decoration: underline;">Manage preferences</a>.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
