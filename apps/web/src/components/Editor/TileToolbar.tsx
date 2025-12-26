import { useRef, useEffect } from 'react';
import { TileButton } from './TileButton';
import {
  TILE_CATALOG,
  type TileCatalogEntry,
  CATEGORY_ORDER,
  CATEGORY_NAMES,
  getTilesByCategory,
} from '../../utils/tiles';
import { useEditorStore, useSelectedTile, useIsEditorMode } from '../../stores/editor';

export function TileToolbar() {
  const selectedTile = useSelectedTile();
  const setSelectedTile = useEditorStore((s) => s.setSelectedTile);
  const isEditorMode = useIsEditorMode();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group tiles by category
  const tilesByCategory = getTilesByCategory();

  // Handle tile selection
  const handleTileClick = (tile: TileCatalogEntry) => {
    setSelectedTile(tile);
  };

  // Scroll selected tile into view
  useEffect(() => {
    if (selectedTile && scrollRef.current) {
      const selectedButton = scrollRef.current.querySelector(`[data-tile-id="${selectedTile.id}"]`);
      if (selectedButton) {
        selectedButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [selectedTile]);

  if (!isEditorMode) {
    return null;
  }

  return (
    <div className="h-24 bg-city-surface/95 backdrop-blur-md border-b border-city-border/50 flex items-center">
      {/* Toolbar content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-city-border scrollbar-track-transparent"
      >
        <div className="flex items-center gap-4 px-4 py-2">
          {CATEGORY_ORDER.map((category) => {
            const tiles = tilesByCategory[category];
            if (!tiles || tiles.length === 0) return null;

            return (
              <div key={category} className="flex items-center gap-2">
                {/* Category label */}
                <div className="flex flex-col items-center gap-1 min-w-[50px]">
                  <span className="text-[10px] font-medium text-city-text-muted uppercase tracking-wider">
                    {CATEGORY_NAMES[category]}
                  </span>
                  <div
                    className={`
                      w-2 h-2 rounded-full
                      ${category === 'ground' ? 'bg-emerald-500' : ''}
                      ${category === 'road' ? 'bg-slate-400' : ''}
                      ${category === 'canal' ? 'bg-cyan-400' : ''}
                      ${category === 'decoration' ? 'bg-lime-400' : ''}
                      ${category === 'residential' ? 'bg-green-400' : ''}
                      ${category === 'commercial' ? 'bg-blue-400' : ''}
                      ${category === 'industrial' ? 'bg-yellow-400' : ''}
                      ${category === 'civic' ? 'bg-purple-400' : ''}
                    `}
                  />
                </div>

                {/* Category tiles */}
                <div className="flex gap-1">
                  {tiles.map((tile) => (
                    <div key={tile.id} data-tile-id={tile.id}>
                      <TileButton
                        tile={tile}
                        selected={selectedTile?.id === tile.id}
                        onClick={() => handleTileClick(tile)}
                      />
                    </div>
                  ))}
                </div>

                {/* Category divider */}
                <div className="w-px h-12 bg-city-border/30 ml-2" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected tile info */}
      <div className="flex-shrink-0 px-4 py-2 border-l border-city-border/30 min-w-[140px]">
        {selectedTile ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-city-text truncate">
              {selectedTile.name}
            </span>
            <span className="text-[10px] text-city-text-muted">
              Click to place
            </span>
            <span className="text-[10px] text-city-text-muted">
              Right-click to erase
            </span>
          </div>
        ) : (
          <div className="text-xs text-city-text-muted">
            Select a tile
          </div>
        )}
      </div>
    </div>
  );
}
