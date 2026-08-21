/**
 * محاكي D1 فوق `node:sqlite`.
 *
 * الغرض: تشغيل المحرك كاملًا محليًا بقاعدة حقيقية قبل النشر. كل عطل واجهناه
 * في هذه المنصة تقريبًا كان في المسافة بين طرفين سليمين — بين اللوحة والمحرك،
 * أو بين استعلام ومخطط. اختبار يستدعي `fetch` الحقيقي على قاعدة حقيقية يمسك
 * تلك المسافة، والاختبار الذي يستبدل القاعدة بكائن وهمي لا يمسك منها شيئًا.
 *
 * ما يحاكيه: `prepare/bind/first/all/run/batch`. `batch` معاملة واحدة كما في
 * D1: فشل عبارة يُلغي الدفعة كلها.
 */

import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }

  #prepared() {
    return this.db.prepare(this.sql);
  }

  async first(column) {
    const row = this.#prepared().get(...this.args);
    if (row === undefined) return null;
    return column === undefined ? row : row[column];
  }

  async all() {
    return { results: this.#prepared().all(...this.args), success: true, meta: {} };
  }

  async run() {
    const result = this.#prepared().run(...this.args);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

export class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const statement of statements) {
        const prepared = statement.db.prepare(statement.sql);
        const sql = statement.sql.trim().slice(0, 6).toUpperCase();
        if (sql === 'SELECT' || statement.sql.trim().toUpperCase().startsWith('PRAGMA')) {
          out.push({ results: prepared.all(...statement.args), success: true, meta: {} });
        } else {
          const result = prepared.run(...statement.args);
          out.push({
            results: [],
            success: true,
            meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
          });
        }
      }
      this.db.exec('COMMIT');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** دلو R2 في الذاكرة: يكفي لاختبار الرفع والحذف ومنع تجاوز المستأجر. */
export class FakeBucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    this.objects.set(key, { value, ...options, size: value.byteLength ?? value.length ?? 0 });
  }

  async get(key) {
    const found = this.objects.get(key);
    if (!found) return null;
    return {
      body: found.value,
      size: found.size,
      httpEtag: `"${key}"`,
      httpMetadata: found.httpMetadata,
      arrayBuffer: async () => found.value,
    };
  }

  async delete(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) this.objects.delete(key);
  }

  async list({ prefix = '', cursor } = {}) {
    void cursor;
    const objects = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects, truncated: false, cursor: undefined };
  }
}
