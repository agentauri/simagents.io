/**
 * ConfigSection Component
 *
 * Collapsible section for grouping configuration inputs.
 */

import { useState, useId } from 'react';

interface ConfigSectionProps {
  title: string;
  icon?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function ConfigSection({
  title,
  icon,
  defaultExpanded = false,
  children,
}: ConfigSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <div className="border-b border-gray-700 last:border-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset"
      >
        <div className="flex items-center gap-2">
          {icon && <span aria-hidden="true">{icon}</span>}
          <span className="font-medium text-gray-200">{title}</span>
        </div>
        <span
          aria-hidden="true"
          className={`text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          ▼
        </span>
      </button>
      <div
        id={contentId}
        role="region"
        aria-labelledby={contentId + '-header'}
        hidden={!isExpanded}
        className={isExpanded ? 'px-4 pb-3 space-y-1' : ''}
      >
        {isExpanded && children}
      </div>
    </div>
  );
}

export default ConfigSection;
