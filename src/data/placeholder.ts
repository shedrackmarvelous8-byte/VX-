import type { Conversation, ModelInfo, Project } from '../types/chat'

/** Placeholder content only — used to demonstrate the UI. No AI behaviour is simulated. */
const now = Date.now()
const h = 3600_000
const d = 24 * h

/**
 * Placeholder model names + capabilities. Deliberately no API ids and no
 * provider details — model integration comes in a later step.
 */
export const models: ModelInfo[] = [
  { id: 'claude', name: 'Claude', description: 'Strong at coding and long-running tasks', badges: ['Coding', 'Tools'], group: 'recommended' },
  { id: 'gemini', name: 'Gemini', description: 'Fast and multimodal with a large context window', badges: ['Vision', 'Tools'], group: 'recommended' },
  { id: 'gpt', name: 'GPT', description: 'Balanced for everyday work', badges: ['Tools'], group: 'recommended' },
  { id: 'llama', name: 'Llama', description: 'Open-weight model for general tasks', badges: ['Coding'], group: 'more' },
  { id: 'mistral', name: 'Mistral', description: 'Quick and efficient for smaller tasks', badges: ['Tools'], group: 'more' },
  { id: 'deepseek', name: 'DeepSeek', description: 'Reasoning-focused model for hard problems', badges: ['Coding', 'Tools'], group: 'more' },
]

export const defaultModelId = 'claude'

/** Shared step checklist for the demo agent runs. */
const buildSteps = [
  'Analyzing project',
  'Creating project structure',
  'Creating files',
  'Installing dependencies',
  'Running build',
  'Checking errors',
]

export const projects: Project[] = [
  { id: 'p1', name: 'Atlas Web', stack: 'Next.js', updatedAt: now - 2 * h },
  { id: 'p2', name: 'Kofen Marketplace', stack: 'React · Node', updatedAt: now - 1 * d },
  { id: 'p3', name: 'Ledger API', stack: 'Go · Postgres', updatedAt: now - 6 * d },
]

/** Placeholder file count per project, shown as supporting info on the Files item. */
export const fileCounts: Record<string, number> = { p1: 128, p2: 342, p3: 57 }

export const conversations: Conversation[] = [
  {
    id: 'c1',
    projectId: 'p1',
    title: 'Fix authentication issue',
    updatedAt: now - 2 * h,
    messages: [
      {
        id: 'm1',
        role: 'user',
        createdAt: now - 2.1 * h,
        content:
          'Add session-based authentication to the Next.js app. Keep it simple — email + password, httpOnly cookies, and protect everything under /app.',
      },
      {
        id: 'm2',
        role: 'assistant',
        createdAt: now - 2 * h,
        content: `Here's a lean plan that fits your current structure without adding a heavy auth library.

## Plan
1. Add a \`sessions\` table and a small \`auth\` module for hashing and session lookup.
2. Create \`/api/login\` and \`/api/logout\` route handlers that set an **httpOnly** cookie.
3. Protect \`/app/*\` with middleware that validates the session on every request.

- [x] Review existing routes
- [x] Draft session schema
- [ ] Implement middleware
- [ ] Add login screen

The middleware is the key piece — it runs at the edge and redirects unauthenticated requests before any page renders:

\`\`\`ts middleware.ts
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  if (!token) {
    // Preserve the destination so we can return after login
    const url = new URL('/login', req.url)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/app/:path*'] }
\`\`\`

> Session validation against the database happens in the route layer, keeping the middleware fast.

Want me to continue with the login screen, or wire up the database layer first?`,
      },
      {
        id: 'm3',
        role: 'user',
        createdAt: now - 1.9 * h,
        content: 'Database layer first. We use Postgres with Drizzle.',
      },
    ],
  },
  { id: 'c2', projectId: 'p1', title: 'Build my restaurant website', updatedAt: now - 5 * h, messages: [] },
  {
    id: 'c3',
    projectId: 'p2',
    title: 'Kofen marketplace',
    updatedAt: now - 1 * d,
    messages: [
      {
        id: 'm31',
        role: 'user',
        createdAt: now - 1.05 * d,
        content: 'Set up the seller dashboard and run the build.',
      },
      {
        id: 'm32',
        role: 'assistant',
        createdAt: now - 1 * d,
        content: '',
        kind: 'activity',
        activity: {
          steps: buildSteps,
          outcome: 'issues',
          summary: [
            { label: 'Website generated', status: 'done' },
            { label: 'Preview started', status: 'done' },
            { label: '2 errors found', status: 'warn' },
          ],
        },
      },
    ],
  },
  { id: 'c4', projectId: 'p1', title: 'Create a portfolio website', updatedAt: now - 2 * d, messages: [] },
  {
    id: 'c5',
    projectId: 'p2',
    title: 'Add payment integration',
    updatedAt: now - 4 * d,
    messages: [
      {
        id: 'm51',
        role: 'user',
        createdAt: now - 4.05 * d,
        content: 'Add payment integration to the marketplace — cards and bank transfers.',
      },
      {
        id: 'm52',
        role: 'assistant',
        createdAt: now - 4 * d,
        content: '',
        kind: 'approval',
        approval: { files: 12, migrations: 1, dependencies: 2 },
      },
    ],
  },
  { id: 'c6', projectId: 'p3', title: 'Rate limiting for public endpoints', updatedAt: now - 9 * d, messages: [] },
  {
    id: 'c7',
    projectId: 'p1',
    title: 'Build my barbershop website',
    updatedAt: now - 3 * h,
    messages: [
      {
        id: 'm71',
        role: 'user',
        createdAt: now - 3.05 * h,
        content: 'Build me a modern barbershop website. I want black and gold.',
      },
      {
        id: 'm72',
        role: 'assistant',
        createdAt: now - 3 * h,
        content: '',
        kind: 'plan',
        plan: {
          projectType: 'Website',
          structure: ['Home', 'Services', 'About', 'Contact'],
          visualDirection: ['Black and gold', 'Premium', 'Modern'],
          features: ['Responsive design', 'Service sections', 'Contact form'],
          technical: 'React · Vite · component structure',
        },
        activity: {
          steps: buildSteps,
          outcome: 'success',
          summary: [
            { label: '14 files created', status: 'done' },
            { label: 'Responsive layout implemented', status: 'done' },
            { label: 'Build passed', status: 'done' },
          ],
        },
      },
    ],
  },
]

export const starterPrompts = [
  { icon: 'layers', title: 'Plan a feature', body: 'Break down a new feature into steps' },
  { icon: 'code', title: 'Build a component', body: 'A responsive settings page in React' },
  { icon: 'bug', title: 'Debug an issue', body: 'Find why my API route returns 500' },
  { icon: 'compass', title: 'Explain the codebase', body: 'Walk me through the project structure' },
] as const
