import type { BuildPlan, PlanCustomization } from '../../types/chat'

/** Placeholder option sets for the Build Plan customize sheet. */
export const STYLE_OPTS = ['Premium', 'Modern', 'Minimal', 'Bold', 'Playful']
export const COLOR_OPTS: { label: string; swatch: string | null }[] = [
  { label: 'Black and gold', swatch: '#c9a24a' },
  { label: 'Dark', swatch: '#3f3f46' },
  { label: 'Light', swatch: '#d4d4d8' },
  { label: 'Monochrome', swatch: '#71717a' },
  { label: 'Custom', swatch: null },
]
export const PAGE_OPTS = ['Home', 'Services', 'About', 'Contact', 'Gallery', 'Booking']
export const FEATURE_OPTS = ['Responsive design', 'Service sections', 'Contact form', 'Online booking', 'Gallery', 'Testimonials']
export const ANIM_OPTS = ['None', 'Subtle', 'Expressive']

/** Seed the customize form from the current plan. */
export function seedCustomization(plan: BuildPlan): PlanCustomization {
  const styles = STYLE_OPTS.filter((s) => plan.visualDirection.includes(s))
  const colors = COLOR_OPTS.find((c) => plan.visualDirection.includes(c.label))?.label ?? 'Black and gold'
  const animEntry = plan.visualDirection.find((v) => v.endsWith(' animations'))
  const animations = animEntry ? animEntry.slice(0, -' animations'.length) : 'None'
  return {
    styles: styles.length > 0 ? styles : ['Premium'],
    colors,
    pages: [...plan.structure],
    features: [...plan.features],
    animations: ANIM_OPTS.includes(animations) ? animations : 'None',
    extra: plan.extra ?? '',
  }
}

/** Fold the customization back into the plan shown before generation. */
export function derivePlan(plan: BuildPlan, c: PlanCustomization): BuildPlan {
  const visualDirection = Array.from(
    new Set([c.colors, ...c.styles, ...(c.animations !== 'None' ? [`${c.animations} animations`] : [])]),
  )
  const extra = c.extra.trim()
  return {
    ...plan,
    structure: c.pages.length > 0 ? [...c.pages] : plan.structure,
    features: c.features.length > 0 ? [...c.features] : plan.features,
    visualDirection,
    extra: extra || undefined,
  }
}
