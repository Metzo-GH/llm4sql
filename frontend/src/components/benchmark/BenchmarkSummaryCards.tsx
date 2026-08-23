import React from 'react';
import { Award } from 'lucide-react';
import type { BenchmarkReport, BenchmarkCaseResult } from '../BenchmarkPanel';

interface BenchmarkSummaryCardsProps {
  report: BenchmarkReport | null;
  liveResults: BenchmarkCaseResult[];
  liveGlobalScore: number;
  getDifficultyBadgeClass: (difficulty: string) => string;
}

export const BenchmarkSummaryCards: React.FC<BenchmarkSummaryCardsProps> = ({
  report,
  liveResults,
  liveGlobalScore,
  getDifficultyBadgeClass,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {/* Card Score Global */}
      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
        <div className="text-xs text-emerald-400 font-medium flex items-center justify-between">
          <span>Score Global</span>
          <Award size={16} />
        </div>
        <div className="text-2xl font-bold text-emerald-300 my-1 font-mono">
          {report ? `${report.global_score}%` : `${liveGlobalScore}%`}
        </div>
        <div className="text-[10px] text-gray-400">
          {report
            ? `${report.passed_cases} / ${report.total_cases} cas réussis en ${report.total_execution_time}s`
            : `${liveResults.filter(r => r.passed).length} / ${liveResults.length} exécutés`}
        </div>
      </div>

      {/* Breakdown par difficulté */}
      {(['Facile', 'Moyen', 'Difficile', 'Avancé'] as const).map((diff) => {
        const stats = report?.difficulty_breakdown[diff];
        const liveDiffCases = liveResults.filter(r => r.difficulty === diff);
        const livePassed = liveDiffCases.filter(r => r.passed).length;
        const accuracy = stats
          ? stats.accuracy
          : liveDiffCases.length > 0
          ? Math.round((livePassed / liveDiffCases.length) * 100)
          : 0;

        return (
          <div
            key={diff}
            className="p-3 rounded-lg bg-gray-900/60 border border-gray-800 flex flex-col justify-between"
          >
            <div className="text-xs text-gray-300 font-medium flex items-center justify-between">
              <span>{diff}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getDifficultyBadgeClass(diff)}`}>
                {diff}
              </span>
            </div>
            <div className="text-xl font-bold text-gray-100 my-1 font-mono">
              {accuracy}%
            </div>
            <div className="text-[10px] text-gray-400">
              {stats ? `${stats.passed}/${stats.total} cas` : `${livePassed}/${liveDiffCases.length} cas`}
            </div>
          </div>
        );
      })}
    </div>
  );
};
