export type WorkIntent =
  | 'implementation_request'
  | 'conversation'
  | 'question'
  | 'brainstorming'
  | 'technical_recommendation'
  | 'review_request'
  | 'error_explanation'
  | 'notes_request'
  | 'document_generation'
  | 'document_analysis'
  | 'critique_request'

export interface IntentAnalysisResult {
  intent: WorkIntent
  confidence: number
  isCodingExecutionAllowed: boolean
  explanation: string
  suggestedAction?: string
}

/**
 * Accurately classifies user intent to ensure the AI does NOT execute code changes
 * merely because the user is discussing, asking questions, or brainstorming ideas.
 */
export function classifyUserIntent(
  message: string,
  hasAttachments = false
): IntentAnalysisResult {
  const clean = message.trim().toLowerCase()

  // 1. Explicit prohibition of execution ("don't build yet", "just discuss", "before we code", "build plan")
  if (
    /don't (build|code|implement|change|create)|do not (build|code|implement|change|create)|before (we|i) (build|code|start)|let's (just )?discuss|just (asking|wondering|brainstorming|curious)|(show|proposed|suggest|create|make)\s*(me\s*)?(a\s*)?(proposed\s*)?(build\s*plan|project\s*plan|structure)/i.test(
      clean
    )
  ) {
    return {
      intent: 'brainstorming',
      confidence: 0.95,
      isCodingExecutionAllowed: false,
      explanation: 'User requested a build plan or discussion before building.',
    }
  }

  // 2. Project Review Request
  if (
    /(review|audit|critique|evaluate|check|inspect)\s+(the|my|our|current)?\s*(project|website|code|app|site|ui|design|preview|homepage)/i.test(
      clean
    ) ||
    /look at the (current|website|project|preview) and tell me/i.test(clean) ||
    clean === 'review project' ||
    clean === 'review'
  ) {
    return {
      intent: 'review_request',
      confidence: 0.9,
      isCodingExecutionAllowed: false,
      explanation: 'User requested a project review or critique.',
      suggestedAction: 'inspect_project',
    }
  }

  // 3. Error Explanation / Build Inspection
  if (
    /why is (the|my)?\s*(build|preview|website|app|server|test)\s*(failing|broken|crashing|down|not working)/i.test(
      clean
    ) ||
    /explain (this|the)?\s*(error|failure|exception|log|stack trace)/i.test(clean) ||
    /(what is|what's) wrong with/i.test(clean)
  ) {
    return {
      intent: 'error_explanation',
      confidence: 0.9,
      isCodingExecutionAllowed: false,
      explanation: 'User asked for an explanation of an error or failure.',
      suggestedAction: 'explain_error',
    }
  }

  // 4. Document / Notes Request
  if (
    /(turn this into|create|make|write|generate|save)\s+(some\s+)?(project\s+)?(notes|note|brief|spec|specification|requirements doc|proposal|documentation)/i.test(
      clean
    ) ||
    /summarize (our|the)?\s*(decisions|discussion|meeting|chat)/i.test(clean)
  ) {
    const isDoc = /(brief|proposal|spec|specification|documentation|requirements document)/i.test(clean)
    return {
      intent: isDoc ? 'document_generation' : 'notes_request',
      confidence: 0.9,
      isCodingExecutionAllowed: false,
      explanation: 'User requested generation of structured notes or documentation.',
    }
  }

  // 5. Document / Uploaded File Analysis
  if (
    hasAttachments &&
    (/(read|summarize|analyze|explain|extract|what does)\s+(this|the)?\s*(document|pdf|file|upload|requirements)/i.test(
      clean
    ) ||
      clean.length < 50)
  ) {
    return {
      intent: 'document_analysis',
      confidence: 0.85,
      isCodingExecutionAllowed: false,
      explanation: 'User provided attachments to analyze.',
    }
  }

  // 6. Brainstorming / Feature Ideas
  if (
    /(give me|brainstorm|suggest|what are some)\s*(ideas|features|options|improvements|ways)/i.test(
      clean
    ) ||
    /how can we (improve|make|enhance)/i.test(clean) ||
    /what could (we add|be improved|make this)/i.test(clean)
  ) {
    return {
      intent: 'brainstorming',
      confidence: 0.85,
      isCodingExecutionAllowed: false,
      explanation: 'User is brainstorming ideas and possibilities.',
    }
  }

  // 7. Technical Recommendation & Architecture Comparison
  if (
    /(do you think|is\s+\w+\s+suitable|should (we|i) use|which is better|recommend a|compare)\b/i.test(
      clean
    ) ||
    /(what architecture|what backend|what database|what stack)\s+(should|would|is)/i.test(
      clean
    ) ||
    /what are the (trade-offs|pros and cons|advantages)/i.test(clean)
  ) {
    return {
      intent: 'technical_recommendation',
      confidence: 0.85,
      isCodingExecutionAllowed: false,
      explanation: 'User requested architectural or technical recommendation.',
    }
  }

  // 8. General Question
  if (
    /^(what|why|how|where|when|who|can you explain|tell me about)\b/i.test(clean) &&
    !/(build|create|code|implement|generate code)\b/i.test(clean)
  ) {
    return {
      intent: 'question',
      confidence: 0.8,
      isCodingExecutionAllowed: false,
      explanation: 'User asked an informational question.',
    }
  }

  // 9. Explicit Implementation / Coding Commands
  if (
    /^(please )?(build|create|code|implement|add|write|make|generate|refactor|fix|update|delete|remove)\b/i.test(
      clean
    ) &&
    !/(ideas|recommendations|options|thoughts|notes|documents|brief)/i.test(clean)
  ) {
    return {
      intent: 'implementation_request',
      confidence: 0.85,
      isCodingExecutionAllowed: true,
      explanation: 'User explicitly commanded an implementation or code change.',
    }
  }

  // 10. Default: Natural Conversation
  return {
    intent: 'conversation',
    confidence: 0.7,
    isCodingExecutionAllowed: false,
    explanation: 'General conversation or discussion.',
  }
}
