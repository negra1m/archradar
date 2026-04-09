import { RiskInfo, RiskLevel } from '../../types/index.js';

const RISK_MAP: Array<{ min: number; level: RiskLevel; description: string }> = [
  { min: 80, level: 'LOW', description: 'Healthy architecture. Keep up the good practices.' },
  { min: 60, level: 'MEDIUM', description: 'Attention recommended. Some areas need review.' },
  { min: 40, level: 'HIGH', description: 'Intervention needed. Accumulated technical debt.' },
  { min: 0, level: 'CRITICAL', description: 'Urgent refactoring required. High structural risk.' },
];

export function calculateRisk(score: number): RiskInfo {
  for (const { min, level, description } of RISK_MAP) {
    if (score >= min) {
      return { riskLevel: level, riskDescription: description };
    }
  }
  return { riskLevel: 'CRITICAL', riskDescription: 'Urgent refactoring required. High structural risk.' };
}
