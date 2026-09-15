export interface AIToolContext {
  callerId: string;
  organizationId?: string | null;
  userOrgs: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  isWrite: boolean;
  requiresConfirmation: boolean;
  auditCategory: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  validateArgs?: (args: Record<string, any>) => void;
  authorize?: (args: Record<string, any>, context: AIToolContext) => Promise<void>;
  execute: (args: Record<string, any>, context: AIToolContext) => Promise<unknown>;
}
