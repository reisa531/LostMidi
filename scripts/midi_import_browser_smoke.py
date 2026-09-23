"""Optional Playwright acceptance. Only use a disposable migrated database and test storage."""
import argparse
import os
from pathlib import Path
import re
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
        assert not errors, errors
        visitor_context.close()
        browser.close()
    print('PASS: upload regression, anonymous exact-byte download, original filename, error recovery, rights revocation and mobile layout')


if __name__ == '__main__':
    main()
