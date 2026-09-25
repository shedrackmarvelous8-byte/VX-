"""Prompt 3 verification: model selector, voice, build plan, agent activity, approval.

Usage: python3 s3.py
Runs the full flow at 390x844 (mobile) and 1440 (desktop). Screenshots land in ~/shots/.
"""
import re
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5173'
SHOTS = '/home/user/shots'

results = []


def check(name, cond, extra=''):
    results.append((name, bool(cond), extra))
    print(('PASS' if cond else 'FAIL'), name, extra if not cond else '')


def run(pw, width, height, tag, mobile=True):
    browser = pw.chromium.launch()
    ctx = browser.new_context(
        viewport={'width': width, 'height': height},
        is_mobile=mobile, has_touch=mobile,
        device_scale_factor=2 if mobile else 1,
    )
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_timeout(700)

    def overflow():
        return page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')

    def shot(name):
        page.screenshot(path=f'{SHOTS}/{name}.png')

    def min_target(sel):
        return page.eval_on_selector_all(
            sel,
            'els => els.map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) })',
        )

    def go_convo(title):
        menu = page.locator('.header__menu')
        if menu.count():
            menu.click()
            page.wait_for_timeout(450)
        page.get_by_text(title, exact=True).first.click()
        page.wait_for_timeout(650)

    # ---------- 1. MODEL SELECTOR ----------
    page.get_by_role('button', name=re.compile(r'^Model')).click()
    page.wait_for_timeout(450)
    check('model sheet opens', page.get_by_role('heading', name='Select model').is_visible())
    check('search field present', page.get_by_placeholder('Search models...').is_visible())
    body = page.evaluate('document.body.innerText')
    for label in ['Recommended', 'More models', 'Claude', 'Gemini', 'GPT']:
        check(f'model list shows {label}', label in body)
    for bad in ['OpenRouter', 'OpenAI', 'API key', 'Gemini API', 'googleapis', 'anthropic']:
        check(f'no provider string: {bad}', bad not in body)
    check('no model overflow', not overflow())
    sizes = min_target('.model-item')
    check('model rows >= 44px', sizes and min(sizes) >= 44, str(min(sizes) if sizes else None))
    shot(f'{tag}_30_model_sheet')

    page.get_by_placeholder('Search models...').fill('gem')
    page.wait_for_timeout(250)
    check('search filters to Gemini', page.get_by_role('radio', name=re.compile('Gemini')).count() == 1)
    check('search hides Claude', page.get_by_role('radio', name=re.compile('^Claude')).count() == 0)
    shot(f'{tag}_31_model_search')
    page.get_by_role('button', name='Clear search').click()
    page.wait_for_timeout(200)

    page.get_by_role('radio', name=re.compile('Gemini')).click()
    page.wait_for_timeout(500)
    check('sheet closes after select', page.get_by_role('heading', name='Select model').count() == 0)
    page.get_by_role('button', name=re.compile(r'^Model')).click()
    page.wait_for_timeout(400)
    gem = page.get_by_role('radio', name=re.compile('Gemini'))
    check('Gemini selected state', gem.get_attribute('aria-checked') == 'true')
    shot(f'{tag}_32_model_selected')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    check('Esc closes model sheet', page.get_by_role('heading', name='Select model').count() == 0)

    # ---------- 2. VOICE ----------
    page.get_by_role('button', name='Switch to voice').click()
    page.wait_for_timeout(500)
    check('voice panel opens', page.get_by_role('button', name='End voice').is_visible())
    st = page.locator('.voice__status')
    check('starts Listening', 'Listening' in st.inner_text())
    check('waveform bars only (no orb)', page.locator('.voice__bar').count() >= 15)
    check('voice hint', 'continues this conversation' in page.locator('.voice__hint').inner_text())
    vt = page.locator('.voice').inner_text()
    for bad in ['JARVIS', 'HUD']:
        check(f'no futuristic string {bad}', bad not in vt)
    shot(f'{tag}_33_voice_listening')
    page.wait_for_timeout(3300)
    check('Speaking state', 'Speaking' in st.inner_text(), st.inner_text())
    shot(f'{tag}_34_voice_speaking')
    page.wait_for_timeout(3300)
    check('AI is responding state', 'responding' in st.inner_text().lower(), st.inner_text())
    shot(f'{tag}_35_voice_responding')
    page.get_by_role('button', name='Mute microphone').click()
    page.wait_for_timeout(300)
    check('muted state', 'Microphone off' in st.inner_text())
    shot(f'{tag}_36_voice_muted')
    page.get_by_role('button', name='Unmute microphone').click()
    page.get_by_role('button', name='Type instead').click()
    page.wait_for_timeout(400)
    check('Type instead returns to composer', page.get_by_placeholder('Ask the AI to build something...').is_visible())
    page.get_by_role('button', name='Switch to voice').click()
    page.wait_for_timeout(300)
    page.get_by_role('button', name='End voice').click()
    page.wait_for_timeout(400)
    check('End returns to composer', page.get_by_placeholder('Ask the AI to build something...').is_visible())

    # ---------- 3. BUILD PLAN (barbershop conversation) ----------
    go_convo('Build my barbershop website')
    plan = page.locator('.agent-card', has_text='Build Plan')
    check('Build Plan appears contextually', plan.count() == 1 and plan.is_visible())
    ptxt = plan.inner_text()
    for label in ['Project type', 'Website', 'Structure', 'Home', 'Services', 'About', 'Contact',
                  'Visual direction', 'Black and gold', 'Premium', 'Modern', 'Features',
                  'Responsive design', 'Service sections', 'Contact form', 'Technical approach']:
        check(f'plan shows {label}', label in ptxt)
    for b in ['Generate', 'Customize', 'Skip']:
        check(f'plan action {b}', plan.get_by_role('button', name=b).count() == 1)
    check('plan not overflowing', not overflow())
    sizes = min_target('.agent-btn')
    check('card buttons >= 44px', sizes and min(sizes) >= 44, str(min(sizes) if sizes else None))
    shot(f'{tag}_40_build_plan')

    plan.get_by_role('button', name='Customize').click()
    page.wait_for_timeout(500)
    check('customize sheet opens', page.get_by_role('heading', name='Customize plan').is_visible())
    ctxt = page.locator('.plan-form').inner_text()
    for label in ['Style', 'Colors', 'Pages', 'Features', 'Animations', 'Extra instructions']:
        check(f'customize field {label}', label in ctxt)
    shot(f'{tag}_41_plan_customize')
    page.get_by_role('checkbox', name='Dark', exact=True).click()
    page.get_by_role('checkbox', name='Booking', exact=True).click()
    page.locator('.plan-extra-input').fill('Add a gallery of recent cuts')
    shot(f'{tag}_41b_customize_edits')
    page.get_by_role('button', name='Update plan').click()
    page.wait_for_timeout(500)
    ptxt2 = page.locator('.agent-card', has_text='Build Plan').inner_text()
    check('updated plan shows Dark', 'Dark' in ptxt2)
    check('updated plan shows Booking', 'Booking' in ptxt2)
    check('updated plan shows extra', 'gallery of recent cuts' in ptxt2)
    shot(f'{tag}_42_plan_updated')

    page.get_by_role('button', name='Generate').click()
    page.wait_for_timeout(500)
    check('plan disappears on Generate', page.locator('.agent-card', has_text='Build Plan').count() == 0)
    act = page.locator('.agent-card', has_text='Building your project')
    check('agent activity visible', act.count() == 1)
    atxt = act.inner_text()
    for s in ['Analyzing project', 'Creating project structure', 'Creating files',
              'Installing dependencies', 'Running build', 'Checking errors']:
        check(f'activity lists {s}', s in atxt)
    shot(f'{tag}_43_agent_running')
    act.locator('.activity__toggle').click()
    page.wait_for_timeout(300)
    check('activity collapses', page.locator('.activity__steps').count() == 0)
    shot(f'{tag}_44_agent_collapsed')
    act.locator('.activity__toggle').click()
    page.wait_for_timeout(300)
    check('activity expands', page.locator('.activity__steps').count() == 1)
    page.wait_for_timeout(6200)
    done_card = page.locator('.agent-card', has_text='Build completed')
    check('Build completed appears', done_card.count() == 1)
    dtxt = done_card.inner_text()
    for s in ['14 files created', 'Responsive layout implemented', 'Build passed', 'Next steps']:
        check(f'completed shows {s}', s in dtxt)
    check('Open Preview action', done_card.get_by_role('button', name='Open Preview').count() == 1)
    check('Review Changes action', done_card.get_by_role('button', name='Review Changes').count() == 1)
    shot(f'{tag}_45_build_completed')
    done_card.get_by_role('button', name='Open Preview').click()
    page.wait_for_timeout(400)
    check('Open Preview toasts', page.locator('.toast').count() == 1)
    shot(f'{tag}_45b_preview_toast')

    # ---------- 4. ACTIVITY ERROR STATE (Kofen) ----------
    go_convo('Kofen marketplace')
    issue = page.locator('.agent-card', has_text='Build completed with issues')
    check('issues state visible', issue.count() == 1)
    itxt = issue.inner_text()
    for s in ['Website generated', 'Preview started', '2 errors found', 'Fix Automatically', 'Review Errors']:
        check(f'issues shows {s}', s in itxt)
    check('warn tone on issues card', issue.get_attribute('data-tone') == 'warn')
    shot(f'{tag}_46_agent_issues')

    # ---------- 5. APPROVAL (payments) ----------
    go_convo('Add payment integration')
    appr = page.locator('.agent-card', has_text='Wants to make these changes')
    check('approval card visible', appr.count() == 1)
    atxt = appr.inner_text()
    for s in ['12 files modified', '1 migration', '2 dependencies added', 'Major change', 'Review Changes', 'Approve', 'Cancel']:
        check(f'approval shows {s}', s in atxt)
    check('approval warn tone', appr.get_attribute('data-tone') == 'warn')
    shot(f'{tag}_47_approval')
    appr.get_by_role('button', name='Approve').click()
    page.wait_for_timeout(400)
    check('approve settles card', page.get_by_text('Changes approved').is_visible())
    shot(f'{tag}_48_approval_done')

    # ---------- 6. REGRESSION: Prompt 1/2 intact ----------
    go_convo('Fix authentication issue')
    body = page.evaluate('document.body.innerText')
    check('c1 auth thread intact', 'httpOnly' in body and 'middleware' in body)
    check('composer intact', page.get_by_placeholder('Ask the AI to build something...').is_visible())
    shot(f'{tag}_49_regression_c1')

    check(f'[{tag}] no console errors', not errors, str(errors[:3]))
    browser.close()


with sync_playwright() as pw:
    run(pw, 390, 844, 'm')
    run(pw, 1440, 900, 'd', mobile=False)

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} checks passed')
for name, _, extra in fails:
    print(' FAIL:', name, extra)
sys.exit(1 if fails else 0)
