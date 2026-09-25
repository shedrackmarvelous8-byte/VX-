from playwright.sync_api import sync_playwright
U="http://localhost:5173"
def small_targets(pg, scope):
    return pg.evaluate("""(scope)=>[...document.querySelectorAll(scope+' button, '+scope+' [role^=menuitem]')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [(b.getAttribute('aria-label')||b.textContent.trim()).slice(0,28),Math.round(r.width),Math.round(r.height)]}).filter(x=>x[1]<40||x[2]<40)""", scope)
with sync_playwright() as p:
    b=p.chromium.launch()
    def ctx(w,h,m): return b.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=m,has_touch=m)
    errs=[]
    c=ctx(390,844,True); pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(U); pg.wait_for_timeout(500); pg.screenshot(path='01_m_main.png')
    pg.click('[aria-label="Open sidebar"]'); pg.wait_for_timeout(450); pg.screenshot(path='02_m_drawer.png')
    print('drawer width', pg.evaluate("document.querySelector('.sidebar').getBoundingClientRect().width"))
    print('h-overflow sidebar', pg.evaluate("(()=>{const s=document.querySelector('.sidebar__scroll');return s.scrollWidth>s.clientWidth})()"))
    print('small in sidebar', small_targets(pg,'.sidebar'))
    pg.evaluate("document.querySelector('.sidebar__scroll').scrollTop=9999"); pg.wait_for_timeout(200); pg.screenshot(path='03_m_drawer_scrolled.png')
    pg.click('[aria-label="More options for Kofen marketplace"]'); pg.wait_for_timeout(300); pg.screenshot(path='04_m_menu.png')
    print('small in menu', small_targets(pg,'.menu'))
    pg.click('.menu >> text=Move'); pg.wait_for_timeout(250); pg.screenshot(path='05_m_menu_move.png')
    pg.click('.menu >> text=Atlas Web'); pg.wait_for_timeout(300); pg.screenshot(path='06_m_toast.png')
    pg.click('[aria-label="More options for Create a portfolio website"]'); pg.wait_for_timeout(250)
    pg.click('.menu >> text=Rename'); pg.wait_for_timeout(200)
    pg.keyboard.press('Control+A'); pg.keyboard.type('Portfolio v2'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    pg.click('[aria-label="More options for Portfolio v2"]'); pg.wait_for_timeout(250); pg.click('.menu >> text=Pin'); pg.wait_for_timeout(300)
    pg.screenshot(path='07_m_renamed_pinned.png')
    pg.click('[aria-label="More options for Add payment integration"]'); pg.wait_for_timeout(250); pg.click('.menu >> text=Delete'); pg.wait_for_timeout(300)
    pg.screenshot(path='08_m_confirm.png')
    pg.click('.confirm >> text=Delete'); pg.wait_for_timeout(300)
    print('deleted?', pg.locator('text=Add payment integration').count()==0)
    # Esc closes drawer
    pg.keyboard.press('Escape'); pg.wait_for_timeout(450)
    print('closed by esc', pg.evaluate("!document.querySelector('.sidebar').hasAttribute('data-open')"))
    # scrim close + select convo
    pg.click('[aria-label="Open sidebar"]'); pg.wait_for_timeout(400)
    pg.mouse.click(370,400); pg.wait_for_timeout(450)
    print('closed by scrim', pg.evaluate("!document.querySelector('.sidebar').hasAttribute('data-open')"))
    pg.click('[aria-label="Open sidebar"]'); pg.wait_for_timeout(400)
    pg.click('.recent-item__main >> text=Fix authentication issue'); pg.wait_for_timeout(500)
    print('closed after select', pg.evaluate("!document.querySelector('.sidebar').hasAttribute('data-open')"))
    pg.screenshot(path='09_m_chat.png')
    # Swipe close
    pg.click('[aria-label="Open sidebar"]'); pg.wait_for_timeout(400)
    cdp=c.new_cdp_session(pg)
    def t(type,x,y=500): cdp.send('Input.dispatchTouchEvent',{'type':type,'touchPoints':[] if type=='touchEnd' else [{'x':x,'y':y}]})
    t('touchStart',280); 
    for x in range(270,80,-30): t('touchMove',x); pg.wait_for_timeout(16)
    t('touchEnd',80); pg.wait_for_timeout(450)
    print('closed by swipe', pg.evaluate("!document.querySelector('.sidebar').hasAttribute('data-open')"))
    # small phone
    c2=ctx(360,640,True); pg2=c2.new_page(); pg2.goto(U); pg2.wait_for_timeout(400); pg2.click('[aria-label="Open sidebar"]'); pg2.wait_for_timeout(400); pg2.screenshot(path='10_small_drawer.png')
    pg2.evaluate("document.querySelector('.sidebar__scroll').scrollTop=9999"); pg2.wait_for_timeout(100)
    pg2.click('[aria-label="More options for Fix authentication issue"]'); pg2.wait_for_timeout(300); pg2.screenshot(path='11_small_menu_flip.png')
    r=pg2.evaluate("(()=>{const r=document.querySelector('.menu').getBoundingClientRect();return [r.top,r.bottom,innerHeight]})()"); print('menu in viewport', r)
    # tablet
    c3=ctx(820,1180,True); pg3=c3.new_page(); pg3.goto(U); pg3.wait_for_timeout(400); pg3.click('[aria-label="Open sidebar"]'); pg3.wait_for_timeout(400); pg3.screenshot(path='12_tablet_drawer.png')
    # desktop
    c4=ctx(1440,900,False); pg4=c4.new_page(); pg4.goto(U); pg4.wait_for_timeout(500); pg4.screenshot(path='13_desktop.png')
    pg4.hover('.recent-item >> nth=2'); pg4.wait_for_timeout(150)
    pg4.click('.recent-item >> nth=2 >> .recent-item__dots'); pg4.wait_for_timeout(300); pg4.screenshot(path='14_desktop_menu.png')
    pg4.keyboard.press('ArrowDown'); pg4.keyboard.press('Escape'); pg4.wait_for_timeout(200)
    print('menu closed by esc, sidebar still open', pg4.locator('.menu').count()==0, pg4.evaluate("document.querySelector('.sidebar').hasAttribute('data-open')"))
    pg4.click('.nav-item >> text=Terminal'); pg4.wait_for_timeout(300); pg4.screenshot(path='15_desktop_surface.png')
    pg4.click('[aria-label="Close sidebar"]'); pg4.wait_for_timeout(450); pg4.screenshot(path='16_desktop_collapsed.png')
    print('errors', errs)
    b.close()
