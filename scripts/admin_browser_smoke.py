"""Optional Playwright browser acceptance; writes records to a disposable test database."""
import argparse
import os
import re
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend', default='http://localhost:3000')
    parser.add_argument('--allow-writes', action='store_true', required=True)
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--channel', help='Use an installed browser, e.g. chrome or msedge')
    args = parser.parse_args()
    base = args.frontend.rstrip('/')
    marker = 'people-check-' + uuid.uuid4().hex
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=args.channel)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        page.goto(base + '/admin/people')
        expect(page).to_have_url(re.compile('/admin/login'))
        page.locator('[name=username]').fill(os.environ['ADMIN_TEST_USERNAME'])
        page.locator('[name=password]').fill(os.environ['ADMIN_TEST_PASSWORD'])
        page.get_by_role('button', name='登录', exact=True).click()
        expect(page).to_have_url(base + '/admin')
        cookies = context.cookies(base + '/admin')
        session = next(cookie for cookie in cookies if cookie['httpOnly'])
        assert session['path'] == '/admin' and session['sameSite'] == 'Strict'
        page.goto(base + '/admin/people/new')
        page.locator('[name=display_name]').fill(marker)
        page.locator('[name=biography]').fill('浏览器验收资料')
        page.locator('[name=aliases]').fill('历史昵称一\n历史昵称二')
        page.get_by_role('button', name='创建人物', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/people/\d+/edit'))
        person_id = re.search(r'/people/(\d+)', page.url).group(1)
        person_url = base + '/admin/people/' + person_id + '/edit'
        expect(page.locator('[name=aliases]')).to_have_value('历史昵称一\n历史昵称二')
        stale = context.new_page()
        stale.goto(person_url)
        page.locator('[name=biography]').fill('已修改的资料')
        page.get_by_role('button', name='保存人物资料', exact=True).click()
        expect(page.locator('[name=revision]')).to_have_value('2')
        stale.locator('[name=biography]').fill('保留未提交的输入')
        stale.get_by_role('button', name='保存人物资料', exact=True).click()
        expect(stale.get_by_role('alert')).to_be_visible()
        expect(stale.locator('[name=biography]')).to_have_value('保留未提交的输入')
        stale.close()
        page.goto(base + '/admin/midis/new')
        page.locator('[name=title]').fill(marker)
        page.locator('[name=slug]').fill(marker)
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        midi_id = re.search(r'/midis/(\d+)', page.url).group(1)
        page.locator('textarea[name=description]').fill('浏览器编辑验证')
        page.get_by_role('button', name='保存修改', exact=True).click()
        expect(page.locator('[name=revision]')).to_have_value('2')
        page.goto(base + '/admin/midis/' + midi_id + '/credits')
        page.get_by_role('button', name='添加署名', exact=True).click()
        page.locator('[name=person_id]').select_option(person_id)
        page.locator('[name=role]').select_option('composer')
        page.get_by_role('button', name='保存署名', exact=True).click()
        expect(page.locator('[name=revision]')).to_have_value('3')
        expect(page.locator('[name=person_id]')).to_have_value(person_id)
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / 'credits-desktop.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / 'credits-mobile.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile horizontal overflow'
        public = context.new_page()
        public.goto(base + '/midis/' + marker)
        expect(public.get_by_role('link', name=marker, exact=True)).to_be_visible()
        public.goto(base + '/people/' + person_id)
        expect(public.get_by_text('历史昵称一 / 历史昵称二', exact=True)).to_be_visible()
        expect(public.get_by_role('link', name=marker, exact=True)).to_be_visible()
        public.close()
        page.get_by_role('button', name=re.compile('移除第')).click()
        page.get_by_role('button', name='保存署名', exact=True).click()
        expect(page.locator('[name=revision]')).to_have_value('4')
        expect(page.locator('[name=person_id]')).to_have_count(0)
        page.get_by_role('button', name='退出登录', exact=True).click()
        expect(page).to_have_url(re.compile('/admin/login'))
        page.goto(person_url)
        expect(page).to_have_url(re.compile('/admin/login'))
        browser.close()
    print('PASS: browser login/cookie, MIDI writes, people/aliases, stale input, credits, public pages, mobile width and logout')


if __name__ == '__main__':
    main()
