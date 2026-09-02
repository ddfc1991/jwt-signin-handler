// src/account-router.js
class AccountRouter {
  constructor(options = {}) {
    this.providers = new Map();
    this.maxBackoff = options.maxBackoff || 30 * 60 * 1000; // 30 min
  }

  ensureProvider(p) {
    if (!this.providers.has(p)) this.providers.set(p, { accounts: [], idx: 0 });
    return this.providers.get(p);
  }

  addAccount(provider, account) {
    const p = this.ensureProvider(provider);
    const acc = Object.assign({ id: account.id || (Math.random().toString(36).slice(2)), weight: account.weight || 1, lastUsed: 0, failCount: 0, backoffUntil: 0, meta: account.meta || {} }, account);
    p.accounts.push(acc);
    return acc.id;
  }

  removeAccount(provider, accountId) {
    const p = this.providers.get(provider);
    if (!p) return false;
    const i = p.accounts.findIndex(a => a.id === accountId);
    if (i >= 0) { p.accounts.splice(i,1); return true; }
    return false;
  }

  getAccounts(provider) {
    const p = this.providers.get(provider);
    return p ? p.accounts.slice() : [];
  }

  getNextAccount(provider) {
    const p = this.providers.get(provider);
    if (!p || !p.accounts.length) return null;
    const now = Date.now();
    const available = p.accounts.filter(a => (a.backoffUntil || 0) <= now);
    if (!available.length) return null;
    // Weighted random selection
    const total = available.reduce((s,a)=>s+a.weight,0);
    let r = Math.random() * total;
    for (const a of available) {
      if (r < a.weight) { a.lastUsed = now; return a; }
      r -= a.weight;
    }
    // fallback
    const pick = available[0]; pick.lastUsed = now; return pick;
  }

  reportResult(provider, accountId, success) {
    const p = this.providers.get(provider); if (!p) return;
    const a = p.accounts.find(x=>x.id===accountId); if (!a) return;
    if (success) { a.failCount = 0; a.backoffUntil = 0; }
    else {
      a.failCount = (a.failCount||0) + 1;
      const backoff = Math.min((Math.pow(2, a.failCount-1) * 60 * 1000), this.maxBackoff);
      a.backoffUntil = Date.now() + backoff;
    }
  }

  // persistence helpers (uses provided storage adapter that implements getItem/setItem)
  async persist(provider, storage) {
    const p = this.providers.get(provider); if (!p) return;
    if (!storage || !storage.setItem) return;
    await storage.setItem(`router_${provider}`, JSON.stringify(p.accounts));
  }

  async restore(provider, storage) {
    if (!storage || !storage.getItem) return;
    const raw = await storage.getItem(`router_${provider}`);
    if (!raw) return;
    try {
      const accounts = JSON.parse(raw);
      const p = this.ensureProvider(provider);
      p.accounts = accounts;
    } catch(e){}
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = AccountRouter;
export default AccountRouter;
