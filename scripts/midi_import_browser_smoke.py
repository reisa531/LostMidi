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


def check_catalog(page, base, screenshots, search_slug):
    routes = [("/", "首页总览"), ("/midis", "MIDI"), ("/people", "作者"),
              ("/recovery", "寻回进度"), ("/map", "Map"), ("/search", "搜索")]
    for width in (1280, 390):
        page.set_viewport_size({"width": width, "height": 900})
        for path, label in routes:
            page.goto(base + path)
            expect(page.get_by_role("navigation", name="主导航").get_by_role("link", name=label, exact=True)).to_have_attribute("aria-current", "page")
            expect(page.get_by_role("main").get_by_role("heading", level=1)).to_be_visible()
            expect(page.get_by_role("main").get_by_role("alert")).to_have_count(0)
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), path
            if screenshots:
                screenshots.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshots / f"catalog-{path.strip('/') or 'home'}-{width}.png"), full_page=True)
    page.goto(base + "/midis?pageSize=1")
    expect(page.get_by_role("table").locator("tbody tr")).to_have_count(1)
    page.get_by_role("link", name="下一页", exact=True).click()
    expect(page).to_have_url(re.compile(r'[?&]page=2(?:&|$)'))
    page.goto(base + "/recovery")
    page.locator("select[name=status]").select_option("lost")
    page.get_by_role("button", name="应用筛选").click()
    expect(page.locator("select[name=status]")).to_have_value("lost")
    for by in ("author", "source"):
        page.goto(base + "/map?by=" + by)
        page.get_by_role("table").first.locator("tbody a").first.click()
        expect(page.locator("#group-entries").get_by_role("form", name="筛选档案")).to_be_visible()
    for path in ("/midis?page=0", "/people?page=0", "/map?by=invalid", "/recovery?status=invalid", "/midis?page=1&page=2"):
        page.goto(base + path)
        expect(page.get_by_role("main").get_by_role("alert")).to_contain_text("筛选参数无效")
    page.goto(base + "/midis?page=1000000")
    expect(page.get_by_text("暂无档案", exact=True)).to_be_visible()
    page.goto(base + "/search")
    expect(page.get_by_text("输入关键词开始搜索", exact=True)).to_be_visible()
    expect(page.locator('meta[name=robots]')).to_have_attribute('content', re.compile('noindex'))
    page.get_by_role('textbox', name='搜索关键词').fill(search_slug)
    page.get_by_role('button', name='搜索', exact=True).click()
    expect(page.get_by_role('main').locator('a[href="/midis/' + search_slug + '"]')).to_have_count(1)
    page.get_by_role('textbox', name='搜索关键词').fill('missing-' + uuid.uuid4().hex)
    page.get_by_role('button', name='搜索', exact=True).click()
    expect(page.get_by_text('没有匹配的作品', exact=True)).to_be_visible()
    expect(page.get_by_text('没有匹配的人物', exact=True)).to_be_visible()
    for query in ('q=', 'q=a&q=b', 'q=a&page=0', 'q=' + 'a' * 201):
        page.goto(base + '/search?' + query)
        expect(page.get_by_text('搜索条件无效', exact=True)).to_be_visible()
    print("PASS: six catalog modules, navigation, pagination, filters, groups, search/noindex, invalid/empty states and desktop/mobile layouts")


