export function EventFeed() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-city-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h4 className="text-xs font-medium text-city-text uppercase tracking-wider">
            Events
          </h4>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 text-city-text-muted text-xs text-center">
          No events yet...
        </div>
      </div>
    </div>
  );
}
