/**
 * DigiFusion Agent Harness — Godmode
 * ===================================
 * Phase 2: Delivery Leverage — three verified agent chains
 * Phase 3: Calibration at Scale — engagement outcomes → measured priors
 *
 * Exports:
 *   exceptionHarvest   — 2-step: extract deviations → cluster into 4-field catalog
 *   frictionTaxAgent   — 2-step: extract inputs → deterministic compute
 *   threeInkClassifier — 3-step: analyze flows → classify inks → record reclassification
 *   calibration        — engagement outcomes register, prior flip, divergence loop
 *
 * Usage:
 *   import { runExceptionHarvest, runFrictionTaxAssembly, runThreeInkFirstPass,
 *            recordEngagementOutcome, getCalibrationStatus, computeMeasuredPriors }
 *     from './harness/godmode/index.js';
 */

export {
  runExceptionHarvest,
  step1_extractDeviations,
  step2_clusterDeviations,
  queryHarvestCatalogs,
} from './exceptionHarvest.js';

export {
  runFrictionTaxAssembly,
  step1_extractInputs,
  computeFrictionTax,
  queryTaxRuns,
} from './frictionTaxAgent.js';

export {
  runThreeInkFirstPass,
  step0_analyzeFlows,
  step1_classifyInks,
  recordReclassification,
  getAggregateReclassificationRate,
  queryInkClassifications,
} from './threeInkClassifier.js';

export {
  recordEngagementOutcome,
  getCalibrationStatus,
  computeMeasuredPriors,
  getActivePriors,
  isCalibrated,
  computeDivergence,
  extractEngagementOutcome,
  MIN_CALIBRATION_PAIRS,
} from './calibration.js';

