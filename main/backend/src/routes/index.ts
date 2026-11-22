import { Router } from 'express';
import {
  analyzeParcelHandler,
  deleteReportHandler,
  exportReportExcelHandler,
  getCropsHandler,
  getExampleParcelsHandler,
  getMethodologyHandler,
  getReportHandler,
  listReportsHandler,
  lookupParcelHandler,
  searchLocationHandler,
} from '../controllers/waterController';
import { createRateLimiter } from '../middleware/security';

const router = Router();

// Limit zapytań chroniący zewnętrzne publiczne API przed przeciążeniem
const analyzeLimiter = createRateLimiter(25, 60_000);
const lookupLimiter = createRateLimiter(60, 60_000);

router.get('/crops', getCropsHandler);
router.get('/methodology', getMethodologyHandler);
router.get('/parcels/examples', getExampleParcelsHandler);
router.get('/parcels/lookup', lookupLimiter, lookupParcelHandler);
router.get('/parcels/search', lookupLimiter, searchLocationHandler);

router.post('/analyze', analyzeLimiter, analyzeParcelHandler);

router.get('/reports', listReportsHandler);
router.get('/reports/:id', getReportHandler);
router.get('/reports/:id/export.xlsx', exportReportExcelHandler);
router.delete('/reports/:id', deleteReportHandler);

export default router;
