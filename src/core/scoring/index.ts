import { ScanResult, AnalysisResult, ScoreResult } from '../../types/index.js';
import { calculateHealthScore } from './healthScore.js';
import { generateRecommendations } from './recommendations.js';

export function run(scan: ScanResult, analysis: AnalysisResult): ScoreResult {
  const { health, breakdown } = calculateHealthScore(scan, analysis);
  const recommendations = generateRecommendations(scan, analysis);

  return { health, recommendations, breakdown };
}
