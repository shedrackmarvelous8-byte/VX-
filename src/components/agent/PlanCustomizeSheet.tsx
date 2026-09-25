import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BuildPlan, PlanCustomization } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import {
  ANIM_OPTS,
  COLOR_OPTS,
  FEATURE_OPTS,
  PAGE_OPTS,
  STYLE_OPTS,
  derivePlan,
  seedCustomization,
} from './planOptions'

interface PlanCustomizeSheetProps {
  open: boolean
  plan: BuildPlan
  onClose: () => void
  /** Applies the edits — the updated plan is shown before generation. */
  onApply: (plan: BuildPlan) => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="plan-field">
      <span className="plan-field__label">{label}</span>
      {children}
    </div>
  )
}

function Choose({
  checked,
  onClick,
  swatch,
  children,
}: {
  checked: boolean
  onClick: () => void
  swatch?: string | null
  children: ReactNode
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="plan-choose" onClick={onClick}>
      {swatch !== undefined && (
        <span className="plan-choose__swatch" data-empty={swatch === null || undefined} style={swatch ? { background: swatch } : undefined} />
      )}
      {checked && (
        <span className="plan-choose__check">
          <Icon name="check" size={14} strokeWidth={2.4} />
        </span>
      )}
      {children}
    </button>
  )
}

/** Clean editing interface for the Build Plan. UI only — nothing is generated. */
export function PlanCustomizeSheet({ open, plan, onClose, onApply }: PlanCustomizeSheetProps) {
  const [draft, setDraft] = useState<PlanCustomization>(() => seedCustomization(plan))
  const [prevKey, setPrevKey] = useState({ open, plan })
  if (prevKey.open !== open || prevKey.plan !== plan) {
    setPrevKey({ open, plan })
    if (open) setDraft(seedCustomization(plan))
  }
  const firstRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => firstRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const toggleIn = (key: 'pages' | 'features', value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customize plan"
      footer={
        <>
          <button type="button" className="agent-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="agent-btn agent-btn--primary" onClick={() => onApply(derivePlan(plan, draft))}>
            Update plan
          </button>
        </>
      }
    >
      <div className="plan-form">
        <Field label="Style">
          <div className="plan-chips" ref={firstRef} tabIndex={-1}>
            {STYLE_OPTS.map((s) => (
              <Choose
                key={s}
                checked={draft.styles.includes(s)}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    styles: d.styles.includes(s) ? d.styles.filter((v) => v !== s) : [...d.styles, s],
                  }))
                }
              >
                {s}
              </Choose>
            ))}
          </div>
        </Field>
        <Field label="Colors">
          <div className="plan-chips">
            {COLOR_OPTS.map((c) => (
              <Choose
                key={c.label}
                checked={draft.colors === c.label}
                onClick={() => setDraft((d) => ({ ...d, colors: c.label }))}
                swatch={c.swatch}
              >
                {c.label}
              </Choose>
            ))}
          </div>
        </Field>
        <Field label="Pages">
          <div className="plan-chips">
            {PAGE_OPTS.map((p) => (
              <Choose key={p} checked={draft.pages.includes(p)} onClick={() => toggleIn('pages', p)}>
                {p}
              </Choose>
            ))}
          </div>
        </Field>
        <Field label="Features">
          <div className="plan-chips">
            {FEATURE_OPTS.map((f) => (
              <Choose key={f} checked={draft.features.includes(f)} onClick={() => toggleIn('features', f)}>
                {f}
              </Choose>
            ))}
          </div>
        </Field>
        <Field label="Animations">
          <div className="plan-chips">
            {ANIM_OPTS.map((a) => (
              <Choose key={a} checked={draft.animations === a} onClick={() => setDraft((d) => ({ ...d, animations: a }))}>
                {a}
              </Choose>
            ))}
          </div>
        </Field>
        <Field label="Extra instructions">
          <textarea
            className="plan-extra-input"
            value={draft.extra}
            placeholder="Anything else VX should know?"
            onChange={(e) => setDraft((d) => ({ ...d, extra: e.target.value }))}
          />
        </Field>
      </div>
    </Sheet>
  )
}
