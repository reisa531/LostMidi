import argparse
import json
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect


def check_changelog(page, base, screenshots=None):
    releases = json.loads((Path(__file__).resolve().parents[1] / 'frontend/src/lib/changelog.json').read_text(encoding='utf-8'))
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/midis')
    page.get_by_role('contentinfo').get_by_role('link', name=re.compile('更新日志')).click()
    expect(page).to_have_url(base + '/changelog')
    expect(page.get_by_role('main').get_by_role('heading', level=1)).to_have_text('更新日志')
    expect(page).to_have_title(re.compile('更新日志'))
    expect(page.locator('link[rel=canonical]')).to_have_attribute('href', base + '/changelog')
    expect(page.get_by_role('main').locator('section')).to_have_count(len(releases))
    for release in releases:
        section = page.get_by_role('region', name=release['title'], exact=True)
        expect(section).to_be_visible()
        expect(section.locator('time')).to_have_attribute('datetime', release['date'])
        expect(section.locator('li')).to_have_text(release['changes'])
        section.get_by_role('link', name=f"版本 {release['version']} 的永久链接").click()
        expect(page).to_have_url(base + '/changelog#v' + release['version'])
    page.reload()
    expect(page.get_by_role('main').get_by_role('heading', level=1)).to_have_text('更新日志')
    for width in (1280, 390, 320):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        expect(page.get_by_role('contentinfo').get_by_role('link', name=re.compile('更新日志'))).to_be_visible()
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots / f'changelog-{width}.png'), full_page=True)
    sitemap = page.request.get(base + '/sitemap.xml')
    assert sitemap.ok and '<loc>' + base + '/changelog</loc>' in sitemap.text()
    page.get_by_role('navigation', name='主导航').get_by_role('link', name='MIDI', exact=True).click()
    expect(page).to_have_url(base + '/midis')
    expect(page.get_by_role('main').get_by_role('heading', level=1)).to_be_visible()
    assert not errors, errors
    print('PASS: changelog content, footer navigation, anchors, canonical, sitemap, 1280/390/320 layouts and no page errors')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--frontend', required=True)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='msedge')
        context = browser.new_context()
        page = context.new_page()
        expect.set_options(timeout=30000)
        check_changelog(page, args.frontend.rstrip('/'), args.screenshots)
        context.close()
        browser.close()


if __name__ == '__main__':
    main()
