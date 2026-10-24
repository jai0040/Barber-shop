import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let haircutId: string;
let beardOilId: string;
let invoiceId: string;

  before(async () => {
    h = await boot(25437);

    const onboard = async (slug: string, name: string, email: string) => {
      const s = (await h.ownerPool.query(
        `INSERT INTO shops (name, slug, timezone, status) VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
        [name, slug]
      )).rows[0];

      const r = (await h.ownerPool.query(
        `INSERT INTO roles (shop_id, name, is_system, system_key)
         VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
        [s.id]
      )).rows;
      const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

      const u = (await h.ownerPool.query(
        `INSERT INTO users (type, name, email, password_hash, shop_id)
         VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
        [name + ' Owner', email, s.id]
      )).rows[0];

      await h.ownerPool.query(
        `INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`,
        [u.id, s.id, ownerRoleId]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('classic-barber', 'Classic Barber', 'owner.a@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('royal-barber', 'Royal Barber', 'owner.b@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create Haircut service in Shop A
    const s1 = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Haircut', pricePaise: 30000, durationMinutes: 30 },
    });
    haircutId = s1.body.data.id;
  });

  after(async () => {
    await h.close();
  });

  describe('Product & Inventory Management (Rules 22, 24, 25, 50, 51)', () => {
    it('creates product with SKU, prices and opening stock', async () => {
      // Beard Oil: Selling ₹450 (45000 paise), Cost ₹280 (28000 paise), Stock: 20, Low Stock Threshold: 5
      const res = await h.call('POST', '/products', {
        token: ownerTokenA,
        body: {
          name: 'Beard Oil',
          sku: 'BO-001',
          sellingPricePaise: 45000,
          costPricePaise: 28000,
          stockQuantity: 20,
          lowStockThreshold: 5,
          supplierName: 'Grooming Co.',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, 'Beard Oil');
      assert.equal(res.body.data.stockQuantity, 20);
      assert.equal(res.body.data.isLowStock, false);
      beardOilId = res.body.data.id;

      // Verify opening transaction exists
      const txs = await h.call('GET', `/inventory/transactions/${beardOilId}`, { token: ownerTokenA });
      assert.equal(txs.status, 200);
      assert.equal(txs.body.data.length, 1);
      assert.equal(txs.body.data[0].type, 'adjustment');
      assert.equal(txs.body.data[0].quantityDelta, 20);
    });

    it('purchases stock in (+10) and auto-creates linked expense', async () => {
      const stockInRes = await h.call('POST', '/inventory/stock-in', {
        token: ownerTokenA,
        body: {
          productId: beardOilId,
          quantity: 10,
          unitCostPaise: 28000,
          recordExpense: true,
          notes: 'Batch #102 purchase',
        },
      });
      assert.equal(stockInRes.status, 201);
      assert.equal(stockInRes.body.data.stockQuantity, 30); // 20 + 10 = 30

      // Check linked expense was recorded: 10 * 28000 = 280000 paise (₹2,800)
      const expenses = await h.call('GET', '/finance/expenses', { token: ownerTokenA });
      assert.equal(expenses.status, 200);
      assert.ok(expenses.body.data.items.length >= 1);
      const exp = expenses.body.data.items.find((e: any) => e.amountPaise === 280000);
      assert.ok(exp, 'Expense of ₹2,800 must be recorded');
      assert.equal(exp.categoryName, 'Product purchase');
    });

    it('adjusts stock for damage (-2)', async () => {
      const adjRes = await h.call('POST', '/inventory/adjust', {
        token: ownerTokenA,
        body: {
          productId: beardOilId,
          type: 'damage',
          quantityDelta: -2,
          notes: '2 bottles broke during unpacking',
        },
      });
      assert.equal(adjRes.status, 201);
      assert.equal(adjRes.body.data.stockQuantity, 28); // 30 - 2 = 28
    });
  });

  describe('Billing & POS-Style Sales (Rules 26, 27, 28, 50)', () => {
    it('creates invoice with services, products, and discount; auto-decrements product stock', async () => {
      // Haircut ₹300 (30000) + Beard Oil ₹450 (45000) = Subtotal ₹750 (75000)
      // Discount ₹50 (5000) => Final Total = ₹700 (70000)
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          discountPaise: 5000,
          items: [
            { type: 'service', itemId: haircutId, itemName: 'Haircut', quantity: 1, unitPricePaise: 30000 },
            { type: 'product', itemId: beardOilId, itemName: 'Beard Oil', quantity: 1, unitPricePaise: 45000 },
          ],
        },
      });

      assert.equal(invRes.status, 201);
      const data = invRes.body.data;
      assert.equal(data.subtotalPaise, 75000);
      assert.equal(data.discountPaise, 5000);
      assert.equal(data.finalTotalPaise, 70000);
      assert.equal(data.paymentStatus, 'pending');
      invoiceId = data.id;

      // Check product inventory: was 28, now 27!
      const prod = await h.call('GET', `/products/${beardOilId}`, { token: ownerTokenA });
      assert.equal(prod.status, 200);
      assert.equal(prod.body.data.stockQuantity, 27, 'Product stock must decrement automatically by 1 upon sale');

      // Check inventory transactions: SALE -1
      const txs = await h.call('GET', `/inventory/transactions/${beardOilId}`, { token: ownerTokenA });
      const saleTx = txs.body.data.find((t: any) => t.type === 'sale');
      assert.ok(saleTx);
      assert.equal(saleTx.quantityDelta, -1);
      assert.equal(saleTx.balanceAfter, 27);
    });

    it('records UPI QR payment and marks invoice as paid', async () => {
      const payRes = await h.call('POST', `/billing/invoices/${invoiceId}/pay`, {
        token: ownerTokenA,
        body: {
          method: 'upi_qr',
          amountPaise: 70000,
          transactionReference: 'UPI/REF/9876543210',
        },
      });

      assert.equal(payRes.status, 201);
      assert.equal(payRes.body.data.paymentStatus, 'paid');
      assert.equal(payRes.body.data.payments.length, 1);
      assert.equal(payRes.body.data.payments[0].method, 'upi_qr');
      assert.equal(payRes.body.data.payments[0].amountPaise, 70000);
    });
  });

  describe('Finance & Net Result (Section 29, 30, 31)', () => {
    it('calculates real-time financial summary: revenue, expenses, and net result', async () => {
      // Add an operational expense: Rent ₹5,000 (500000 paise)
      const cats = (await h.call('GET', '/finance/categories', { token: ownerTokenA })).body.data;
      const rentCat = cats.find((c: any) => c.name === 'Rent');

      await h.call('POST', '/finance/expenses', {
        token: ownerTokenA,
        body: {
          categoryId: rentCat.id,
          amountPaise: 500000,
          description: 'Shop monthly rent advance',
          paymentMethod: 'bank_transfer',
        },
      });

      // Total Revenue = ₹700 (70000 paise from paid invoice)
      // Total Expenses = ₹2,800 (product purchase) + ₹5,000 (rent) = ₹7,800 (780000 paise)
      // Net Result = 70000 - 780000 = -710000 paise (-₹7,100)
      const summary = await h.call('GET', '/finance/summary', { token: ownerTokenA });
      assert.equal(summary.status, 200);
      const data = summary.body.data;
      assert.equal(data.totalRevenuePaise, 70000);
      assert.equal(data.serviceRevenuePaise, 30000);
      assert.equal(data.productRevenuePaise, 45000);
      assert.equal(data.totalExpensesPaise, 780000);
      assert.equal(data.netResultPaise, -710000);
    });
  });

  describe('Tenant Data Isolation (Shop A vs Shop B)', () => {
    it('Shop B cannot see or manipulate Shop A products, invoices, or finances', async () => {
      // Product
      const crossProd = await h.call('GET', `/products/${beardOilId}`, { token: ownerTokenB });
      assert.equal(crossProd.status, 404);

      // Invoice
      const crossInv = await h.call('GET', `/billing/invoices/${invoiceId}`, { token: ownerTokenB });
      assert.equal(crossInv.status, 404);

      // Financial summary of Shop B should be 0
      const summaryB = await h.call('GET', '/finance/summary', { token: ownerTokenB });
      assert.equal(summaryB.status, 200);
      assert.equal(summaryB.body.data.totalRevenuePaise, 0);
      assert.equal(summaryB.body.data.totalExpensesPaise, 0);
    });
  });