def check_deletion(page, context, base, screenshots):
    api = os.environ['BACKEND_API_URL']
    login = context.request.post(api + '/api/v1/admin/login', data={
        'username': os.environ['ADMIN_TEST_USERNAME'], 'password': os.environ['ADMIN_TEST_PASSWORD']})
    assert login.ok
    authorization = {'Authorization': 'Bearer ' + login.json()['token']}
    def request(path, method='GET', data=None):
        response = context.request.fetch(api + path, method=method, data=data, headers=authorization)
        assert response.ok, (path, response.status)
        return response.json()
    draft = {'title': '删除验收', 'slug': 'delete-browser-' + uuid.uuid4().hex, 'description': None,
             'estimated_year': None, 'archive_status': 'uncertain', 'copyright_status': 'unknown',
             'distribution_permission': 'unknown', 'license': None, 'rights_holder': None}
    entry = request('/api/v1/admin/midis', 'POST', draft)
    person = request('/api/v1/admin/people', 'POST', {'display_name': '删除人物验收', 'biography': None, 'aliases': ['Old']})['person']
    midi_path = '/api/v1/admin/midis/' + entry['id']
    person_path = '/api/v1/admin/people/' + person['id']
    request(midi_path + '/credits', 'PUT', {'revision': 1, 'credits': [{'person_id': person['id'], 'role': 'composer'}]})
    for resource, item in [('people', person), ('midis', entry)]:
        edit_url = base + '/admin/' + resource + '/' + item['id'] + '/edit'
        page.goto(edit_url); page.wait_for_load_state('networkidle')
        section = page.get_by_role('region', name=re.compile('危险操作'))
        section.get_by_role('button', name=re.compile('^删除')).click()
        expect(section.get_by_role('button', name='移入回收站', exact=True)).to_be_disabled()
        section.get_by_role('checkbox').check()
        section.get_by_role('button', name='取消', exact=True).click()
        expect(section.get_by_role('checkbox')).to_have_count(0)
        section.get_by_role('button', name=re.compile('^删除')).click()
        section.get_by_role('checkbox').check()
        if resource == 'people':
            section.get_by_role('button', name='移入回收站', exact=True).click()
            expect(section.get_by_role('alert')).to_contain_text('人物仍被')
            expect(section.get_by_role('checkbox')).to_be_checked()
            request(midi_path + '/credits', 'PUT', {'revision': 2, 'credits': []})
            request(person_path, 'PUT', {'display_name': '已修改人物', 'biography': None, 'aliases': [], 'revision': 1})
        else:
            current = request(midi_path)
            request(midi_path, 'PUT', {**draft, 'title': '已修改档案', 'revision': current['revision']})
        section.get_by_role('button', name='移入回收站', exact=True).click()
        expect(section.get_by_role('alert')).to_contain_text('版本已变化')
        page.reload(); page.wait_for_load_state('networkidle')
        page.set_viewport_size({'width': 390, 'height': 844})
        section.get_by_role('button', name=re.compile('^删除')).click()
        section.get_by_role('checkbox').check()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots / ('delete-' + resource + '.png')), full_page=True)
        def lose_response(route):
            if route.request.method == 'POST':
                route.fetch(timeout=60000); route.abort()
            else:
                route.continue_()
        if resource == 'midis':
            page.route('**/admin/midis/' + item['id'] + '/edit', lose_response)
            section.get_by_role('button', name='移入回收站', exact=True).click()
            expect(section.get_by_role('alert')).to_contain_text('连接中断')
            expect(section.get_by_role('checkbox')).to_be_checked()
            page.unroute('**/admin/midis/' + item['id'] + '/edit', lose_response)
        section.get_by_role('button', name='移入回收站', exact=True).click()
        expect(page).to_have_url(base + '/admin/' + resource + '?deleted=1')
        expect(page.get_by_role('status')).to_contain_text('已移入回收站')
        public_path = '/api/v1/' + resource + '/' + (draft['slug'] if resource == 'midis' else item['id'])
        assert context.request.get(api + public_path).status == 404
        page.goto(base + '/admin/trash')
        kind = 'midi' if resource == 'midis' else 'person'
        form = page.locator('form').filter(has=page.locator('input[name=type][value="' + kind + '"]')).filter(
            has=page.locator('input[name=id][value="' + item['id'] + '"]'))
        expect(form).to_have_count(1)
        form.get_by_role('button', name='恢复', exact=True).click()
        expect(form).to_have_count(0)
        assert context.request.get(api + public_path).ok
        audit = request('/api/v1/admin/trash')['audit']
        assert sorted(row['action'] for row in audit if row['entity_type'] == kind and row['entity_id'] == item['id']) == ['delete', 'restore']
    page.set_viewport_size({'width': 1280, 'height': 900})
    print('PASS: deletion confirmation, references, stale versions, mobile layout, lost-response retry, trash restore and audit history')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend', default='http://localhost:3000')
    parser.add_argument('--allow-writes', required=True, action='store_true')
    parser.add_argument('--channel', default='msedge')
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--expect-disabled', action='store_true')
    args = parser.parse_args()
    base = args.frontend.rstrip('/')
    expect.set_options(timeout=30000)
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
        expect(page).to_have_url(base + '/admin', timeout=30000)
        page.goto(base + '/admin/midis/new')
        if args.expect_disabled:
            expect(page.get_by_role('status')).to_contain_text('文件导入尚未启用')
            expect(page.locator('[name=file]')).to_have_count(0)
            page.locator('[name=title]').fill('禁用导入仍可建档')
            page.locator('[name=slug]').fill('disabled-browser-' + uuid.uuid4().hex)
            page.get_by_role('button', name='创建档案', exact=True).click()
            expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
            browser.close()
            print('PASS: disabled import hides file input and preserves metadata creation')
            return
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
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/files'))
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
        stale.wait_for_load_state('networkidle')
        expect(stale.locator('[name=revision]')).to_have_value('2')
        page.bring_to_front()
        expect(upload).to_be_enabled()
        upload.set_input_files({'name': 'second.mid', 'mimeType': 'audio/midi', 'buffer': midi(71)})
        rights.check(); submit.click()
        expect(page.locator('[name=revision]')).to_have_value('3')
        stale.bring_to_front()
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
        stale.close()
        visitor.bring_to_front()
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
        page.bring_to_front()
        page.goto(edit_url)
        page.wait_for_load_state('networkidle')
        page.locator('[name=distribution_permission]').select_option('restricted')
        page.get_by_role('button', name='保存修改', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('档案已保存')
        expect(page.locator('[name=distribution_permission]')).to_have_value('restricted')
        visitor.bring_to_front()
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
        check_deletion(page, context, base, args.screenshots)
        check_catalog(visitor, base, args.screenshots, create_slug)
        assert not errors, errors
        visitor_context.close()
        browser.close()
    print('PASS: upload regression, anonymous exact-byte download, original filename, error recovery, rights revocation and mobile layout')


if __name__ == '__main__':
    main()
