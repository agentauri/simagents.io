import { useResourceSpawns, useWorldStore } from '../../stores/world';
import { translate, translateLabel, useLocale } from '../../i18n';
export function MobileResourceList() {
  useLocale();
  const resources = useResourceSpawns(), select = useWorldStore(state => state.selectResource);
  return <section className="p-4 space-y-2"><h2 className="text-base font-semibold">{translate('Resources')}</h2>
    {resources.map(resource => <button key={resource.id} type="button" className="entity-row" onClick={() => select(resource.id)}>
      <span>{translateLabel(resource.resourceType.charAt(0).toUpperCase() + resource.resourceType.slice(1))} · ({resource.x}, {resource.y})</span>
      <span>{resource.currentAmount.toFixed(1)}/{resource.maxAmount}</span>
    </button>)}
  </section>;
}
