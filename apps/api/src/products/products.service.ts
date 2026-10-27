import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes, InventoryTransactionItem, ProductCategory, ProductItem } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Product not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const conflict = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

@Injectable()
export class ProductsService {
  constructor(private db: Db, private audit: AuditService) {}

  // ==================== CATEGORIES ====================

  listCategories(ctx: AuthContext): Promise<ProductCategory[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const rows = (await c.query(
        `SELECT id, name, display_order, is_active FROM product_categories WHERE shop_id = $1 ORDER BY display_order ASC, name ASC`,
        [ctx.shopId]
      )).rows;
      return rows.map((r) => ({ id: r.id, name: r.name, displayOrder: r.display_order, isActive: r.is_active }));
    });
  }

  createCategory(ctx: AuthContext, dto: { name: string; displayOrder?: number }): Promise<ProductCategory> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      try {
        const res = await c.query(
          `INSERT INTO product_categories (shop_id, name, display_order) VALUES ($1, $2, COALESCE($3, 0)) RETURNING *`,
          [ctx.shopId, dto.name, dto.displayOrder]
        );
        return { id: res.rows[0].id, name: res.rows[0].name, displayOrder: res.rows[0].display_order, isActive: res.rows[0].is_active };
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('A product category with this name already exists.');
        throw e;
      }
    });
  }

  // ==================== PRODUCTS ====================

  listProducts(ctx: AuthContext, filter?: { categoryId?: string; activeOnly?: boolean; lowStockOnly?: boolean }): Promise<ProductItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const conditions = ['p.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (filter?.categoryId) {
        params.push(filter.categoryId);
        conditions.push(`p.category_id = $${params.length}`);
      }
      if (filter?.activeOnly) {
        conditions.push(`p.status = 'active'`);
      }
      if (filter?.lowStockOnly) {
        conditions.push(`p.stock_quantity <= p.low_stock_threshold`);
      }

      const rows = (await c.query(
        `SELECT p.id, p.category_id, pc.name AS category_name, p.name, p.sku,
                p.selling_price_paise, p.cost_price_paise, p.stock_quantity,
                p.low_stock_threshold, p.supplier_name, p.status, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.name ASC`,
        params
      )).rows;

      return rows.map((r) => this.mapProductRow(r));
    });
  }

  private async loadProduct(c: PoolClient, shopId: string, id: string): Promise<ProductItem> {
    const row = (await c.query(
      `SELECT p.id, p.category_id, pc.name AS category_name, p.name, p.sku,
              p.selling_price_paise, p.cost_price_paise, p.stock_quantity,
              p.low_stock_threshold, p.supplier_name, p.status, p.created_at, p.updated_at
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = $1 AND p.shop_id = $2`,
      [id, shopId]
    )).rows[0];

    if (!row) throw notFound();
    return this.mapProductRow(row);
  }

  getProduct(ctx: AuthContext, id: string): Promise<ProductItem> {
    return this.db.tenant({ shopId: ctx.shopId }, (c) => this.loadProduct(c, ctx.shopId!, id));
  }

  createProduct(
    ctx: AuthContext,
    dto: {
      categoryId?: string | null;
      name: string;
      sku: string;
      sellingPricePaise: number;
      costPricePaise?: number;
      stockQuantity?: number;
      lowStockThreshold?: number;
      supplierName?: string | null;
    }
  ): Promise<ProductItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      try {
        const res = await c.query(
          `INSERT INTO products (
             shop_id, category_id, name, sku, selling_price_paise, cost_price_paise,
             stock_quantity, low_stock_threshold, supplier_name
           )
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, 0), COALESCE($8, 5), $9)
           RETURNING id`,
          [
            ctx.shopId,
            dto.categoryId ?? null,
            dto.name,
            dto.sku.toUpperCase(),
            dto.sellingPricePaise,
            dto.costPricePaise,
            dto.stockQuantity,
            dto.lowStockThreshold,
            dto.supplierName ?? null,
          ]
        );
        const productId = res.rows[0].id;

        // If opening stock > 0, record initial transaction
        const initialQty = dto.stockQuantity ?? 0;
        if (initialQty > 0) {
          await c.query(
            `INSERT INTO inventory_transactions (shop_id, product_id, type, quantity_delta, balance_after, unit_cost_paise, notes, created_by)
             VALUES ($1, $2, 'adjustment', $3, $3, $4, 'Opening stock', $5)`,
            [ctx.shopId, productId, initialQty, dto.costPricePaise ?? 0, ctx.userId]
          );
        }

        await this.audit.log(c, {
          shopId: ctx.shopId,
          userId: ctx.userId,
          action: 'product.create',
          entity: 'product',
          entityId: productId,
          newValues: { name: dto.name, sku: dto.sku, sellingPricePaise: dto.sellingPricePaise },
          ip: ctx.ip,
        });

        return this.loadProduct(c, ctx.shopId!, productId);
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('A product with this SKU already exists in this shop.');
        throw e;
      }
    });
  }

  updateProduct(
    ctx: AuthContext,
    id: string,
    dto: {
      categoryId?: string | null;
      name?: string;
      sku?: string;
      sellingPricePaise?: number;
      costPricePaise?: number;
      lowStockThreshold?: number;
      supplierName?: string | null;
      status?: 'active' | 'disabled';
    }
  ): Promise<ProductItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound();

      const sets: string[] = [];
      const vals: unknown[] = [id, ctx.shopId];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      if (dto.name !== undefined && dto.name !== old.name) {
        vals.push(dto.name);
        sets.push(`name = $${vals.length}`);
        before.name = old.name;
        after.name = dto.name;
      }
      if (dto.sku !== undefined && dto.sku.toUpperCase() !== old.sku) {
        vals.push(dto.sku.toUpperCase());
        sets.push(`sku = $${vals.length}`);
        before.sku = old.sku;
        after.sku = dto.sku.toUpperCase();
      }
      if (dto.sellingPricePaise !== undefined && dto.sellingPricePaise !== old.selling_price_paise) {
        vals.push(dto.sellingPricePaise);
        sets.push(`selling_price_paise = $${vals.length}`);
        before.sellingPricePaise = old.selling_price_paise;
        after.sellingPricePaise = dto.sellingPricePaise;
      }
      if (dto.costPricePaise !== undefined && dto.costPricePaise !== old.cost_price_paise) {
        vals.push(dto.costPricePaise);
        sets.push(`cost_price_paise = $${vals.length}`);
        before.costPricePaise = old.cost_price_paise;
        after.costPricePaise = dto.costPricePaise;
      }
      if (dto.lowStockThreshold !== undefined && dto.lowStockThreshold !== old.low_stock_threshold) {
        vals.push(dto.lowStockThreshold);
        sets.push(`low_stock_threshold = $${vals.length}`);
        before.lowStockThreshold = old.low_stock_threshold;
        after.lowStockThreshold = dto.lowStockThreshold;
      }
      if (dto.status !== undefined && dto.status !== old.status) {
        vals.push(dto.status);
        sets.push(`status = $${vals.length}`);
        before.status = old.status;
        after.status = dto.status;
      }

      if (sets.length) {
        sets.push('updated_at = now()');
        try {
          await c.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND shop_id = $2`, vals);
          await this.audit.log(c, {
            shopId: ctx.shopId,
            userId: ctx.userId,
            action: 'product.update',
            entity: 'product',
            entityId: id,
            oldValues: before,
            newValues: after,
            ip: ctx.ip,
          });
        } catch (e) {
          if (isUniqueViolation(e)) throw conflict('A product with this SKU already exists.');
          throw e;
        }
      }

      return this.loadProduct(c, ctx.shopId!, id);
    });
  }

  // ==================== INVENTORY MOVEMENTS ====================

  async stockIn(
    ctx: AuthContext,
    dto: {
      productId: string;
      quantity: number;
      unitCostPaise?: number;
      supplierName?: string | null;
      notes?: string | null;
      recordExpense?: boolean;
      expenseCategoryId?: string;
    }
  ): Promise<ProductItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const prod = (await c.query(
        `SELECT id, name, stock_quantity, cost_price_paise FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
        [dto.productId, ctx.shopId]
      )).rows[0];
      if (!prod) throw notFound();

      const newBalance = Number(prod.stock_quantity) + dto.quantity;
      const unitCost = dto.unitCostPaise ?? Number(prod.cost_price_paise);

      await c.query(
        `UPDATE products SET stock_quantity = $1, cost_price_paise = $2, updated_at = now() WHERE id = $3 AND shop_id = $4`,
        [newBalance, unitCost, dto.productId, ctx.shopId]
      );

      const txRes = await c.query(
        `INSERT INTO inventory_transactions (shop_id, product_id, type, quantity_delta, balance_after, unit_cost_paise, notes, created_by)
         VALUES ($1, $2, 'purchase', $3, $4, $5, $6, $7)
         RETURNING id`,
        [ctx.shopId, dto.productId, dto.quantity, newBalance, unitCost, dto.notes ?? 'Stock In / Purchase', ctx.userId]
      );
      const txId = txRes.rows[0].id;

      // Rule 51: Optionally record linked expense
      if (dto.recordExpense && unitCost > 0) {
        let catId = dto.expenseCategoryId;
        if (!catId) {
          const defaultCat = (await c.query(
            `SELECT id FROM expense_categories WHERE shop_id = $1 AND name = 'Product purchase'`,
            [ctx.shopId]
          )).rows[0];
          if (defaultCat) catId = defaultCat.id;
          else {
            const newCat = (await c.query(
              `INSERT INTO expense_categories (shop_id, name) VALUES ($1, 'Product purchase') RETURNING id`,
              [ctx.shopId]
            )).rows[0];
            catId = newCat.id;
          }
        }
        const totalExpense = unitCost * dto.quantity;
        await c.query(
          `INSERT INTO expenses (shop_id, category_id, amount_paise, date, description, payment_method, inventory_transaction_id, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, 'cash', $5, $6)`,
          [ctx.shopId, catId, totalExpense, `Purchase ${dto.quantity}x ${prod.name}`, txId, ctx.userId]
        );
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'inventory.stock_in',
        entity: 'product',
        entityId: dto.productId,
        oldValues: { stockQuantity: prod.stock_quantity },
        newValues: { delta: dto.quantity, newBalance, unitCost },
        ip: ctx.ip,
      });

      return this.loadProduct(c, ctx.shopId!, dto.productId);
    });
  }

  async adjustStock(
    ctx: AuthContext,
    dto: { productId: string; type: 'damage' | 'wastage' | 'adjustment'; quantityDelta: number; notes: string }
  ): Promise<ProductItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const prod = (await c.query(
        `SELECT id, name, stock_quantity, cost_price_paise FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
        [dto.productId, ctx.shopId]
      )).rows[0];
      if (!prod) throw notFound();

      const newBalance = Number(prod.stock_quantity) + dto.quantityDelta;
      if (newBalance < 0) {
        throw badRequest(`Cannot reduce stock below 0. Current stock is ${prod.stock_quantity}.`);
      }

      await c.query(`UPDATE products SET stock_quantity = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`, [
        newBalance,
        dto.productId,
        ctx.shopId,
      ]);

      await c.query(
        `INSERT INTO inventory_transactions (shop_id, product_id, type, quantity_delta, balance_after, unit_cost_paise, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ctx.shopId, dto.productId, dto.type, dto.quantityDelta, newBalance, prod.cost_price_paise, dto.notes, ctx.userId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: `inventory.${dto.type}`,
        entity: 'product',
        entityId: dto.productId,
        oldValues: { stockQuantity: prod.stock_quantity },
        newValues: { delta: dto.quantityDelta, newBalance, notes: dto.notes },
        ip: ctx.ip,
      });

      return this.loadProduct(c, ctx.shopId!, dto.productId);
    });
  }

  async getTransactions(ctx: AuthContext, productId: string): Promise<InventoryTransactionItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const rows = (await c.query(
        `SELECT it.id, it.product_id, p.name AS product_name, it.type, it.quantity_delta,
                it.balance_after, it.unit_cost_paise, it.reference_id, it.notes, it.created_at
         FROM inventory_transactions it
         JOIN products p ON p.id = it.product_id
         WHERE it.shop_id = $1 AND it.product_id = $2
         ORDER BY it.created_at DESC`,
        [ctx.shopId, productId]
      )).rows;

      return rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        type: r.type,
        quantityDelta: r.quantity_delta,
        balanceAfter: r.balance_after,
        unitCostPaise: r.unit_cost_paise,
        referenceId: r.reference_id,
        notes: r.notes,
        createdAt: r.created_at.toISOString(),
      }));
    });
  }

  // ==================== PUBLIC VIEW ====================

  publicList(slug: string): Promise<{ products: ProductItem[] }> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query(`SELECT id FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found.');

      const rows = (await c.query(
        `SELECT p.id, p.category_id, pc.name AS category_name, p.name, p.sku,
                p.selling_price_paise, p.cost_price_paise, p.stock_quantity,
                p.low_stock_threshold, p.supplier_name, p.status, p.created_at, p.updated_at
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id
         WHERE p.shop_id = $1 AND p.status = 'active'
         ORDER BY p.name ASC`,
        [shop.id]
      )).rows;

      return { products: rows.map((r) => this.mapProductRow(r)) };
    });
  }

  private mapProductRow(r: any): ProductItem {
    const qty = Number(r.stock_quantity);
    const threshold = Number(r.low_stock_threshold);
    return {
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.category_name ?? null,
      name: r.name,
      sku: r.sku,
      sellingPricePaise: Number(r.selling_price_paise),
      costPricePaise: Number(r.cost_price_paise),
      stockQuantity: qty,
      lowStockThreshold: threshold,
      isLowStock: qty <= threshold,
      supplierName: r.supplier_name,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
