// 仅对 tests/preview.py 的临时数据库运行；会创建专用测试会员和订单。
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (process.env.QA_ISOLATED !== '1') throw Error('必须显式指定隔离测试库 QA_ISOLATED=1');
const origin = process.env.QA_ORIGIN;
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://trae-api-cn.mchost.guru/**', r => r.abort());
    const request = async (path, token, data, status = 200) => {
      const response = await context.request.fetch(origin + '/api' + path, { method: data === undefined ? 'GET' : 'POST', data, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const body = await response.json(); assert.equal(response.status(), status, JSON.stringify(body)); return body;
    };
    const member = await request('/auth/register', '', { phone: '139' + String(Date.now()).slice(-8), password: 'edge-check-123', nickname: '边界自检专用' });
    const merchant = await request('/auth/login', '', { phone: '13800000000', password: 'admin123' });
    const goods = (await request('/products')).products;
    const product = goods.find(p => p.priceCents >= 2000 && p.priceCents < 5000 && p.stock > 12);
    assert(product, '需要库存充足且价格适合的隔离种子商品');
    await page.goto(origin + '/m/customer/');
    await page.evaluate(token => localStorage.setItem('fm_customer_token', token), member.token);
    await page.reload();
    await page.goto(origin + '/m/customer/#/product/' + product.id);
    await page.locator('#ct-payment').waitFor();
    assert((await page.locator('#ct-payment').textContent()).includes('¥0.00'));
    await page.locator('#ct-payment').selectOption('balance');
    await request('/merchant/members/' + member.user.id + '/balance', merchant.token, { changeCents: 30000, reason: '隔离边界测试充值' });
    // 页面未刷新，缓存余额仍为零，服务器已充值。
    await page.getByRole('button', { name: '提交预约', exact: true }).click();
    await page.getByText('预约已送达，等待门店确认', { exact: true }).waitFor();
    const orderId = page.url().match(/orders\/(\d+)/)[1];
    assert.equal((await request('/auth/me', member.token)).user.balanceCents, 30000 - product.priceCents);
    await request('/orders/' + orderId + '/cancel', member.token, {});
    assert.equal((await request('/auth/me', member.token)).user.balanceCents, 30000);
    await request('/orders/' + orderId + '/cancel', member.token, {}, 400);
    assert.equal((await request('/auth/me', member.token)).user.balanceCents, 30000);
    console.log('PASS: stale balance after merchant top-up, refund and repeated-cancel protection');
    await page.goto(origin + '/m/customer/#/points');
    await page.locator('.ct-prize').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('.ct-skeleton'));
    const prize = (await request('/prizes')).prizes[0];
    const quantity = Math.ceil(prize.costPoints * 100 / product.priceCents) + 1;
    const earned = await request('/orders', member.token, { productId: product.id, quantity, payMethod: 'onsite', pickupTime: '', note: '隔离积分测试' });
    await request('/merchant/orders/' + earned.order.id + '/status', merchant.token, { status: 'completed' });
    // 页面未刷新，缓存积分仍为零，服务器已发放积分。
    await page.locator('.ct-prize').first().getByRole('button', { name: '兑换', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.getByText('我的兑换记录', { exact: true }).waitFor();
    assert.equal((await request('/auth/me', member.token)).user.points, Math.floor(product.priceCents * quantity / 100) - prize.costPoints);
    console.log('PASS: stale points after merchant completion, redemption and balance refresh');
    const pointsAfter = (await request('/auth/me', member.token)).user.points;
    await request('/redemptions', member.token, { prizeId: prize.id }, 400);
    assert.equal((await request('/auth/me', member.token)).user.points, pointsAfter);
    await request('/merchant/members/' + member.user.id + '/balance', merchant.token, { changeCents: -30000, reason: '隔离余额不足测试' });
    const stockBeforeFailure = (await request('/products/' + product.id)).product.stock;
    await request('/orders', member.token, { productId: product.id, quantity: 1, payMethod: 'balance' }, 400);
    assert.equal((await request('/products/' + product.id)).product.stock, stockBeforeFailure);
    assert.equal((await request('/auth/me', member.token)).user.balanceCents, 0);
    console.log('PASS: real insufficient balance/points rejected with no extra deductions');
    await request('/orders/' + orderId, '', undefined, 401);
    await request('/orders/' + orderId, merchant.token); // 商户有权查看
    await request('/merchant/stats', member.token, undefined, 403);
    for (const invalid of [0, -1, 100]) await request('/orders', member.token, { productId: product.id, quantity: invalid }, 400);
    // 检查后端真正的整数校验；已知问题只报告，不修改后端。
    const fractionalResponse = await context.request.post(origin + '/api/orders', {
      data: { productId: product.id, quantity: 1.5, payMethod: 'onsite' },
      headers: { Authorization: 'Bearer ' + member.token },
    });
    const fractional = await fractionalResponse.json();
    if (fractionalResponse.status() === 400) console.log('PASS: backend rejects fractional quantity');
    else {
      assert.equal(fractionalResponse.status(), 200);
      assert.equal(fractional.order.quantity, 1);
      await request('/orders/' + fractional.order.id + '/cancel', member.token, {});
      console.log('BACKEND FINDING: quantity=1.5 accepted and truncated to 1 (shop/auth.py to_int)');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: guest authentication, member/merchant boundary, invalid-quantity bounds, no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
