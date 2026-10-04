import { useEffect, useRef, useState, type KeyboardEventHandler } from 'react';
import { translate, type TranslationKey, useLocale } from '../i18n';
interface Props {
  label: TranslationKey; resize?: boolean; onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  adjust: (horizontal: number, vertical: number) => void; reset: () => void;
}
/** Single-pointer buttons complement dragging and the existing keyboard shortcuts. */
export function PanelAdjustmentControl({ label, resize, onKeyDown, adjust, reset }: Props) {
  useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.parentElement?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  const actions = resize ? [
    ['Decrease width', -10, 0, '←'], ['Increase width', 10, 0, '→'], ['Decrease height', 0, -10, '↑'], ['Increase height', 0, 10, '↓'],
  ] as const : [
    ['Move left', -10, 0, '←'], ['Move right', 10, 0, '→'], ['Move up', 0, -10, '↑'], ['Move down', 0, 10, '↓'],
  ] as const;
  return <div className="panel-adjustment" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="w-11 h-11" aria-label={translate(label)} aria-expanded={open} title={translate(resize ? 'Panel resize keyboard help' : 'Panel keyboard help')} onKeyDown={onKeyDown} onClick={() => setOpen(value => !value)}>{resize ? '↗' : '↔'}</button>
    {open && <div className="panel-adjustment-grid" role="group" aria-label={translate(label)}>
      {actions.map(([name, x, y, icon]) => <button type="button" key={name} aria-label={translate(name)} title={translate(name)} onClick={() => adjust(x, y)}>{icon}</button>)}
      <button type="button" aria-label={translate('Reset panel layout')} title={translate('Reset panel layout')} onClick={reset}>↺</button>
    </div>}
  </div>;
}
