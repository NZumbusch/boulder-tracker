/**
 * What the readiness hero calls each status. The raw names ("risk", "neutral") read as alarms or as nothing; these say what
 * to do. The colour and icon stay (the word is added to the colour, never replaces it).
 */
import type { ReadinessStatus } from '../analytics/readiness';

export const READINESS_WORD: Record<ReadinessStatus, string> = {
  good: 'Ready',
  caution: 'Take care',
  risk: 'Rest',
  neutral: 'Not enough data',
};
