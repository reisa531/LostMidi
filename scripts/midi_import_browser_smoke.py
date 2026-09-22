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
        page.locator('[name=slug]').fill('file-browser-' + uuid.uuid4().hex)
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        page.get_by_role('link', name='管理 MIDI 文件 →', exact=True).click()
        expect(page.locator('[name=revision]')).to_have_value('1')
        upload = page.locator('[name=file]')
        rights = page.locator('[name=rights_confirmed]')
        submit = page.get_by_role('button', name='确认并私下归档', exact=True)
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
        expect(page.get_by_role('status')).to_contain_text('文件已成功私下归档')
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
        stale.get_by_role('button', name='确认并私下归档', exact=True).click()
        expect(stale.locator('form').get_by_role('alert')).to_contain_text('作品版本或文件归属发生冲突')
        assert pending_file.evaluate('(el) => el.files[0].name') == 'retry.mid'
        stale.get_by_role('button', name='刷新版本与文件列表', exact=True).click()
        expect(stale.locator('[name=revision]')).to_have_value('3')
        assert pending_file.evaluate('(el) => el.files[0].name') == 'retry.mid'
        stale.get_by_role('button', name='确认并私下归档', exact=True).click()
        expect(stale.get_by_role('status')).to_contain_text('文件已成功私下归档')
        expect(stale.locator('[name=revision]')).to_have_value('4')
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            stale.screenshot(path=str(args.screenshots / 'files-desktop.png'), full_page=True)
        stale.set_viewport_size({'width': 390, 'height': 844})
        assert stale.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
        if args.screenshots:
            stale.screenshot(path=str(args.screenshots / 'files-mobile.png'), full_page=True)
        assert not errors, errors
        browser.close()
    print('PASS: upload UI, validation, retained failure input, duplicate success, file-list refresh, stale revision recovery and mobile layout')


if __name__ == '__main__':
    main()
