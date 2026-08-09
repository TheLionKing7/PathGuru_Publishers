/**
 * DigiFusion Agent Harness — Godmode
 * ===================================
 * Phase 2: Delivery Leverage — three verified agent chains
 * that reduce engagement labor hours.
 *
 * Exports:
 *   exceptionHarvest   — 2-step: extract deviations → cluster into 4-field catalog
 *   frictionTaxAgent   — 2-step: extract inputs → deterministic compute
 *   threeInkClassifier — 3-step: analyze flows → classify inks → record reclassification
 *
 * Usage:
 *   import { runExceptionHarvest, runFrictionTaxAssembly, runThreeInkFirstPass }
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
