import { translate, useLocale, translateLabel } from '../../i18n';
/**
 * Event Filters Component
 *
 * Provides UI for filtering events by type in the EventFeed.
 * Features:
 * - Toggle individual event types on/off
 * - Select all / deselect all
 * - Color-coded event type badges
 * - Collapsible panel
 */

import { useState, useId } from 'react';
import {
  useVisualizationStore,
  ALL_EVENT_TYPES,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
  type EventTypeFilter,
} from '../../stores/visualization';

export function EventFilters() {
  useLocale();
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    visibleEventTypes,
    eventFilterEnabled,
    toggleEventType,
    setAllEventTypes,
    toggleEventFilter,
  } = useVisualizationStore();

  const visibleCount = visibleEventTypes.size;
  const totalCount = ALL_EVENT_TYPES.length;

  // Group event types by category
  const categories: { label: string; types: EventTypeFilter[] }[] = [
    {
      label: 'Survival',
      types: ['move', 'gather', 'consume', 'sleep', 'work'],
    },
    {
      label: 'Economy',
      types: ['buy', 'trade'],
    },
    {
      label: 'Social',
      types: ['share_info', 'harm', 'steal', 'deceive', 'death'],
    },
    {
      label: 'System',
      types: ['system'],
    },
  ];

  return (
    <div className="bg-city-surface/95 backdrop-blur-sm rounded-lg border border-city-border overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <button type="button" aria-expanded={isExpanded} aria-controls={contentId}
          onClick={() => setIsExpanded(!isExpanded)} className="min-h-11 flex-1 text-left text-xs">
          {translate('Event Filters')} <span className="text-city-text-muted">{visibleCount}/{totalCount}</span>
        </button>
        <button type="button" role="switch" aria-label={translate('Enable event filtering')} aria-checked={eventFilterEnabled}
          onClick={toggleEventFilter} className="min-h-11 min-w-11 rounded px-2 text-xs"
          style={{ background: eventFilterEnabled ? 'var(--color-city-accent)' : 'var(--color-city-bg)', color: eventFilterEnabled ? '#241a15' : 'var(--color-city-text)' }}>
          {translate(eventFilterEnabled ? 'On' : 'Off')}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div id={contentId} className="px-3 pb-3 border-t border-city-border/50">
          {/* Quick actions */}
          <div className="flex gap-2 mt-2 mb-3">
            <button
              onClick={() => setAllEventTypes(true)}
              className="flex-1 px-2 py-1 text-[10px] bg-city-bg rounded hover:bg-city-border transition-colors text-city-text-muted"
            >{translate("Select All")}</button>
            <button
              onClick={() => setAllEventTypes(false)}
              className="flex-1 px-2 py-1 text-[10px] bg-city-bg rounded hover:bg-city-border transition-colors text-city-text-muted"
            >{translate("Clear All")}</button>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            {categories.map((category) => (
              <div key={category.label}>
                <div className="text-[10px] text-city-text-muted mb-1.5 font-medium">
                  {translateLabel(category.label)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {category.types.map((type) => {
                    const isVisible = visibleEventTypes.has(type);
                    const color = EVENT_TYPE_COLORS[type];
                    const label = EVENT_TYPE_LABELS[type];

                    return (
                      <button
                        key={type}
                        onClick={() => toggleEventType(type)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                          isVisible
                            ? 'text-white shadow-sm'
                            : 'text-city-text-muted bg-city-bg hover:bg-city-border'
                        }`}
                        style={{
                          backgroundColor: isVisible ? color : undefined,
                          opacity: isVisible ? 1 : 0.5,
                        }}
                      >
                        {translateLabel(label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact Event Filter Pills
 * Inline version for use in tight spaces
 */
export function EventFilterPills() {
  useLocale();
  const { visibleEventTypes, toggleEventType } = useVisualizationStore();

  // Only show most important types inline
  const inlineTypes: EventTypeFilter[] = ['trade', 'harm', 'steal', 'share_info', 'death'];

  return (
    <div className="flex flex-wrap gap-1">
      {inlineTypes.map((type) => {
        const isVisible = visibleEventTypes.has(type);
        const color = EVENT_TYPE_COLORS[type];
        const label = EVENT_TYPE_LABELS[type];

        return (
          <button
            key={type}
            onClick={() => toggleEventType(type)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              isVisible
                ? 'text-white'
                : 'text-city-text-muted bg-city-bg/50 hover:bg-city-border'
            }`}
            style={{
              backgroundColor: isVisible ? color : undefined,
              opacity: isVisible ? 1 : 0.4,
            }}
          >
            {translateLabel(label)}
          </button>
        );
      })}
    </div>
  );
}
