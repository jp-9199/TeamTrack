import { createApiClient, ApiClient } from '@teamtrack/api-client';

// Normalize API base URL: @teamtrack/api-client appends /api/v1 to paths,
// so ensure trailing /api/v1 or slashes are stripped.
const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const BASE_URL = rawUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');

export const api: ApiClient = createApiClient({
  baseUrl: BASE_URL,
  platform: 'web',
  onAuthFailure: () => {
    // Optionally trigger a global event here if needed,
    // though the AuthContext will typically handle state checks.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth-failure'));
    }
  },
});
