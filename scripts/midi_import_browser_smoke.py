"""Optional Playwright acceptance. Only use a disposable migrated database and test storage."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request
import uuid
from playwright.sync_api import sync_playwright, expect
from midi_import_smoke import midi


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend', default='http://localhost:3000')
    parser.add_argument('--allow-writes', required=True, action='store_true')
    parser.add_argument('--channel', default='msedge')
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    base = args.frontend.rstrip('/')
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=args.channel)
        context = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/admin/midis/new')
        expect(page).to_have_url(re.compile('/admin/login'))
        page.locator('[name=username]').fill(os.environ['ADMIN_TEST_USERNAME'])
        page.locator('[name=password]').fill(os.environ['ADMIN_TEST_PASSWORD'])
        page.get_by_role('button', name='登录', exact=True).click()
        expect(page).to_have_url(base + '/admin')
        page.goto(base + '/admin/midis/new')
        page.locator('[name=title]').fill('文件导入浏览器测试')
        slug = 'file-browser-' + uuid.uuid4().hex
        page.locator('[name=slug]').fill(slug)
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        edit_url = page.url
        visitor_context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        visitor = visitor_context.new_page()
        visitor.on('pageerror', lambda error: errors.append(str(error)))
        visitor.goto(base + '/midis/' + slug)
        expect(visitor.get_by_text('尚无已登记的 MIDI 文件。此档案目前仅保存文字资料。')).to_be_visible()
        visitor.wait_for_load_state('networkidle')
        page.get_by_role('link', name='管理 MIDI 文件 →', exact=True).click()
        page.wait_for_load_state('networkidle')
        expect(page.locator('[name=revision]')).to_have_value('1')
        upload = page.locator('[name=file]')
        rights = page.locator('[name=rights_confirmed]')
        submit = page.get_by_role('button', name='确认并公开上传', exact=True)
        # Client validation rejects extensions and files beyond the inclusive limit.
        upload.set_input_files({'name': 'file.zip', 'mimeType': 'application/zip', 'buffer': midi(70)})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('请选择一个非空')
        upload.set_input_files({'name': 'large.mid', 'mimeType': 'audio/midi', 'buffer': b'x' * 1048577})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件过大')
        # Server rejection preserves the selected file and checkbox for correction.
        upload.set_input_files({'name': 'invalid.mid', 'mimeType': 'audio/midi', 'buffer': b'invalid midi'})
        rights.check(); submit.click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件不是有效的')
        assert upload.evaluate('(el) => el.files[0].name') == 'invalid.mid'
        expect(rights).to_be_checked()
        payload = {'name': '归档测试.MID', 'mimeType': 'audio/midi', 'buffer': midi(70)}
        upload.set_input_files(payload); submit.click()
        expect(page.get_by_role('status')).to_contain_text('文件已成功上传并公开分发')
        expect(page.locator('[name=revision]')).to_have_value('2')
        expect(page.get_by_role('heading', name='已存文件（1）')).to_be_visible()
        expect(upload).to_have_value(''); expect(rights).not_to_be_checked()
        upload.set_input_files(payload); rights.check(); submit.click()
        expect(page.get_by_role('status')).to_contain_text('已去重')
        expect(page.locator('[name=revision]')).to_have_value('2')
        # Another file import makes the form stale; refresh preserves input.
        stale = context.new_page(); stale.goto(page.url)
        upload.set_input_files({'name': 'second.mid', 'mimeType': 'audio/midi', 'buffer': midi(71)})
        rights.check(); submit.click()
        expect(page.locator('[name=revision]')).to_have_value('3')
        pending_file = stale.locator('[name=file]')
        pending_file.set_input_files({'name': 'retry.mid', 'mimeType': 'audio/midi', 'buffer': midi(72)})
        stale.locator('[name=rights_confirmed]').check()
        stale.get_by_role('button', name='确认并公开上传', exact=True).click()
        expect(stale.locator('form').get_by_role('alert')).to_contain_text('作品版本或文件归属发生冲突')
        assert pending_file.evaluate('(el) => el.files[0].name') == 'retry.mid'
        stale.get_by_role('button', name='刷新版本与文件列表', exact=True).click()
        expect(stale.locator('[name=revision]')).to_have_value('3')
        assert pending_file.evaluate('(el) => el.files[0].name') == 'retry.mid'
        stale.get_by_role('button', name='确认并公开上传', exact=True).click()
        expect(stale.get_by_role('status')).to_contain_text('文件已成功上传并公开分发')
        expect(stale.locator('[name=revision]')).to_have_value('4')
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            stale.screenshot(path=str(args.screenshots / 'files-desktop.png'), full_page=True)
        stale.set_viewport_size({'width': 390, 'height': 844})
        assert stale.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
        if args.screenshots:
            stale.screenshot(path=str(args.screenshots / 'files-mobile.png'), full_page=True)
        visitor.reload()
        downloads = visitor.get_by_role('button', name=re.compile(r'^下载 MIDI：'))
        expect(downloads).to_have_count(3)
        with visitor.expect_download() as saved_download:
            downloads.first.click()
        downloaded = saved_download.value
        assert downloaded.suggested_filename == '归档测试.MID'
        assert Path(downloaded.path()).read_bytes() == midi(70)
        assert visitor.url == base + '/midis/' + slug
        if args.screenshots:
            visitor.screenshot(path=str(args.screenshots / 'download-desktop.png'), full_page=True)
        visitor.set_viewport_size({'width': 390, 'height': 844})
        assert visitor.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Public page mobile overflow'
        if args.screenshots:
            visitor.screenshot(path=str(args.screenshots / 'download-mobile.png'), full_page=True)
        visitor.route('**/api/midis/*/files/*/download', lambda route: route.abort())
        downloads.first.click()
        expect(visitor.get_by_role('main').get_by_role('alert')).to_be_visible()
        assert visitor.url == base + '/midis/' + slug
        visitor.unroute('**/api/midis/*/files/*/download')
        with visitor.expect_download() as retry_download:
            downloads.first.click()
        assert Path(retry_download.value.path()).read_bytes() == midi(70)
        expect(visitor.get_by_role('main').get_by_role('alert')).to_have_count(0)
        page.goto(edit_url)
        page.locator('[name=distribution_permission]').select_option('restricted')
        page.get_by_role('button', name='保存修改', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('档案已保存')
        downloads.first.click()
        expect(visitor.get_by_role('main').get_by_role('alert')).to_contain_text('暂时无法下载')
        visitor.reload()
        expect(visitor.get_by_role('button', name=re.compile(r'^下载 MIDI：'))).to_have_count(0)
        page.goto(base + '/admin/midis/new')
        page.wait_for_load_state('networkidle')
        create_slug = 'create-browser-' + uuid.uuid4().hex
        page.locator('[name=title]').fill('同页创建与上传')
        page.locator('[name=slug]').fill(create_slug)
        new_file = page.locator('[name=file]')
        new_rights = page.locator('[name=rights_confirmed]')
        create = page.get_by_role('button', name='创建档案', exact=True)
        new_file.set_input_files({'name': 'large.mid', 'mimeType': 'audio/midi', 'buffer': b'x' * 1048577})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件过大')
        new_file.set_input_files({'name': 'invalid.mid', 'mimeType': 'audio/midi', 'buffer': b'not midi'})
        create.click()
        assert new_rights.evaluate('(el) => !el.checkValidity()')
        expect(page).to_have_url(base + '/admin/midis/new')
        new_rights.check(); create.click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件不是有效的')
        expect(page.locator('[name=title]')).to_have_value('同页创建与上传')
        assert new_file.evaluate('(el) => el.files[0].name') == 'invalid.mid'
        expect(new_rights).to_be_checked()
        new_file.set_input_files({'name': '同时创建.mid', 'mimeType': 'audio/midi', 'buffer': midi(81)})
        create.click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        visitor.goto(base + '/midis/' + create_slug)
        expect(visitor.get_by_role('button', name='下载 MIDI：同时创建.mid', exact=True)).to_be_visible()
        with visitor.expect_download() as combined_download:
            visitor.get_by_role('button', name='下载 MIDI：同时创建.mid', exact=True).click()
        assert Path(combined_download.value.path()).read_bytes() == midi(81)
        page.goto(base + '/admin/midis/new')
        page.wait_for_load_state('networkidle')
        page.locator('[name=title]').fill('重复文件不得建档')
        duplicate_slug = create_slug + '-duplicate'
        page.locator('[name=slug]').fill(duplicate_slug)
        page.locator('[name=file]').set_input_files({'name': 'duplicate.mid', 'mimeType': 'audio/midi', 'buffer': midi(81)})
        page.locator('[name=rights_confirmed]').check()
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('相同文件已归属于其他档案')
        page.get_by_role('button', name='移除文件，仅保存资料', exact=True).click()
        expect(page.locator('[name=file]')).to_have_value('')
        expect(page.locator('[name=rights_confirmed]')).not_to_be_checked()
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        page.goto(base + '/admin/midis/new')
        page.wait_for_load_state('networkidle')
        retry_slug = 'retry-browser-' + uuid.uuid4().hex
        page.locator('[name=title]').fill('响应丢失安全重试')
        page.locator('[name=slug]').fill(retry_slug)
        page.locator('[name=file]').set_input_files({'name': '重试.mid', 'mimeType': 'audio/midi', 'buffer': midi(82)})
        page.locator('[name=rights_confirmed]').check()
        def lose_saved_response(route):
            if route.request.method == 'POST':
                route.fetch(timeout=60000)
                route.abort()
            else:
                route.continue_()
        page.route('**/admin/midis/new', lose_saved_response)
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('连接中断')
        assert page.locator('[name=file]').evaluate('(el) => el.files[0].name') == '重试.mid'
        expect(page.locator('[name=title]')).to_have_value('响应丢失安全重试')
        expect(page.locator('[name=title]')).to_be_disabled()
        page.unroute('**/admin/midis/new', lose_saved_response)
        visitor.goto(base + '/midis/' + retry_slug)
        expect(visitor.get_by_role('button', name='下载 MIDI：重试.mid', exact=True)).to_have_count(1)
        page.get_by_role('button', name='重试本次提交', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        visitor.reload()
        expect(visitor.get_by_role('button', name='下载 MIDI：重试.mid', exact=True)).to_have_count(1)
        if os.environ.get('BACKEND_API_URL'):
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(os.environ['BACKEND_API_URL'] + '/api/v1/catalog/entries?pageSize=100') as response:
                entries = json.load(response)['data']
            assert sum(entry['slug'] == retry_slug for entry in entries) == 1
        page.goto(base + '/admin/midis/new')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Create form mobile overflow'
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / 'create-mobile.png'), full_page=True)
        assert not errors, errors
        visitor_context.close()
        browser.close()
    print('PASS: upload regression, anonymous exact-byte download, original filename, error recovery, rights revocation and mobile layout')


if __name__ == '__main__':
    main()
