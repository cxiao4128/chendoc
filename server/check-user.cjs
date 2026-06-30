const Database = require('better-sqlite3');
const db = new Database('./data/chendoc.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

const user = db.prepare("SELECT id, username, role, status FROM users WHERE username = 'xchen'").get();
console.log('User:', user ? JSON.stringify(user) : '不存在');

db.close();
