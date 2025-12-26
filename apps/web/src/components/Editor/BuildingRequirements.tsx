import { useMemo } from 'react';
import { useEditorGrid } from '../../stores/editor';
import { getBuildingStats, DEFAULT_REQUIREMENTS } from '../../utils/buildingAssignment';

interface RequirementRowProps {
  type: string;
  label: string;
  current: number;
  required: number;
  color: string;
}

function RequirementRow({ type, label, current, required, color }: RequirementRowProps) {
  const isMet = current >= required;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-xs text-city-text-muted">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-xs font-medium tabular-nums ${
            isMet ? 'text-green-400' : 'text-city-text'
          }`}
        >
          {current}/{required}
        </span>
        {isMet ? (
          <svg
            className="w-3.5 h-3.5 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <div className="w-3.5 h-3.5" /> // Spacer for alignment
        )}
      </div>
    </div>
  );
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  residential: { label: 'Residential', color: 'bg-green-400' },
  commercial: { label: 'Commercial', color: 'bg-blue-400' },
  industrial: { label: 'Industrial', color: 'bg-yellow-400' },
  civic: { label: 'Civic', color: 'bg-purple-400' },
};

export function BuildingRequirements() {
  const grid = useEditorGrid();

  const stats = useMemo(() => getBuildingStats(grid), [grid]);

  const allMet = stats.meetsRequirements;

  return (
    <div className={`p-3 rounded-lg transition-colors ${allMet ? 'bg-green-500/10' : 'bg-city-bg'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-city-text">Requirements</h4>
        {allMet && (
          <span className="text-[10px] font-medium text-green-400 uppercase tracking-wide">
            Ready!
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {DEFAULT_REQUIREMENTS.map((req) => {
          const config = TYPE_CONFIG[req.type];
          return (
            <RequirementRow
              key={req.type}
              type={req.type}
              label={config.label}
              current={stats.byType[req.type] || 0}
              required={req.count}
              color={config.color}
            />
          );
        })}
      </div>
      {allMet && (
        <div className="mt-2 pt-2 border-t border-green-500/20">
          <p className="text-[10px] text-green-400/80 text-center">
            Click "Start Simulation" to begin
          </p>
        </div>
      )}
    </div>
  );
}
