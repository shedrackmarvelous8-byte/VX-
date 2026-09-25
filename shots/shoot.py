from playwright.sync_api import sync_playwright
U="http://localhost:5173"
with sync_playwright() as p:
    b=p.chromium.launch()
    def ctx(w,h,mobile):
        return b.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=mobile,has_touch=mobile)
    c=ctx(390,844,True); pg=c.new_page(); pg.goto(U); pg.wait_for_timeout(600)
    pg.screenshot(path='m_empty.png')
    ov=pg.evaluate("document.documentElement.scrollWidth > innerWidth"); print('overflow',ov)
    small=pg.evaluate("""[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&!b.closest('[inert]')).map(b=>{const r=b.getBoundingClientRect();return [b.getAttribute('aria-label')||b.textContent.trim().slice(0,20),Math.round(r.width),Math.round(r.height)]}).filter(x=>x[1]<44||x[2]<44)""")
    print('small',small)
    pg.click('[aria-label="Open sidebar"]'); pg.wait_for_timeout(500); pg.screenshot(path='m_sidebar.png')
    pg.click('text=Session-based auth'); pg.wait_for_timeout(600); pg.screenshot(path='m_chat.png')
    pg.evaluate("document.querySelector('.thread').scrollTop=500"); pg.wait_for_timeout(400); pg.screenshot(path='m_chat2.png')
    pg.click('[aria-label="Switch to voice"]'); pg.wait_for_timeout(300); pg.screenshot(path='m_voice.png')
    c=ctx(1440,900,False); pg=c.new_page(); pg.goto(U); pg.wait_for_timeout(600); pg.screenshot(path='d_empty.png')
    pg.click('text=Session-based auth'); pg.wait_for_timeout(600); pg.screenshot(path='d_chat.png')
    c=ctx(820,1180,True); pg=c.new_page(); pg.goto(U); pg.wait_for_timeout(600); pg.screenshot(path='t_empty.png')
    b.close()
