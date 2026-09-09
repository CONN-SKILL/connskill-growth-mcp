// Local buyer intent guards. No network, wallet key, authorization or raw input.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = 'connskill-payment-attempt-store/1';
const HEX = /^[a-f0-9]{64}$/, WALLET = /^0x[a-f0-9]{40}$/i, TX = /^0x[a-f0-9]{64}$/i;
const ATTEMPT = /^att_[a-f0-9]{64}$/, PURCHASE = /^pur_[a-f0-9]{64}$/;
const STATES = new Set(['prepared', 'dispatched', 'delivered', 'accepted', 'rejected', 'unknown', 'released']);
const FINAL = new Set(['delivered', 'accepted', 'rejected', 'unknown']);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const owners = new Set();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const stable = value => JSON.stringify(value, (_, v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export class PaymentAttemptStoreError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new PaymentAttemptStoreError(code); };
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hash = value => typeof value === 'string' && HEX.test(value.toLowerCase()) ? value.toLowerCase() : fail('payment_attempt_binding_invalid');

function bind(input) {
  if (!keys(input, ['wallet', 'origin', 'method', 'requestFingerprint']) || !WALLET.test(input.wallet || '')) fail('payment_attempt_binding_invalid');
  let origin;
  try {
    const u = new URL(input.origin);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash
      || (u.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))) fail('payment_attempt_binding_invalid');
    origin = u.origin;
  } catch { fail('payment_attempt_binding_invalid'); }
  const method = String(input.method || '').toUpperCase();
  if (!METHODS.has(method)) fail('payment_attempt_binding_invalid');
  const value = { walletHash: sha('wallet:' + input.wallet.toLowerCase()), originHash: sha('origin:' + origin),
    method, requestFingerprint: hash(input.requestFingerprint) };
  return { value, key: sha(stable(value)) };
}
function validBinding(value) {
  return keys(value, ['walletHash', 'originHash', 'method', 'requestFingerprint'])
    && HEX.test(value.walletHash || '') && HEX.test(value.originHash || '')
    && METHODS.has(value.method) && HEX.test(value.requestFingerprint || '');
}
function validReceipt(receipt) {
  return keys(receipt, ['success', 'transaction', 'network']) && typeof receipt.success === 'boolean'
    && receipt.network === 'eip155:8453' && typeof receipt.transaction === 'string'
    && (TX.test(receipt.transaction) || (!receipt.success && receipt.transaction === ''));
}
function validOutcome(value) {
  return keys(value, ['state', 'receipt', 'purchaseId', 'httpStatus', 'responseSha256', 'paymentResponseSha256'])
    && FINAL.has(value.state)
    && (value.purchaseId === undefined || PURCHASE.test(value.purchaseId))
    && (value.receipt === undefined || validReceipt(value.receipt))
    && (value.httpStatus === undefined || (Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599))
    && ['responseSha256', 'paymentResponseSha256'].every(k => value[k] === undefined || HEX.test(value[k]))
    && (value.state !== 'delivered' || (value.receipt?.success === true
      && (value.httpStatus === undefined || (value.httpStatus >= 200 && value.httpStatus < 300 && value.httpStatus !== 202))))
    && (value.state !== 'accepted' || !!value.purchaseId)
    && (value.state !== 'rejected' || value.receipt?.success === false);
}
function isOwnerAlive(row) {
  if (row.ownerPid === process.pid) return owners.has(row.ownerHash);
  try { process.kill(row.ownerPid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function project(row) {
  if (!row) return null;
  const abandoned = ['prepared', 'dispatched'].includes(row.state) && !isOwnerAlive(row);
  return { attemptId: row.attemptId, generation: row.generation, state: abandoned ? 'unknown' : row.state,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(abandoned ? { reason: 'owner_unavailable' } : {}),
    ...Object.fromEntries(['purchaseId', 'nonceHash', 'receipt', 'httpStatus', 'responseSha256', 'paymentResponseSha256']
      .filter(key => row[key] !== undefined).map(key => [key, structuredClone(row[key])])) };
}

export function createPaymentAttemptStore({ directory, now = Date.now, io = fs, maxAttempts = 10000, maxStateBytes = 8 * 1024 * 1024 } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) === path.parse(directory).root
    || typeof now !== 'function' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1
    || !Number.isSafeInteger(maxStateBytes) || maxStateBytes < 1024) fail('payment_attempt_configuration_invalid');
  // Resolve the nearest existing ancestor without creating anything. Missing
  // parents are made private only at the explicitly requested lazy bootstrap.
  const requested = path.resolve(directory), missing = [];
  let ancestor = path.dirname(requested), resolved;
  while (!resolved) {
    try { resolved = io.realpathSync(ancestor); }
    catch (error) {
      if (error.code !== 'ENOENT' || ancestor === path.dirname(ancestor)) fail('payment_attempt_directory_missing');
      missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor);
    }
  }
  const dir = path.join(resolved, ...missing, path.basename(requested));
  const parent = path.dirname(dir), pathHash = sha(dir);
  let parentIdentity = null;
  if (!missing.length) {
    try { parentIdentity = io.lstatSync(parent); } catch { fail('payment_attempt_directory_missing'); }
  }
  const anchorFile = path.join(parent, '.payment-attempt-' + pathHash + '.anchor');
  const file = name => path.join(dir, name), handles = new WeakMap();
  let mutationAttempted = false;
  const stamp = () => { const n = now(); if (!Number.isSafeInteger(n) || n < 0 || n > 8640000000000000) fail('payment_attempt_clock_invalid'); return new Date(n).toISOString(); };
  const guard = fn => { try { return fn(); } catch (error) { if (error instanceof PaymentAttemptStoreError) throw error;
    fail(error.code === 'ENOENT' ? 'payment_attempt_source_missing' : 'payment_attempt_store_unavailable'); } };
  const exists = p => { try { io.lstatSync(p); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
  function privateNode(stat, mode, isDir = false) {
    if ((isDir ? !stat.isDirectory() : !stat.isFile()) || (stat.mode & 0o777) !== mode
      || (typeof process.getuid === 'function' && stat.uid !== process.getuid()) || (!isDir && stat.nlink !== 1)) fail('payment_attempt_store_not_private');
  }
  function checkParent() {
    const stat = io.lstatSync(parent);
    if (!stat.isDirectory()) fail('payment_attempt_store_not_private');
    if (parentIdentity && (stat.dev !== parentIdentity.dev || stat.ino !== parentIdentity.ino)) fail('payment_attempt_parent_changed');
  }
  function checkDir() { checkParent(); privateNode(io.lstatSync(dir), 0o700, true); }
  function ensureParent() {
    if (parentIdentity) { checkParent(); return; }
    let target = resolved;
    for (const name of missing) {
      target = path.join(target, name);
      if (!exists(target)) { io.mkdirSync(target, { mode: 0o700 }); syncDir(path.dirname(target)); syncDir(target); }
      const stat = io.lstatSync(target);
      if (!stat.isDirectory()) fail('payment_attempt_store_not_private');
    }
    parentIdentity = io.lstatSync(parent); checkParent();
  }
  function syncDir(target = dir) { const fd = io.openSync(target, 'r'); try { io.fsyncSync(fd); } finally { io.closeSync(fd); } }
  function readPath(p, max = maxStateBytes) {
    const stat = io.lstatSync(p); privateNode(stat, 0o600);
    if (stat.size > max) fail('payment_attempt_store_corrupt');
    const fd = io.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let raw;
    try {
      const actual = io.fstatSync(fd); privateNode(actual, 0o600);
      if (actual.dev !== stat.dev || actual.ino !== stat.ino || actual.size > max) fail('payment_attempt_store_corrupt');
      raw = io.readFileSync(fd, 'utf8');
    } finally { io.closeSync(fd); }
    if (Buffer.byteLength(raw) > max) fail('payment_attempt_store_corrupt');
    try { return JSON.parse(raw); } catch { fail('payment_attempt_store_corrupt'); }
  }
  const read = (name, max) => readPath(file(name), max);
  function writePath(p, value) {
    const fd = io.openSync(p, 'wx', 0o600);
    try { io.writeFileSync(fd, stable(value)); io.fsyncSync(fd); } finally { io.closeSync(fd); }
    syncDir(path.dirname(p));
  }
  const writeNew = (name, value) => writePath(file(name), value);
  function replace(name, value) {
    const temp = name + '.' + crypto.randomUUID() + '.tmp';
    writeNew(temp, value); io.renameSync(file(temp), file(name)); syncDir();
  }
  function validRow(row) {
    if (!keys(row, ['attemptId', 'bindingKey', 'binding', 'generation', 'ownerPid', 'ownerHash', 'state', 'createdAt', 'updatedAt',
      'dispatchedAt', 'finalizedAt', 'releasedAt', 'nonceHash', 'purchaseId', 'receipt', 'httpStatus', 'responseSha256', 'paymentResponseSha256'])
      || !ATTEMPT.test(row.attemptId || '') || !validBinding(row.binding) || row.bindingKey !== sha(stable(row.binding))
      || !Number.isSafeInteger(row.generation) || row.generation < 1 || !Number.isSafeInteger(row.ownerPid) || row.ownerPid < 1
      || !HEX.test(row.ownerHash || '') || !STATES.has(row.state) || !iso(row.createdAt) || !iso(row.updatedAt)
      || row.updatedAt < row.createdAt) return false;
    if (['prepared', 'released'].includes(row.state)) return row.nonceHash === undefined && row.purchaseId === undefined
      && row.dispatchedAt === undefined && row.finalizedAt === undefined && row.receipt === undefined
      && row.httpStatus === undefined && row.responseSha256 === undefined && row.paymentResponseSha256 === undefined
      && (row.state === 'released' ? iso(row.releasedAt) : row.releasedAt === undefined);
    if (!HEX.test(row.nonceHash || '') || row.purchaseId !== 'pur_' + row.nonceHash || !iso(row.dispatchedAt) || row.releasedAt !== undefined) return false;
    if (row.state === 'dispatched') return row.finalizedAt === undefined && row.receipt === undefined && row.httpStatus === undefined
      && row.responseSha256 === undefined && row.paymentResponseSha256 === undefined;
    return iso(row.finalizedAt) && validOutcome(Object.fromEntries(['state', 'receipt', 'purchaseId', 'httpStatus', 'responseSha256', 'paymentResponseSha256']
      .filter(k => row[k] !== undefined).map(k => [k, row[k]])));
  }
  function load() {
    checkDir();
    if (exists(file('initialize-pending.json')) || exists(file('write-pending.json'))) fail('payment_attempt_storage_unclear');
    const anchor = readPath(anchorFile, 2048);
    if (!keys(anchor, ['storeId', 'pathHash']) || !HEX.test(anchor.storeId || '') || anchor.pathHash !== pathHash) fail('payment_attempt_anchor_invalid');
    const meta = read('metadata.json', 2048), state = read('state.json'), seal = read('seal.json', 2048);
    if (meta?.storeId !== anchor.storeId || !keys(meta, ['schema', 'storeId', 'createdAt']) || meta.schema !== SCHEMA || !HEX.test(meta.storeId || '') || !iso(meta.createdAt)
      || !keys(state, ['schema', 'storeId', 'revision', 'attempts', 'current']) || state.schema !== SCHEMA || state.storeId !== meta.storeId
      || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.attempts) || state.attempts.length > maxAttempts
      || !object(state.current) || !keys(seal, ['schema', 'storeId', 'revision', 'sha256']) || seal.schema !== SCHEMA
      || seal.storeId !== meta.storeId || seal.revision !== state.revision || seal.sha256 !== sha(stable(state))) fail('payment_attempt_store_corrupt');
    const latest = Object.create(null), ids = new Set();
    for (const row of state.attempts) {
      if (!validRow(row) || ids.has(row.attemptId)) fail('payment_attempt_store_corrupt');
      ids.add(row.attemptId);
      const previous = latest[row.bindingKey];
      if (row.generation !== (previous?.generation || 0) + 1 || (previous && !['released', 'delivered'].includes(previous.state))) fail('payment_attempt_store_corrupt');
      latest[row.bindingKey] = row;
    }
    if (Object.keys(state.current).length !== Object.keys(latest).length || Object.entries(state.current)
      .some(([key, id]) => !HEX.test(key) || latest[key]?.attemptId !== id)) fail('payment_attempt_store_corrupt');
    return state;
  }
  function save(state) {
    state.revision++;
    if (!Number.isSafeInteger(state.revision) || Buffer.byteLength(stable(state)) > maxStateBytes) fail('payment_attempt_store_full');
    mutationAttempted = true;
    writeNew('write-pending.json', { schema: SCHEMA, storeId: state.storeId, revision: state.revision, sha256: sha(stable(state)) });
    replace('state.json', state);
    replace('seal.json', { schema: SCHEMA, storeId: state.storeId, revision: state.revision, sha256: sha(stable(state)) });
    io.unlinkSync(file('write-pending.json')); syncDir();
  }
  function transaction(fn) {
    return guard(() => {
      checkDir();
      if (exists(file('transaction.lock'))) fail('payment_attempt_store_busy');
      try { writeNew('transaction.lock', { schema: SCHEMA, ownerPid: process.pid, createdAt: stamp() }); }
      catch (error) { if (error.code === 'EEXIST') fail('payment_attempt_store_busy'); throw error; }
      // Storage failures retain the lock. A rejected local API call before
      // any mutation can safely release this short transaction lock.
      mutationAttempted = false;
      try {
        const state = load(), output = fn(state);
        io.unlinkSync(file('transaction.lock')); syncDir();
        return output;
      } catch (error) {
        const localRejection = ['payment_attempt_handle_invalid', 'payment_attempt_already_dispatched',
          'payment_attempt_outcome_invalid', 'payment_attempt_outcome_conflict', 'payment_attempt_not_dispatched',
          'payment_attempt_release_forbidden', 'payment_attempt_store_full', 'payment_attempt_clock_invalid'].includes(error.code);
        if (!mutationAttempted && localRejection) { io.unlinkSync(file('transaction.lock')); syncDir(); }
        throw error;
      }
    });
  }
  function current(state, key) { return state.attempts.find(row => row.attemptId === state.current[key]) || null; }
  function owned(handle, state) {
    const owner = handles.get(handle);
    if (!owner || owner.pid !== process.pid || !owners.has(owner.hash)) fail('payment_attempt_handle_invalid');
    const row = current(state, owner.key);
    if (!row || row.attemptId !== owner.attemptId || row.ownerHash !== owner.hash || row.ownerPid !== process.pid) fail('payment_attempt_handle_invalid');
    return row;
  }
  function updateTime(row) { const value = stamp(); if (value < row.updatedAt) fail('payment_attempt_clock_invalid'); row.updatedAt = value; return value; }
  function initialize() {
    return guard(() => {
      if (exists(dir)) fail('payment_attempt_store_exists');
      if (exists(anchorFile)) fail('payment_attempt_source_missing');
      ensureParent();
      const meta = { schema: SCHEMA, storeId: crypto.randomBytes(32).toString('hex'), createdAt: stamp() };
      // Publish the complete anchor exclusively before creating the store.
      // An abandoned anchor prevents a missing directory becoming a new wallet intent.
      const anchorTemp = anchorFile + '.' + crypto.randomUUID() + '.tmp';
      writePath(anchorTemp, { storeId: meta.storeId, pathHash });
      io.linkSync(anchorTemp, anchorFile); io.unlinkSync(anchorTemp); syncDir(parent);
      io.mkdirSync(dir, { mode: 0o700 }); checkDir(); syncDir(parent);
      writeNew('initialize-pending.json', meta);
      const state = { schema: SCHEMA, storeId: meta.storeId, revision: 0, attempts: [], current: {} };
      writeNew('metadata.json', meta); writeNew('state.json', state);
      writeNew('seal.json', { schema: SCHEMA, storeId: meta.storeId, revision: 0, sha256: sha(stable(state)) });
      io.unlinkSync(file('initialize-pending.json')); syncDir();
      return { initialized: true };
    });
  }
  function ensureInitialized() {
    return guard(() => {
      if (!exists(dir) && !exists(anchorFile)) return initialize();
      if (!exists(dir) || !exists(anchorFile)) fail('payment_attempt_source_missing');
      checkDir(); if (exists(file('transaction.lock'))) fail('payment_attempt_store_busy');
      load(); return { initialized: false };
    });
  }
  function inspect(input) {
    const binding = bind(input);
    return guard(() => {
      checkDir(); if (exists(file('transaction.lock'))) fail('payment_attempt_store_busy');
      return project(current(load(), binding.key));
    });
  }
  function begin(input, { newPurchase = false } = {}) {
    const binding = bind(input);
    if (typeof newPurchase !== 'boolean') fail('payment_attempt_binding_invalid');
    return transaction(state => {
      const previous = current(state, binding.key);
      if (previous && previous.state !== 'released' && !(previous.state === 'delivered' && newPurchase)) return { acquired: false, attempt: project(previous) };
      if (state.attempts.length >= maxAttempts) fail('payment_attempt_store_full');
      const time = stamp(), attemptId = 'att_' + crypto.randomBytes(32).toString('hex'), ownerHash = sha(crypto.randomBytes(32));
      const row = { attemptId, bindingKey: binding.key, binding: binding.value, generation: (previous?.generation || 0) + 1,
        ownerPid: process.pid, ownerHash, state: 'prepared', createdAt: time, updatedAt: time };
      state.attempts.push(row); state.current[binding.key] = attemptId; save(state);
      const handle = Object.freeze(Object.create(null));
      handles.set(handle, { key: binding.key, attemptId, hash: ownerHash, pid: process.pid }); owners.add(ownerHash);
      return { acquired: true, handle, attempt: project(row) };
    });
  }
  function markDispatch(handle, { nonceHash, purchaseId } = {}) {
    if (!HEX.test(nonceHash || '') || (purchaseId !== undefined && purchaseId !== 'pur_' + nonceHash)) fail('payment_attempt_dispatch_invalid');
    return transaction(state => {
      const row = owned(handle, state);
      if (row.state !== 'prepared') fail('payment_attempt_already_dispatched');
      row.dispatchedAt = updateTime(row); row.state = 'dispatched'; row.nonceHash = nonceHash; row.purchaseId = 'pur_' + nonceHash;
      save(state); return project(row);
    });
  }
  function finalize(handle, outcome) {
    if (!validOutcome(outcome)) fail('payment_attempt_outcome_invalid');
    const clean = Object.fromEntries(Object.entries(outcome).filter(([, value]) => value !== undefined));
    return transaction(state => {
      const row = owned(handle, state);
      if (clean.purchaseId !== undefined && clean.purchaseId !== row.purchaseId) fail('payment_attempt_outcome_invalid');
      const desired = { ...clean, purchaseId: row.purchaseId };
      if (FINAL.has(row.state)) {
        const existing = Object.fromEntries(Object.keys(desired).map(k => [k, row[k]]));
        if (stable(existing) !== stable(desired)) fail('payment_attempt_outcome_conflict');
        return project(row);
      }
      if (row.state !== 'dispatched') fail('payment_attempt_not_dispatched');
      row.finalizedAt = updateTime(row); Object.assign(row, desired); save(state); return project(row);
    });
  }
  function release(handle) {
    return transaction(state => {
      const row = owned(handle, state);
      if (row.state !== 'prepared') fail('payment_attempt_release_forbidden');
      row.releasedAt = updateTime(row); row.state = 'released'; save(state);
      owners.delete(row.ownerHash); return project(row);
    });
  }
  return Object.freeze({ initialize, ensureInitialized, begin, inspect, markDispatch, finalize, release });
}
