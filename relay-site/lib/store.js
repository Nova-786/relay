const { cmd } = require("./kv");
exports.jget = async (k, d) => { const r = await cmd("GET", k); return r ? JSON.parse(r) : d; };
exports.jset = (k, v) => cmd("SET", k, JSON.stringify(v));
