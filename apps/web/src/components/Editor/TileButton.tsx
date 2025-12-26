import { type TileCatalogEntry, SPRITE_WIDTH, SPRITE_HEIGHT } from '../../utils/tiles';

interface TileButtonProps {
  tile: TileCatalogEntry;
  selected: boolean;
  onClick: () => void;
}

// Thumbnail size (scaled down from 130x230)
const THUMB_WIDTH = 40;
const THUMB_HEIGHT = 70;

export function TileButton({ tile, selected, onClick }: TileButtonProps) {
  // Calculate background position for sprite sheet
  const bgPosX = -tile.col * SPRITE_WIDTH * (THUMB_WIDTH / SPRITE_WIDTH);
  const bgPosY = -tile.row * SPRITE_HEIGHT * (THUMB_HEIGHT / SPRITE_HEIGHT);

  // Scale factor for background size
  const bgWidth = 12 * THUMB_WIDTH; // 12 columns
  const bgHeight = 6 * THUMB_HEIGHT; // 6 rows

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        title={tile.name}
        className={`
          relative flex-shrink-0 rounded-md overflow-hidden
          transition-all duration-150 ease-out
          ${selected
            ? 'ring-2 ring-city-accent ring-offset-2 ring-offset-city-surface scale-105'
            : 'hover:ring-1 hover:ring-city-border hover:scale-102'
          }
        `}
        style={{
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
        }}
      >
        {/* Sprite thumbnail */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/textures/tileset.png)',
            backgroundPosition: `${bgPosX}px ${bgPosY}px`,
            backgroundSize: `${bgWidth}px ${bgHeight}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />

        {/* Selected overlay */}
        {selected && (
          <div className="absolute inset-0 bg-city-accent/20 pointer-events-none" />
        )}
      </button>
      {/* DEBUG: Tile name */}
      <span className="text-[8px] text-city-text-muted truncate max-w-[40px] text-center">
        {tile.id}
      </span>
    </div>
  );
}
