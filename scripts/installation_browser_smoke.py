"""Optional Playwright checks; permanently installs ONLY a fresh disposable test site."""
import argparse
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend', default='http://localhost:3000')
    parser.add_argument('--allow-install', required=True, action='store_true')
    parser.add_argument('--channel', default=None)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    base = args.frontend.rstrip('/')
    token = os.environ['INSTALLATION_TEST_TOKEN']
    username = os.environ['ADMIN_TEST_USERNAME']
    password = os.environ['ADMIN_TEST_PASSWORD']
    site_name = 'installation-check-' + 'archive' * 24
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=args.channel)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        page.goto(base + '/')
        page.wait_for_url(base + '/install')
        expect(page.get_by_role('button', name='完成安装并创建管理员', exact=True)).to_be_visible()
        assert token not in page.content() and password not in page.content()
        page.goto(base + '/admin/login')
        page.wait_for_url(base + '/install')
        form = page.locator('form')
        form.locator('[name=site_name]').fill(site_name)
        form.locator('[name=site_description]').fill('浏览器初始化并持久保存的简介。')
        form.locator('[name=username]').fill(username)
        form.get_by_role('checkbox').check()

        def credentials(key=token, confirm=password):
            form.locator('[name=password]').fill(password)
            form.locator('[name=confirm_password]').fill(confirm)
            form.locator('[name=installation_token]').fill(key)

        credentials(confirm='mismatched-password-value')
        form.get_by_role('button', name='完成安装并创建管理员', exact=True).click()
        expect(form.get_by_role('alert')).to_contain_text('两次输入的密码不一致')
        expect(form.locator('[name=site_name]')).to_have_value(site_name)
        expect(form.locator('[name=password]')).to_have_value('')
        expect(form.locator('[name=installation_token]')).to_have_value('')
        credentials(key='x' * 43)
        form.get_by_role('button', name='完成安装并创建管理员', exact=True).click()
        expect(form.get_by_role('alert')).to_contain_text('安装密钥不正确')
        expect(form.locator('[name=username]')).to_have_value(username)
        credentials()
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            # Clear secret controls before any screenshots, then refill for submission.
            form.locator('[name=password]').fill('')
            form.locator('[name=confirm_password]').fill('')
            form.locator('[name=installation_token]').fill('')
            page.screenshot(path=str(args.screenshots / 'install-desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            page.screenshot(path=str(args.screenshots / 'install-mobile.png'), full_page=True)
            credentials()
        form.get_by_role('button', name='完成安装并创建管理员', exact=True).click()
        page.wait_for_url(base + '/install?complete=1')
        expect(page.get_by_role('heading', name='站点已安装', exact=True)).to_be_visible()
        expect(page.locator('[name=installation_token]')).to_have_count(0)
        assert token not in page.content() and password not in page.content()
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / 'install-complete-mobile.png'), full_page=True)
        page.get_by_role('link', name='前往管理员登录').click()
        page.locator('[name=username]').fill(username)
        page.locator('[name=password]').fill(password)
        page.get_by_role('button', name='登录', exact=True).click()
        page.wait_for_url(base + '/admin')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        cookie = next(item for item in context.cookies() if item['name'] == 'lostmidi_admin')
        assert cookie['httpOnly'] and cookie['sameSite'] == 'Strict' and cookie['path'] == '/admin'
        page.goto(base + '/')
        expect(page).to_have_title(site_name)
        expect(page.locator('meta[name=description]')).to_have_attribute('content', '浏览器初始化并持久保存的简介。')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.goto(base + '/install')
        expect(page.get_by_role('heading', name='站点已安装', exact=True)).to_be_visible()
        expect(page.locator('form')).to_have_count(0)
        # A fresh browser with no cookies/storage must see the same persisted state.
        fresh = browser.new_context()
        other = fresh.new_page()
        other.goto(base + '/')
        expect(other).to_have_title(site_name)
        other.goto(base + '/install')
        expect(other.get_by_role('heading', name='站点已安装', exact=True)).to_be_visible()
        fresh.close()
        context.close()
        browser.close()
    print('PASS: initial redirect, error/input handling, secret clearing, install, login cookie, site metadata, mobile layout and fresh-browser installation lock')


if __name__ == '__main__':
    main()
