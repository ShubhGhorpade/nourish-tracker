import type { ConfidenceProfile, Food, Meal, MealItem, Nutrients } from '../types.js';
import { confidenceLabel } from '../domain/confidence.js';

export function cx(...parts: Array<string | false | null | undefined>): string { return parts.filter(Boolean).join(' '); }

export function IconButton(props: { label: string; icon: string; onClick: () => void; className?: string; disabled?: boolean }): JSX.Element {
  return <button type="button" className={cx('icon-button', props.className)} aria-label={props.label} title={props.label} onClick={props.onClick} disabled={props.disabled}><span aria-hidden="true">{props.icon}</span></button>;
}

export function SourceChip({ name, quality }: { name: string; quality: string }): JSX.Element {
  return <span className={cx('source-chip', `source-${quality}`)}>{quality === 'verified' ? '✓ ' : quality === 'authoritative' ? '◆ ' : quality === 'estimated' ? '~ ' : ''}{name}</span>;
}

export function ConfidenceChip({ profile }: { profile: ConfidenceProfile }): JSX.Element {
  const label = confidenceLabel(profile);
  return <span className={cx('confidence-chip', `confidence-${label.toLowerCase().replaceAll(' ', '-')}`)} title={profile.reason ?? `Identity ${profile.identity}, quantity ${profile.quantity}, nutrition ${profile.nutrition}`}>{label}</span>;
}

export function Metric({ label, value, unit, goal, subdued }: { label: string; value: number | null; unit: string; goal?: number; subdued?: boolean }): JSX.Element {
  const display = value === null ? '—' : Math.round(value).toLocaleString();
  const pct = goal && value !== null ? Math.min(100, Math.max(0, value / goal * 100)) : null;
  return <div className={cx('metric', subdued && 'metric-subdued')}>
    <div className="metric-head"><span>{label}</span>{goal ? <small>{value === null ? 'Unknown' : `${Math.round(value)} / ${goal} ${unit}`}</small> : null}</div>
    <div className="metric-value">{display}<span>{value === null ? '' : unit}</span></div>
    {pct !== null ? <div className="progress" aria-label={`${label} ${Math.round(pct)} percent of goal`}><i style={{ width: `${pct}%` }} /></div> : null}
  </div>;
}

export function NutrientMini({ nutrients }: { nutrients: Nutrients }): JSX.Element {
  return <div className="nutrient-mini">
    <span><b>{nutrients.energyKcal === null ? '—' : Math.round(nutrients.energyKcal)}</b> kcal</span>
    <span><b>{nutrients.proteinG === null ? '—' : Math.round(nutrients.proteinG)}</b>g protein</span>
    <span><b>{nutrients.fiberG === null ? '—' : Math.round(nutrients.fiberG)}</b>g fiber</span>
  </div>;
}

export function EmptyState({ icon='○', title, body, actionLabel, onAction }: { icon?: string; title: string; body: string; actionLabel?: string; onAction?: () => void }): JSX.Element {
  return <div className="empty-state"><div className="empty-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{body}</p>{actionLabel && onAction ? <button className="button button-secondary" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

export function FoodAvatar({ food }: { food: Food }): JSX.Element {
  if (food.imageUrl) return <img className="food-avatar" src={food.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  const initials = food.name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
  return <div className="food-avatar food-avatar-fallback" aria-hidden="true">{initials || '•'}</div>;
}

export function MealItemRow({ item, onEdit, onRemove }: { item: MealItem; onEdit?: () => void; onRemove?: () => void }): JSX.Element {
  return <div className="meal-item-row">
    <div className="meal-item-main"><div className="meal-item-title"><span>{item.name}</span><ConfidenceChip profile={item.confidence} /></div><div className="meal-item-meta">{item.quantityLabel} · {item.sourceSnapshot.name}</div></div>
    <div className="meal-item-nutrition">{item.nutritionSnapshot.energyKcal === null ? '—' : `${Math.round(item.nutritionSnapshot.energyKcal)} kcal`}</div>
    {onEdit || onRemove ? <div className="row-actions">{onEdit ? <IconButton label="Edit quantity" icon="✎" onClick={onEdit} /> : null}{onRemove ? <IconButton label="Remove" icon="×" onClick={onRemove} /> : null}</div> : null}
  </div>;
}

export function MealCard({ meal, total, onCopy, onEditItem, onRemoveItem }: { meal: Meal; total: Nutrients; onCopy: () => void; onEditItem: (item: MealItem) => void; onRemoveItem: (item: MealItem) => void }): JSX.Element {
  return <section className="meal-card">
    <header><div><div className="eyebrow">{meal.mealType}</div><h3>{meal.items.length} {meal.items.length === 1 ? 'item' : 'items'}</h3></div><button className="text-button" onClick={onCopy}>Copy</button></header>
    <div>{meal.items.map(item => <MealItemRow key={item.id} item={item} onEdit={() => onEditItem(item)} onRemove={() => onRemoveItem(item)} />)}</div>
    <footer><NutrientMini nutrients={total} /></footer>
  </section>;
}

export function Modal({ title, subtitle, onClose, children, wide=false }: { title: string; subtitle?: string; onClose: () => void; children: any; wide?: boolean }): JSX.Element {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e:any) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><IconButton label="Close" icon="×" onClick={onClose} /></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export function Toast({ message, tone='neutral' }: { message: string; tone?: 'neutral'|'success'|'error' }): JSX.Element {
  return <div className={cx('toast', `toast-${tone}`)} role="status">{message}</div>;
}
