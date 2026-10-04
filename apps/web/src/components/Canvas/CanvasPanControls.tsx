import { useId, useRef, type KeyboardEventHandler } from 'react';
import { translate, useLocale } from '../../i18n';
/** Click/tap alternatives to panning gestures; the popover escapes canvas clipping. */
export function CanvasPanControls({ move, reset, onKeyDown }: { move: (x: number, y: number) => void; reset: () => void; onKeyDown: KeyboardEventHandler<HTMLButtonElement> }) {
  useLocale();
  const id = useId(), popover = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const actions = [['Move left', -40, 0, '←'], ['Move right', 40, 0, '→'], ['Move up', 0, -40, '↑'], ['Move down', 0, 40, '↓']] as const;
  return <>
    <button ref={trigger} type="button" popoverTarget={id} aria-label={translate('Move map view')} title={translate('Map keyboard help')} onKeyDown={onKeyDown} className="w-11 h-11 bg-city-surface border border-city-border rounded-lg text-city-text">↔</button>
    <div ref={popover} id={id} popover="auto" role="group" aria-label={translate('Move map view')} className="canvas-pan-popover">
      <h3>{translate('Move map view')}</h3>
      <div className="panel-adjustment-grid">
        {actions.map(([label, x, y, icon]) => <button type="button" key={label} aria-label={translate(label)} title={translate(label)} onClick={() => move(x, y)}>{icon}</button>)}
        <button type="button" aria-label={translate('Reset camera')} title={translate('Reset camera')} onClick={reset}>↺</button>
      </div>
      <button type="button" className="min-h-11" onClick={() => { popover.current?.hidePopover(); trigger.current?.focus(); }}>{translate('Close')}</button>
    </div>
  </>;
}
