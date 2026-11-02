/* 浏览器联调：对运行中的隔离测试后端执行；会创建并取消预约、兑换测试奖品。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (process.env.QA_ISOLATED !== '1') throw new Error('仅允许在隔离测试库运行：设置 QA_ISOLATED=1 和 QA_ORIGIN');
const origin = process.env.QA_ORIGIN;
const output = process.env.QA_OUTPUT || require('node:os').tmpdir();
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // 原种子数据使用外部生成图片服务；离线失败不应影响购买流程。
  await page.route('https://trae-api-cn.mchost.guru/**', route => route.abort());
  const capture = async filename => {
    await page.waitForFunction(() => !document.querySelector('.fm-toast,.ct-page-enter-active,.ct-page-leave-active'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
  };
  const checkLayout = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
  const goto = async hash => { await page.goto(origin + '/m/customer/#' + hash); };
  const api = async (endpoint, body, token) => {
    const response = await context.request.fetch(origin + '/api' + endpoint, { method: body ? 'POST' : 'GET', data: body, headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const data = await response.json(); assert.equal(response.ok(), true, JSON.stringify(data)); return data;
  };
  try {
    await goto('/'); await page.locator('.ct-goods').first().waitFor();
    for (const width of [320, 390, 480, 1024]) { await page.setViewportSize({ width, height: 844 }); await checkLayout(); }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.ct-hero-cta').isVisible());
    await capture('customer-home-light.png');
    await page.locator('.ct-notice-toggle').click(); assert(await page.locator('.ct-notice-content').isVisible());
    await page.locator('#ct-search').fill('脐橙'); await page.locator('.ct-search button').click();
    await page.waitForFunction(() => document.querySelectorAll('.ct-goods').length === 1);
    await page.locator('.ct-goods').click(); await page.locator('#ct-quantity').waitFor();
    await page.getByRole('button', { name: '提交预约', exact: true }).click();
    await page.locator('#ct-phone').waitFor();
    await page.locator('#ct-phone').fill('13900000001'); await page.locator('#ct-password').fill('123456');
    await page.getByRole('button', { name: '登录，开启鲜果时刻' }).click();
    await page.locator('#ct-payment').waitFor(); assert(page.url().includes('/product/'));
    const token = await page.evaluate(() => localStorage.getItem('fm_customer_token'));
    const before = await api('/auth/me', null, token);
    const productId = page.url().match(/product\/(\d+)/)[1];
    const product = (await api('/products/' + productId)).product;
    await page.locator('#ct-quantity').fill('2'); await page.locator('#ct-payment').selectOption('balance');
    await page.locator('#ct-note').fill('测试预约，请勿实际备货');
    await checkLayout(); await capture('customer-product-light.png');
    await page.getByRole('button', { name: '提交预约', exact: true }).click();
    await page.getByText('预约已送达，等待门店确认', { exact: true }).waitFor();
    const orderId = page.url().match(/orders\/(\d+)/)[1];
    const after = await api('/auth/me', null, token);
    assert.equal(after.user.balanceCents, before.user.balanceCents - product.priceCents * 2);
    assert.equal((await api('/products/' + productId)).product.stock, product.stock - 2);
    await page.getByRole('button', { name: '取消预约', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'dialog');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.getByText('预约已取消，期待下次再见', { exact: true }).waitFor();
    assert.equal((await api('/auth/me', null, token)).user.balanceCents, before.user.balanceCents);
    assert.equal((await api('/products/' + productId)).product.stock, product.stock);
    // 真实商户接口仅用在测试库，验证确认提醒、完成加积分。
    const merchant = await api('/auth/login', { phone: '13800000000', password: 'admin123' });
    const created = await api('/orders', { productId: Number(productId), quantity: 5, payMethod: 'onsite', pickupTime: '', note: 'QA completion' }, token);
    await api('/merchant/orders/' + created.order.id + '/status', { status: 'confirmed' }, merchant.token);
    await goto('/orders'); await page.locator('.ct-order-card').first().waitFor();
    await page.locator('.ct-tab-badge').waitFor();
    await capture('customer-orders-light.png');
    await page.locator('.ct-order-card').filter({ hasText: created.order.orderNo }).getByRole('button', { name: '查看详情' }).click();
    await page.getByText('门店已确认，请按预约时间到店取货', { exact: true }).waitFor();
    await api('/merchant/orders/' + created.order.id + '/status', { status: 'completed' }, merchant.token);
    await page.getByRole('button', { name: '刷新预约详情' }).click();
    await page.getByText('感谢光顾，期待下一次鲜果相见', { exact: true }).waitFor();
    const completed = (await api('/auth/me', null, token)).user;
    assert(completed.points > before.user.points);
    await goto('/points'); await page.locator('.ct-prize').first().waitFor();
    await page.locator('.ct-prize').first().getByRole('button', { name: '兑换', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.getByText('我的兑换记录', { exact: true }).waitFor();
    await goto('/points/logs'); await page.getByText('兑换奖品', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: '支出', exact: true }).click(); assert(await page.locator('.fm-row').count() > 0);
    await capture('customer-ledger-light.png');
    await goto('/me'); await page.locator('#ct-nickname').waitFor();
    await page.locator('#ct-nickname').fill('鲜果体验员'); await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('heading', { name: '鲜果体验员' }).waitFor();
    await capture('customer-me-light.png');
    await page.emulateMedia({ colorScheme: 'dark' }); await goto('/'); await page.locator('.ct-goods').first().waitFor();
    await checkLayout(); await capture('customer-home-dark.png');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.ct-goods').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    assert.deepEqual(errors, []);
    console.log('PASS: browse/search, 320/390/480/1024 layouts, guest return, balance checkout/refund/stock, merchant confirmation, completion points, redemption, ledger, profile, dark mode, reduced motion; no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
