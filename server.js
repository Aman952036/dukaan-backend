const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(cors({ origin: true, allowedHeaders: ["Content-Type", "X-Firm", "X-Key"], methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (_) {
    return { firms: {}, orders: [] };
  }
}
let db = loadDb();

function saveDb() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function token(bytes = 8) {
  return crypto.randomBytes(bytes).toString("hex");
}
function cleanText(v, max = 120) {
  return String(v == null ? "" : v).trim().slice(0, max);
}
function auth(req, res, next) {
  const firmId = cleanText(req.header("X-Firm"), 80);
  const key = cleanText(req.header("X-Key"), 100);
  const firm = db.firms[firmId];
  if (!firm || !key || firm.key !== key) {
    return res.status(401).json({ error: "Pairing code galat hai" });
  }
  req.firmId = firmId;
  req.firm = firm;
  next();
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Dukaan Saathi online server", message: "Server chal raha hai" });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// Distributor app creates its firm account here and receives DS1.<firm>.<key>.
app.post("/api/firm", (req, res) => {
  const name = cleanText(req.body && req.body.name, 100);
  const phone = cleanText(req.body && req.body.phone, 30);
  if (!name) return res.status(400).json({ error: "Company name zaroori hai" });

  const id = token(5);
  const key = token(12);
  db.firms[id] = { id, name, phone, key, createdAt: new Date().toISOString() };
  saveDb();
  res.status(201).json({ ok: true, code: `DS1.${id}.${key}`, firm: { id, name, phone } });
});

app.get("/api/ping", auth, (req, res) => {
  const count = db.orders.filter(o => o.firmId === req.firmId).length;
  res.json({ ok: true, firm: { name: req.firm.name }, orders: count });
});

// Shop app sends each bill/order to the distributor's firm.
app.post("/api/order", auth, (req, res) => {
  const body = req.body || {};
  const ref = cleanText(body.ref, 160);
  const shopName = cleanText(body.shopName, 120);
  const shopPhone = cleanText(body.shopPhone, 30);
  const shopAddress = cleanText(body.shopAddress, 250);
  const note = cleanText(body.note, 500);
  const itemsIn = Array.isArray(body.items) ? body.items : [];

  if (!ref) return res.status(400).json({ error: "Order reference missing hai" });
  if (!shopName) return res.status(400).json({ error: "Dukaan ka naam missing hai" });
  if (!itemsIn.length || itemsIn.length > 300) return res.status(400).json({ error: "Order items sahi nahi hain" });

  const duplicate = db.orders.find(o => o.firmId === req.firmId && o.ref === ref);
  if (duplicate) {
    return res.json({ ok: true, duplicate: true, id: duplicate.id, no: duplicate.no, total: duplicate.total });
  }

  const items = [];
  let total = 0;
  for (const it of itemsIn) {
    const name = cleanText(it && it.n, 150);
    const qty = Number(it && it.q);
    const rate = Number(it && it.r);
    const unit = cleanText(it && it.u, 30) || "pcs";
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) {
      return res.status(400).json({ error: "Kisi item ka naam, qty ya rate galat hai" });
    }
    total += qty * rate;
    items.push({ name, qty, rate, unit });
  }

  const firmOrders = db.orders.filter(o => o.firmId === req.firmId);
  const no = firmOrders.reduce((m, o) => Math.max(m, Number(o.no) || 0), 0) + 1;
  const order = {
    id: token(12), firmId: req.firmId, no, ref,
    shopName, shopPhone, shopAddress, items, note,
    total: Math.round(total * 100) / 100,
    status: "naya", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  db.orders.push(order);
  saveDb();
  res.status(201).json({ ok: true, duplicate: false, id: order.id, no: order.no, total: order.total });
});

// Distributor app retrieves orders. "since" is an ISO timestamp.
app.get("/api/orders", auth, (req, res) => {
  const since = cleanText(req.query.since, 80);
  const sinceMs = since ? Date.parse(since) : NaN;
  const orders = db.orders
    .filter(o => o.firmId === req.firmId && (!Number.isFinite(sinceMs) || Date.parse(o.createdAt) > sinceMs))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map(o => ({ ...o }));
  res.json({ ok: true, orders, now: new Date().toISOString() });
});

// Shop app checks status of its own orders by phone number.
app.get("/api/shop", auth, (req, res) => {
  const shop = cleanText(req.query.shop, 30).replace(/\D/g, "");
  const orders = db.orders
    .filter(o => o.firmId === req.firmId && shop && String(o.shopPhone || "").replace(/\D/g, "") === shop)
    .map(o => ({ id: o.id, no: o.no, total: o.total, createdAt: o.createdAt, status: o.status }));
  res.json({ ok: true, orders });
});

// Distributor updates order status; shop app will see it on its next status check.
app.post("/api/status", auth, (req, res) => {
  const id = cleanText(req.body && req.body.id, 100);
  const status = cleanText(req.body && req.body.status, 30);
  const allowed = ["naya", "packed", "dispatched", "delivered"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status galat hai" });
  const order = db.orders.find(o => o.firmId === req.firmId && o.id === id);
  if (!order) return res.status(404).json({ error: "Order nahi mila" });
  order.status = status;
  order.updatedAt = new Date().toISOString();
  saveDb();
  res.json({ ok: true, id: order.id, status: order.status });
});

// Avoid silently serving an HTML 404 page for misspelled API endpoints.
app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint nahi mila" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dukaan Saathi server listening on ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
