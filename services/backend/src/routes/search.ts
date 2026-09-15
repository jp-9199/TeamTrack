import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { searchController } from '../modules/search/search.controller.js';

export const searchRouter = Router();

// All search endpoints require authenticated session
searchRouter.use(requireAuth);

// GET /api/v1/search/suggestions (registered before root to avoid collisions)
searchRouter.get('/suggestions', (req, res) => {
  searchController.getSuggestions(req, res);
});

// GET /api/v1/search (Unified and Category Search)
searchRouter.get('/', (req, res) => {
  searchController.search(req, res);
});
