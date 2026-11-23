'use strict';
const fs = require('fs');
const path = require('path');

/**
 * 轻量 JSON 数据集合：内存索引 + 原子落盘（写临时文件后 rename）。
 * 零原生依赖，开箱即用；数据量上万级建议迁移到 SQLite/MySQL。
 */
class Collection {
  constructor(name, dataDir) {
    this.name = name;
    this.file = path.join(dataDir, name + '.json');
    this.items = this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.file)) return [];
      const raw = fs.readFileSync(this.file, 'utf8').trim();
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`[store] 加载 ${this.name} 失败:`, e.message);
      return [];
    }
  }

  _persist() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  _nextId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  all() {
    return this.items.slice();
  }

  findById(id) {
    return this.items.find(x => x.id === id) || null;
  }

  findOne(cond = {}) {
    return this.items.find(x => match(x, cond)) || null;
  }

  find(cond = {}) {
    return this.items.filter(x => match(x, cond));
  }

  count(cond) {
    return cond ? this.find(cond).length : this.items.length;
  }

  insert(doc) {
    const row = Object.assign({ id: this._nextId(), created_at: Date.now() }, doc);
    this.items.push(row);
    this._persist();
    return row;
  }

  insertMany(docs) {
    const rows = docs.map(doc => Object.assign({ id: this._nextId(), created_at: Date.now() }, doc));
    this.items.push(...rows);
    this._persist();
    return rows;
  }

  updateById(id, patch) {
    const idx = this.items.findIndex(x => x.id === id);
    if (idx < 0) return null;
    this.items[idx] = Object.assign({}, this.items[idx], patch, { updated_at: Date.now() });
    this._persist();
    return this.items[idx];
  }

  deleteById(id) {
    const idx = this.items.findIndex(x => x.id === id);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    this._persist();
    return true;
  }

  deleteMany(cond) {
    const before = this.items.length;
    this.items = this.items.filter(x => !match(x, cond));
    if (this.items.length !== before) this._persist();
    return before - this.items.length;
  }
}

function match(doc, cond) {
  return Object.keys(cond).every(k => doc[k] === cond[k]);
}

class Store {
  constructor(dataDir) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.admins = new Collection('admins', dataDir);
    this.apps = new Collection('apps', dataDir);
    this.cards = new Collection('cards', dataDir);
    this.devices = new Collection('devices', dataDir);
    this.announcements = new Collection('announcements', dataDir);
    this.logs = new Collection('logs', dataDir);
    // 会员系统
    this.members = new Collection('members', dataDir);
    this.plans = new Collection('plans', dataDir);
    this.orders = new Collection('orders', dataDir);
  }
}

module.exports = Store;
