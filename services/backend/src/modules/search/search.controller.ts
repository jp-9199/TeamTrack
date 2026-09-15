import type { Request, Response } from 'express';
import { searchService, SearchServiceError } from './search.service.js';
import { validateSearchQuery } from '@teamtrack/validation';

export class SearchController {
  /**
   * GET /api/v1/search
   * Unified search endpoint supporting all categories or filtered search.
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const validation = validateSearchQuery(req.query);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: validation.errors[0] || {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search parameters',
          },
        });
        return;
      }

      const result = await searchService.search(userId, validation.data);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  /**
   * GET /api/v1/search/suggestions
   * Lightweight suggestions endpoint for top people, channels, and teams.
   */
  async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        res.status(200).json({
          success: true,
          data: { items: [] },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const orgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
      const suggestions = await searchService.getSuggestions(userId, q, orgId);

      res.status(200).json({
        success: true,
        data: { items: suggestions },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  private handleError(err: any, res: Response): void {
    if (err instanceof SearchServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    console.error('[SearchController Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Search execution failed' },
    });
  }
}

export const searchController = new SearchController();
