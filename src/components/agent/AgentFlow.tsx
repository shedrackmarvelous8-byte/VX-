import { useState } from 'react'
import type { AgentActivity, BuildPlan } from '../../types/chat'
import { AgentActivityCard } from './AgentActivityCard'
import { PlanCard } from './PlanCard'
import { PlanCustomizeSheet } from './PlanCustomizeSheet'

interface AgentFlowProps {
  plan: BuildPlan
  /** Becomes visible once the plan is confirmed (Generate / Skip). */
  activity: AgentActivity
  onOpenPreview?: () => void
}

/**
 * Plan → (Generate | Skip) → agent activity.
 * The Build Plan is temporary: it disappears as soon as a decision is made,
 * and the activity card takes its place in the same conversation.
 */
export function AgentFlow({ plan: initialPlan, activity, onOpenPreview }: AgentFlowProps) {
  const [plan, setPlan] = useState(initialPlan)
  const [stage, setStage] = useState<'plan' | 'building'>('plan')
  const [customizing, setCustomizing] = useState(false)

  if (stage === 'building') {
    return <AgentActivityCard activity={activity} live onOpenPreview={onOpenPreview} />
  }

  return (
    <>
      <PlanCard
        plan={plan}
        onGenerate={() => setStage('building')}
        onSkip={() => setStage('building')}
        onCustomize={() => setCustomizing(true)}
      />
      <PlanCustomizeSheet
        open={customizing}
        plan={plan}
        onClose={() => setCustomizing(false)}
        onApply={(next) => {
          setPlan(next)
          setCustomizing(false)
        }}
      />
    </>
  )
}
