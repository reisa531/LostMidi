"""Optional Playwright acceptance. Only use a disposable migrated database and test storage."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
import uuid
from playwright.sync_api import sync_playwright, expect
from midi_import_smoke import MAX_FILE_SIZE, midi, raw_file


def check_transfer(request, url, payload, combined=False):
    assert request.url == url and request.method == 'POST' and request.resource_type == 'fetch'
    headers = request.all_headers()
    assert 'next-action' not in headers and 'authorization' not in headers
    assert 'lostmidi_admin=' in headers.get('cookie', '')
    parsed = urllib.parse.urlsplit(url)
    assert headers['origin'] == parsed.scheme + '://' + parsed.netloc
    if combined:
        assert headers['content-type'].split(';')[0] == 'application/json'
        body = request.post_data_json
        assert str(uuid.UUID(body['request_id'], version=4)) == body['request_id']
        assert body['file']['filename'] == payload['name'] and body['file']['rights_confirmed'] is True
        content = base64.b64decode(body['file']['content_base64'], validate=True)
    else:
        assert headers['content-type'] == 'application/octet-stream'
        assert urllib.parse.unquote(headers['x-file-name']) == payload['name']
        assert headers['x-rights-confirmed'] == 'true' and int(headers['x-entry-revision']) > 0
        # CDP can omit File/Blob POST bodies; verify these bytes through the anonymous download instead.
        return
    assert content == payload['buffer']
    assert hashlib.sha256(content).digest() == hashlib.sha256(payload['buffer']).digest()


def check_download(page, button, payload):
    expect(button).to_have_text('下载文件')
    with page.expect_response(lambda response: '/files/' in response.url and response.url.endswith('/download'), timeout=120000) as response_info:
        with page.expect_download(timeout=120000) as saved:
            button.click()
    response = response_info.value
    assert response.status == 200
    assert response.header_value('content-type').split(';')[0] == 'application/octet-stream'
    assert response.header_value('content-length') == str(len(payload['buffer']))
    assert response.header_value('x-content-type-options') == 'nosniff'
    disposition = response.header_value('content-disposition')
    assert disposition.startswith('attachment;')
    assert urllib.parse.unquote(disposition.split("filename*=UTF-8''")[1]) == payload['name']
    assert 'no-store' in response.header_value('cache-control')
    downloaded = saved.value
    assert downloaded.suggested_filename == payload['name']
    content = Path(downloaded.path()).read_bytes()
    assert content == payload['buffer']
    assert hashlib.sha256(content).hexdigest() == hashlib.sha256(payload['buffer']).hexdigest()


def check_catalog(page, base, screenshots, search_slug):
    routes = [("/", "首页总览"), ("/midis", "MIDI"), ("/people", "作者"),
              ("/recovery", "寻回进度"), ("/map", "关系图谱"), ("/search", "搜索")]
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
                page.screenshot(path=str(screenshots / f"catalog-{path.strip('/') or 'home'}-{width}.png"), full_page=True, caret='initial')
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
    entry = page.request.get(os.environ['BACKEND_API_URL'] + '/api/v1/midis/' + search_slug).json()['entry']
    expect(page.get_by_role('main').locator('a[href="/midis/' + entry['public_id'] + '"]')).to_have_count(1)
    page.get_by_role('textbox', name='搜索关键词').fill('missing-' + uuid.uuid4().hex)
    page.get_by_role('button', name='搜索', exact=True).click()
    expect(page.get_by_text('没有匹配的作品', exact=True)).to_be_visible()
    expect(page.get_by_text('没有匹配的人物', exact=True)).to_be_visible()
    page.goto(base + '/search?q=')
    expect(page.get_by_text('输入关键词开始搜索', exact=True)).to_be_visible()
    for query in ('q=a&q=b', 'q=a&page=0', 'q=' + 'a' * 201):
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
            page.screenshot(path=str(screenshots / ('delete-' + resource + '.png')), full_page=True, caret='initial')
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
        page.locator('[name=distribution_permission]').select_option('permission_granted')
        with page.expect_request(lambda request: request.method == 'POST' and request.url == base + '/admin/midis/new') as metadata_request:
            page.get_by_role('button', name='创建档案', exact=True).click()
        assert 'next-action' in metadata_request.value.headers  # No-file creation stays a Server Action.
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        edit_url = page.url
        visitor_context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        visitor = visitor_context.new_page()
        visitor.on('pageerror', lambda error: errors.append(str(error)))
        visitor.goto(base + '/midis/' + slug)
        public_url = visitor.url
        assert re.fullmatch(re.escape(base) + r'/midis/[0-9a-f-]{36}', public_url)
        expect(visitor.get_by_text('此档案目前仅保存文字资料。', exact=False)).to_be_visible()
        visitor.wait_for_load_state('networkidle')
        page.get_by_role('navigation', name='作品资料管理').locator('a[href$="/files"]').click()
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/files'))
        page.wait_for_load_state('networkidle')
        expect(page.locator('[name=revision]')).to_have_value('1')
        upload = page.locator('form input[name=file]')
        assert upload.get_attribute('accept') is None and upload.get_attribute('multiple') is None
        rights = page.locator('[name=rights_confirmed]')
        submit = page.get_by_role('button', name='确认并公开上传', exact=True)
        file_id = re.search(r'/admin/midis/(\d+)/files', page.url).group(1)
        transfer_url = base + '/admin/file-transfer/' + file_id + '/files'
        # Empty/+1 are rejected; the exact decimal 15 MB limit and arbitrary bytes are allowed.
        upload.set_input_files({'name': 'empty.zip', 'mimeType': 'application/zip', 'buffer': b''})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('非空')
        upload.set_input_files({'name': 'large.zip', 'mimeType': 'application/zip', 'buffer': b'x' * (MAX_FILE_SIZE + 1)})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件过大')
        payload = {'name': '归档测试.zip', 'mimeType': 'application/zip', 'buffer': raw_file(MAX_FILE_SIZE, slug)}
        assert len(payload['buffer']) > 4_500_000 and not payload['buffer'].startswith(b'MThd')
        upload.set_input_files(payload)
        expect(page.locator('form').get_by_role('alert')).to_have_count(0)
        # Simulated backend failure must not discard the valid large file or checkbox.
        def unavailable(route):
            route.fulfill(status=503, content_type='application/json',
                          body=json.dumps({'error': {'code': 'STORAGE_UNAVAILABLE', 'message': 'Smoke storage failure'}}))
        page.route(transfer_url, unavailable)
        rights.check()
        with page.expect_request(transfer_url) as failed_transfer:
            submit.click()
        check_transfer(failed_transfer.value, transfer_url, payload)
        expect(page.locator('form').get_by_role('alert')).to_contain_text('存储服务暂时不可用')
        assert upload.evaluate('(el) => el.files[0].name') == payload['name']
        assert upload.evaluate('(el) => el.files[0].size') == MAX_FILE_SIZE
        expect(rights).to_be_checked()
        expect(page.locator('[name=revision]')).to_have_value('1')
        page.unroute(transfer_url, unavailable)
        with page.expect_request(transfer_url) as sent_transfer:
            submit.click()
        check_transfer(sent_transfer.value, transfer_url, payload)
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
            stale.screenshot(path=str(args.screenshots / 'files-desktop.png'), full_page=True, caret='initial')
        stale.set_viewport_size({'width': 390, 'height': 844})
        assert stale.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
        if args.screenshots:
            stale.screenshot(path=str(args.screenshots / 'files-mobile.png'), full_page=True, caret='initial')
        stale.close()
        visitor.bring_to_front()
        visitor.reload()
        assert not any(cookie['name'] == 'lostmidi_admin' for cookie in visitor_context.cookies())
        downloads = visitor.get_by_role('button', name=re.compile(r'^下载文件：'))
        expect(downloads).to_have_count(3)
        raw_download = visitor.get_by_role('button', name='下载文件：' + payload['name'], exact=True)
        check_download(visitor, raw_download, payload)
        assert visitor.url == public_url
        if args.screenshots:
            visitor.screenshot(path=str(args.screenshots / 'download-desktop.png'), full_page=True, caret='initial')
        visitor.set_viewport_size({'width': 390, 'height': 844})
        assert visitor.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Public page mobile overflow'
        if args.screenshots:
            visitor.screenshot(path=str(args.screenshots / 'download-mobile.png'), full_page=True, caret='initial')
        visitor.route('**/api/midis/*/files/*/download', lambda route: route.abort())
        raw_download.click()
        expect(visitor.get_by_role('main').get_by_role('alert')).to_be_visible()
        assert visitor.url == public_url
        visitor.unroute('**/api/midis/*/files/*/download')
        check_download(visitor, raw_download, payload)
        expect(visitor.get_by_role('main').get_by_role('alert')).to_have_count(0)
        page.bring_to_front()
        page.goto(edit_url)
        page.wait_for_load_state('networkidle')
        revision_input = page.locator('form').filter(has=page.locator('[name=distribution_permission]')).locator('[name=revision]')
        revision_before = int(revision_input.input_value())
        page.locator('[name=distribution_permission]').select_option('restricted')
        with page.expect_request(lambda request: request.method == 'POST' and request.url == edit_url) as edit_request:
            page.get_by_role('button', name='保存修改', exact=True).click()
        assert 'next-action' in edit_request.value.headers
        expect(revision_input).to_have_value(str(revision_before + 1))
        expect(page.get_by_role('status')).to_contain_text('档案已保存')
        expect(page.locator('[name=distribution_permission]')).to_have_value('restricted')
        visitor.bring_to_front()
        raw_download.click()
        expect(visitor.get_by_role('main').get_by_role('alert')).to_contain_text('暂时无法下载')
        visitor.reload()
        expect(visitor.get_by_role('button', name=re.compile(r'^下载文件：'))).to_have_count(0)
        page.goto(base + '/admin/midis/new')
        page.wait_for_load_state('networkidle')
        create_slug = 'create-browser-' + uuid.uuid4().hex
        page.locator('[name=title]').fill('同页创建与上传')
        page.locator('[name=slug]').fill(create_slug)
        page.locator('[name=distribution_permission]').select_option('permission_granted')
        new_file = page.get_by_label('选择音乐文件', exact=True)
        assert new_file.get_attribute('accept') is None and new_file.get_attribute('multiple') is None
        new_rights = page.locator('[name=rights_confirmed]')
        create = page.get_by_role('button', name='创建档案', exact=True)
        create_transfer_url = base + '/admin/file-transfer/create'
        new_file.set_input_files({'name': 'empty.raw', 'mimeType': 'application/octet-stream', 'buffer': b''})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('非空')
        new_file.set_input_files({'name': 'large.raw', 'mimeType': 'application/octet-stream', 'buffer': b'x' * (MAX_FILE_SIZE + 1)})
        expect(page.locator('form').get_by_role('alert')).to_contain_text('文件过大')
        new_file.set_input_files(payload)  # Inclusive boundary must pass client validation here too.
        expect(page.locator('form').get_by_role('alert')).to_have_count(0)
        combined_payload = {'name': '同时创建.raw', 'mimeType': 'application/octet-stream',
                            'buffer': raw_file(5_000_001, create_slug)}
        assert len(combined_payload['buffer']) > 4_500_000 and not combined_payload['buffer'].startswith(b'MThd')
        new_file.set_input_files(combined_payload)
        create.click()
        assert new_rights.evaluate('(el) => !el.checkValidity()')
        expect(page).to_have_url(base + '/admin/midis/new')
        def reject_creation(route):
            route.fulfill(status=400, content_type='application/json',
                          body=json.dumps({'error': {'code': 'INVALID_FILE', 'message': 'Smoke file validation failure'}}))
        page.route(create_transfer_url, reject_creation)
        new_rights.check()
        with page.expect_request(create_transfer_url) as failed_creation:
            create.click()
        check_transfer(failed_creation.value, create_transfer_url, combined_payload, combined=True)
        expect(page.locator('form').get_by_role('alert')).to_be_visible()
        expect(page.locator('[name=title]')).to_have_value('同页创建与上传')
        assert new_file.evaluate('(el) => el.files[0].name') == combined_payload['name']
        assert new_file.evaluate('(el) => el.files[0].size') == len(combined_payload['buffer'])
        expect(new_rights).to_be_checked()
        assert visitor_context.request.get(os.environ['BACKEND_API_URL'] + '/api/v1/midis/' + create_slug).status == 404
        page.unroute(create_transfer_url, reject_creation)
        with page.expect_request(create_transfer_url) as sent_creation:
            create.click()
        check_transfer(sent_creation.value, create_transfer_url, combined_payload, combined=True)
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'), timeout=60000)
        visitor.goto(base + '/midis/' + create_slug)
        combined_public_url = visitor.url
        expect(visitor.get_by_role('button', name='下载文件：' + combined_payload['name'], exact=True)).to_be_visible()
        check_download(visitor, visitor.get_by_role('button', name='下载文件：' + combined_payload['name'], exact=True), combined_payload)
        assert visitor.url == combined_public_url
        page.goto(base + '/admin/midis/new')
        page.wait_for_load_state('networkidle')
        page.locator('[name=title]').fill('重复文件不得建档')
        duplicate_slug = create_slug + '-duplicate'
        page.locator('[name=slug]').fill(duplicate_slug)
        page.locator('[name=file]').set_input_files({**combined_payload, 'name': 'duplicate.zip'})
        page.locator('[name=rights_confirmed]').check()
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('相同文件已归属于其他档案')
        assert visitor_context.request.get(os.environ['BACKEND_API_URL'] + '/api/v1/midis/' + duplicate_slug).status == 404
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
        page.locator('[name=distribution_permission]').select_option('permission_granted')
        retry_payload = {'name': '重试.mid', 'mimeType': 'audio/midi', 'buffer': midi(82)}
        page.locator('[name=file]').set_input_files(retry_payload)
        page.locator('[name=rights_confirmed]').check()
        lost_requests = []
        def lose_saved_response(route):
            if route.request.method == 'POST':
                check_transfer(route.request, create_transfer_url, retry_payload, combined=True)
                lost_requests.append(route.request.post_data_json)
                response = route.fetch(timeout=60000)
                assert response.status == 201
                route.abort()
            else:
                route.continue_()
        page.route(create_transfer_url, lose_saved_response)
        page.get_by_role('button', name='创建档案', exact=True).click()
        expect(page.locator('form').get_by_role('alert')).to_contain_text('连接中断')
        assert page.locator('[name=file]').evaluate('(el) => el.files[0].name') == '重试.mid'
        expect(page.locator('[name=rights_confirmed]')).to_be_checked()
        expect(page.locator('[name=title]')).to_have_value('响应丢失安全重试')
        expect(page.locator('[name=title]')).to_be_disabled()
        assert len(lost_requests) == 1
        page.unroute(create_transfer_url, lose_saved_response)
        visitor.goto(base + '/midis/' + retry_slug)
        expect(visitor.get_by_role('button', name='下载文件：重试.mid', exact=True)).to_have_count(1)
        with page.expect_request(create_transfer_url) as retry_request:
            page.get_by_role('button', name='重试本次提交', exact=True).click()
        check_transfer(retry_request.value, create_transfer_url, retry_payload, combined=True)
        assert retry_request.value.post_data_json == lost_requests[0]
        expect(page).to_have_url(re.compile(r'/admin/midis/\d+/edit'))
        visitor.reload()
        expect(visitor.get_by_role('button', name='下载文件：重试.mid', exact=True)).to_have_count(1)
        check_download(visitor, visitor.get_by_role('button', name='下载文件：重试.mid', exact=True), retry_payload)
        if os.environ.get('BACKEND_API_URL'):
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(os.environ['BACKEND_API_URL'] + '/api/v1/catalog/entries?pageSize=100') as response:
                entries = json.load(response)['data']
            assert sum(entry['slug'] == retry_slug for entry in entries) == 1
        page.goto(base + '/admin/midis/new')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Create form mobile overflow'
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / 'create-mobile.png'), full_page=True, caret='initial')
        check_deletion(page, context, base, args.screenshots)
        check_catalog(visitor, base, args.screenshots, create_slug)
        assert not errors, errors
        visitor_context.close()
        browser.close()
    print('PASS: same-origin fetch, 15 MB/+1, >4.5 MB non-MIDI import/create, anonymous exact SHA/name download, retries, rights and mobile layout')


if __name__ == '__main__':
    main()
