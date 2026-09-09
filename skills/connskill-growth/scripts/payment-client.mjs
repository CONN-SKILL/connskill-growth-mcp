// One origin-bound x402 v2 buyer. SDKs load only when payment is explicitly enabled.
import crypto from 'node:crypto';

export const BASE_NETWORK = 'eip155:8453';
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const UINT256_MAX = (1n << 256n) - 1n;
const ADDRESS = /^0x[\da-f]{40}$/i, NONCE = /^0x[\da-f]{64}$/i;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sameAddress = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const fail = code => { throw new PaymentClientError(code); };
export class PaymentClientError extends Error { constructor(code) { super(code); this.name = 'PaymentClientError'; this.code = code; } }
export function parseMaxUsd(value = '1.00') {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,71})(?:\.\d{1,6})?$/.test(value)) fail('payment_cap_invalid');
  const [whole,fraction=''] = value.split('.');
  const amount = BigInt(whole)*1000000n + BigInt(fraction.padEnd(6,'0'));
  if (amount > UINT256_MAX) fail('payment_cap_invalid');
  return amount;
}
export function formatUsdc(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value === 'bigint') value = value.toString();
  if (typeof value !== 'string' || !/^\d{1,78}$/.test(value)) fail('payment_amount_invalid');
  const amount = BigInt(value); if (amount > UINT256_MAX) fail('payment_amount_invalid');
  const part = (amount%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
  return `${amount/1000000n}${part?'.'+part:''}`;
}
// Same public nonce identity as services/purchase-journal.mjs:purchaseIdForKey.
export function purchaseIdForNonce(nonce) {
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) fail('payment_nonce_invalid');
  return 'pur_'+sha('nonce:'+nonce.toLowerCase());
}
function canonical(value,depth=0,counter={nodes:0}) {
  if (++counter.nodes > 8192 || depth > 32) fail('payment_body_invalid');
  if (Array.isArray(value)) return value.map(v=>canonical(v,depth+1,counter));
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],depth+1,counter)]));
  return value;
}
function freeze(value) { if (object(value)||Array.isArray(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function parseOrigin(value,allowLoopbackHttp) {
  let url;try { url = new URL(value); } catch { fail('payment_origin_invalid'); }
  if (url.username || url.password || url.hash || url.search || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(allowLoopbackHttp && url.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(url.hostname)))) fail('payment_origin_invalid');
  return url.origin;
}
function receiptFrom(value,wallet) {
  try {
    if (typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    const r=JSON.parse(Buffer.from(value,'base64').toString('utf8'));
    if (!object(r)||typeof r.success!=='boolean'||r.network!==BASE_NETWORK||
      (r.success?!NONCE.test(r.transaction||''):r.transaction!==''&&!NONCE.test(r.transaction||''))||
      r.payer!==undefined&&!sameAddress(r.payer,wallet)) return null;
    return {success:r.success,transaction:r.transaction,network:BASE_NETWORK};
  } catch { return null; }
}
function waitBounded(promise,signal) {
  if (signal.aborted) return Promise.reject(new PaymentClientError('payment_request_timeout'));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new PaymentClientError('payment_request_timeout'));
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
async function boundedText(response,limit,signal) {
  const reader=response.body?.getReader(); if (!reader) return '';
  const parts=[];let bytes=0;
  try {
    while(true){const {done,value}=await waitBounded(reader.read(),signal);if(done)break;
      bytes+=value.byteLength;if(bytes>limit)fail('payment_response_too_large');parts.push(Buffer.from(value));}
    return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  } finally { reader.cancel().catch(()=>{}); }
}
function storeCall(store,name,...args) {
  let value;try {value=store[name](...args);} catch {fail('payment_attempt_store_unavailable');}
  if (value && typeof value.then === 'function') fail('payment_attempt_store_unavailable');
  return value;
}
const AUTH_TYPES=[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},
  {name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}];
const JOB_STATES=new Set(['queued','running','ready','partial','failed','state_unclear','expired']);
function publicContentType(value) {
  const type=String(value||'').split(';',1)[0].trim().toLowerCase();
  return ['application/json','application/problem+json','text/plain','text/markdown','text/html'].includes(type)?type:'application/octet-stream';
}

export function createPaymentClient({origin,maxUsd='1.00',payTo,signer=null,attemptStore=null,fetchImpl=globalThis.fetch,
  timeoutMs=90000,maxResponseBytes=1048576,maxRequestBytes=65536,
  transportPolicy={allowLoopbackHttp:false}}={}) {
  const allowedOrigin=parseOrigin(origin,transportPolicy?.allowLoopbackHttp===true),cap=parseMaxUsd(maxUsd);
  if (payTo!==undefined && (typeof payTo!=='string'||!ADDRESS.test(payTo))) fail('payment_recipient_invalid');
  if (typeof fetchImpl!=='function' || !Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>120000 ||
    !Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1048576 ||
    !Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1||maxRequestBytes>65536) fail('payment_client_configuration_invalid');
  async function request(pathOrURL,options={},intent={paid:false}) {
    if (!object(options)||!object(intent)||typeof intent.paid!=='boolean' || intent.newPurchase!==undefined&&typeof intent.newPurchase!=='boolean') fail('payment_request_invalid');
    if (typeof pathOrURL!=='string' || !pathOrURL || /[\\\u0000-\u0020]/.test(pathOrURL)) fail('payment_target_invalid');
    let url;try {url=new URL(pathOrURL,allowedOrigin+'/');} catch {fail('payment_target_invalid');}
    if (url.origin!==allowedOrigin||url.username||url.password||url.hash || !(pathOrURL.startsWith('/')&&!pathOrURL.startsWith('//')||pathOrURL.startsWith(allowedOrigin+'/'))||
      url.href!==(pathOrURL.startsWith('/')?allowedOrigin+pathOrURL:pathOrURL)) fail('payment_target_invalid');
    const method=options.method||'GET';if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))fail('payment_method_invalid');
    let headers;try{headers=new Headers(options.headers||{});}catch{fail('payment_request_header_invalid');}
    for(const [name]of headers)if(!['accept','content-type','user-agent'].includes(name))fail('payment_request_header_invalid');
    const body=options.body;
    if(body!==undefined&&(typeof body!=='string'||Buffer.byteLength(body)>maxRequestBytes||['GET','HEAD'].includes(method)))fail('payment_body_invalid');
    let canonicalBody='';
    if(body!==undefined){try{canonicalBody=JSON.stringify(canonical(JSON.parse(body)));}catch{fail('payment_body_invalid');}
      if(headers.has('content-type')&&!/^application\/json(?:;\s*charset=utf-8)?$/i.test(headers.get('content-type')))fail('payment_content_type_invalid');
      headers.set('content-type','application/json');}
    const paid=intent.paid;
    if(paid&&(!signer||typeof signer.signTypedData!=='function'||!ADDRESS.test(signer.address||'')))fail('payment_signer_required');
    if(paid&&(!payTo||cap===0n))fail(payTo?'payment_cap_zero':'payment_recipient_required');
    if(paid&&(!attemptStore||!['ensureInitialized','begin','markDispatch','finalize','release'].every(n=>typeof attemptStore[n]==='function')))fail('payment_attempt_store_required');
    let handle=null,attempt=null,dispatched=false,signature=null,nonce=null,expectedHeader=null,selected=null,lastReceipt=null;
    let active=true,unpaidCalls=0,paidCalls=0,lastResponseHeader=null,existingOutcome=null;
    const binding=paid?{wallet:signer.address,origin:allowedOrigin,method,requestFingerprint:sha(JSON.stringify({url:url.href,method,
      bodySha256:sha(canonicalBody),merchant:payTo.toLowerCase(),network:BASE_NETWORK,asset:BASE_USDC.toLowerCase()}))}:null;
    if(options.signal&&typeof options.signal.addEventListener!=='function')fail('payment_signal_invalid');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    const outsideAbort=()=>controller.abort();
    if(options.signal){if(options.signal.aborted)controller.abort();else options.signal.addEventListener('abort',outsideAbort,{once:true});}
    const ensureActive=()=>{if(!active||controller.signal.aborted)fail('payment_request_timeout');};
    const paymentView=(state,receipt=lastReceipt,delivery='none')=>({state,delivery,...(nonce?{purchaseId:purchaseIdForNonce(nonce)}:attempt?.purchaseId?{purchaseId:attempt.purchaseId}:{}),
      ...(attempt?.attemptId?{attemptId:attempt.attemptId}:{}),doNotPayAgain:state!=='unpaid'&&state!=='not_submitted',...(receipt?{receipt}:{})});
    const uncertain=()=>{const payment=paymentView('state_unclear',lastReceipt,'unknown');const json={error:'payment_outcome_unclear',...payment};
      return{ok:false,status:503,text:JSON.stringify(json),json,headers:{'content-type':'application/json'},payment};};
    const record=(state,httpStatus,responseText)=>storeCall(attemptStore,'finalize',handle,{state,
      ...(nonce?{purchaseId:purchaseIdForNonce(nonce)}:{}),...(lastReceipt?{receipt:lastReceipt}:{}),
      ...(httpStatus?{httpStatus}:{}),...(responseText!==undefined?{responseSha256:sha(responseText)}:{}),
      ...(lastResponseHeader?{paymentResponseSha256:sha(lastResponseHeader)}:{})});
    function safeRequirement(r) {
      if(!object(r)||r.scheme!=='exact'||r.network!==BASE_NETWORK||!sameAddress(r.asset,BASE_USDC)||!sameAddress(r.payTo,payTo)||
        typeof r.amount!=='string'||!/^\d{1,78}$/.test(r.amount)||BigInt(r.amount)<=0n||BigInt(r.amount)>cap ||
        !Number.isSafeInteger(r.maxTimeoutSeconds)||r.maxTimeoutSeconds<1||r.maxTimeoutSeconds>300 ||
        !object(r.extra)||r.extra.name!=='USD Coin'||r.extra.version!=='2'||
        r.extra.assetTransferMethod!==undefined&&r.extra.assetTransferMethod!=='eip3009')return false;
      if(r.maxAmountRequired!==undefined&&r.maxAmountRequired!==r.amount)return false;
      if(r.resource!==undefined&&r.resource!==url.href)return false;
      return true;
    }
    function challenge(raw) {
      try {
        if(typeof raw!=='string'||raw.length>32768||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))fail('payment_challenge_invalid');
        const p=JSON.parse(Buffer.from(raw,'base64').toString('utf8'));
        if(!object(p)||p.x402Version!==2||!object(p.resource)||p.resource.url!==url.href||!Array.isArray(p.accepts)||!p.accepts.length||p.accepts.length>32)fail('payment_challenge_invalid');
        const accepts=p.accepts.filter(safeRequirement).map(r=>({scheme:'exact',network:BASE_NETWORK,asset:BASE_USDC,payTo,
          amount:r.amount,maxTimeoutSeconds:r.maxTimeoutSeconds,extra:{name:'USD Coin',version:'2',assetTransferMethod:'eip3009'}}));
        if(!accepts.length)fail('payment_requirements_denied');
        // No extension-driven permits, approvals or recovery actions are registered.
        return{x402Version:2,resource:{url:url.href,mimeType:'application/json'},accepts};
      }catch(e){if(e instanceof PaymentClientError)throw e;fail('payment_challenge_invalid');}
    }
    async function transport(input,init) {
      ensureActive();const req=new Request(input,init);
      if(req.url!==url.href||req.method!==method)fail('payment_request_binding_changed');
      const proof=req.headers.get('payment-signature');
      if(req.headers.has('x-payment'))fail('payment_legacy_forbidden');
      if(proof){
        if(!paid||!expectedHeader||proof!==expectedHeader||!nonce||paidCalls!==0)fail('payment_dispatch_denied');
        storeCall(attemptStore,'markDispatch',handle,{nonceHash:sha('nonce:'+nonce.toLowerCase()),purchaseId:purchaseIdForNonce(nonce)});
        // There is no await between the durable seal and the only paid send.
        ensureActive();dispatched=true;paidCalls++;
      }else{if(unpaidCalls!==0||dispatched)fail('payment_dispatch_denied');unpaidCalls++;}
      const outbound=new Headers(headers);if(proof)outbound.set('payment-signature',proof);
      const response=await waitBounded(fetchImpl(url.href,{method,headers:outbound,body,redirect:'error',signal:controller.signal}),controller.signal);
      ensureActive();
      if(response.redirected||response.url&&response.url!==url.href)fail('payment_response_origin_changed');
      if(proof){lastResponseHeader=response.headers.get('payment-response');lastReceipt=receiptFrom(lastResponseHeader,signer.address);}
      const text=await boundedText(response,maxResponseBytes,controller.signal);ensureActive();
      if(proof){
        let normalized=text,parsed;
        try{parsed=JSON.parse(text);}catch{ /* Non-JSON text is still checked verbatim. */ }
        if(parsed!==undefined){try{normalized=JSON.stringify(parsed);}catch{fail('payment_response_invalid');}}
        const matches=value=>(signature&&value.toLowerCase().includes(signature.toLowerCase()))||(expectedHeader&&value.includes(expectedHeader));
        if(matches(text)||matches(normalized))fail('payment_response_reflects_proof');
      }
      const responseHeaders=new Headers();for(const name of['content-type','payment-required','payment-response']){
        const v=response.headers.get(name);if(v!==null&&v.length<=32768)responseHeaders.set(name,v);}
      if(!proof&&paid&&response.status===402){const c=challenge(response.headers.get('payment-required'));
        storeCall(attemptStore,'ensureInitialized');
        const begin=storeCall(attemptStore,'begin',binding,{newPurchase:intent.newPurchase===true});
        if(!object(begin)||typeof begin.acquired!=='boolean'||!object(begin.attempt))fail('payment_attempt_store_unavailable');
        attempt=begin.attempt;
        if(!begin.acquired){lastReceipt=attempt.receipt||null;const state=attempt.state==='delivered'||attempt.state==='accepted'&&lastReceipt?.success===true?'confirmed':attempt.state==='rejected'?'rejected':'state_unclear';
          const payment=paymentView(state,lastReceipt,attempt.state==='delivered'?'delivered':attempt.state==='accepted'?'accepted':'unknown');
          const json={error:'payment_attempt_exists',...payment,previousState:attempt.state};
          existingOutcome={ok:false,status:409,text:JSON.stringify(json),json,headers:{'content-type':'application/json'},payment};
          return Response.json(json,{status:409});}
        handle=begin.handle;if(!handle)fail('payment_attempt_store_unavailable');
        responseHeaders.set('payment-required',Buffer.from(JSON.stringify(c)).toString('base64'));
        return new Response(JSON.stringify(c),{status:402,headers:responseHeaders});}
      return new Response(['HEAD'].includes(method)||[204,205,304].includes(response.status)?null:text,{status:response.status,headers:responseHeaders});
    }
    try {
      ensureActive();
      let doFetch=transport;
      if(paid){
        const [{wrapFetchWithPayment},{x402Client,x402HTTPClient},{ExactEvmScheme}]=await waitBounded(Promise.all([
          import('@x402/fetch'),import('@x402/core/client'),import('@x402/evm/exact/client')]),controller.signal);
        ensureActive();
        const guardedSigner={address:signer.address,async signTypedData(data){
          ensureActive();const m=data?.message,d=data?.domain;
          if(signature||!selected||data?.primaryType!=='TransferWithAuthorization'||!object(d)||d.name!=='USD Coin'||d.version!=='2'||
            d.chainId!==8453||!sameAddress(d.verifyingContract,BASE_USDC)||!object(m)||!sameAddress(m.from,signer.address)||!sameAddress(m.to,payTo)||
            m.value!==BigInt(selected.amount)||m.validAfter!==0n||typeof m.validBefore!=='bigint'||m.validBefore<=BigInt(Math.floor(Date.now()/1000))||
            m.validBefore>BigInt(Math.floor(Date.now()/1000)+selected.maxTimeoutSeconds+1)||!NONCE.test(m.nonce||'')||
            JSON.stringify(data.types)!==JSON.stringify({TransferWithAuthorization:AUTH_TYPES}))fail('payment_typed_data_denied');
          nonce=m.nonce;
          const result=await waitBounded(signer.signTypedData(freeze(structuredClone(data))),controller.signal);ensureActive();
          if(typeof result!=='string'||!/^0x[\da-f]{130}$/i.test(result))fail('payment_signature_invalid');
          signature=result;return result;
        }};
        const client=new x402Client().register(BASE_NETWORK,new ExactEvmScheme(guardedSigner));
        client.registerPolicy((version,requirements)=>version===2?requirements.filter(safeRequirement):[]);
        client.onBeforePaymentCreation(({paymentRequired,selectedRequirements})=>{
          ensureActive();if(paymentRequired.resource?.url!==url.href||!safeRequirement(selectedRequirements)||selected)fail('payment_requirements_denied');
          selected=structuredClone(selectedRequirements);
        });
        const httpClient=new x402HTTPClient(client);
        client.onAfterPaymentCreation(({paymentPayload})=>{
          ensureActive();if(paymentPayload.x402Version!==2||paymentPayload.resource?.url!==url.href||paymentPayload.payload?.signature!==signature||
            paymentPayload.payload?.authorization?.nonce!==nonce||!safeRequirement(paymentPayload.accepted))fail('payment_payload_denied');
          expectedHeader=httpClient.encodePaymentSignatureHeader(paymentPayload)['PAYMENT-SIGNATURE'];
          if(typeof expectedHeader!=='string'||expectedHeader.length>32768)fail('payment_payload_denied');
        });
        doFetch=wrapFetchWithPayment(transport,httpClient);
      }
      const response=await waitBounded(doFetch(url.href,{method,headers,body,redirect:'error',signal:controller.signal}),controller.signal);
      if(existingOutcome)return existingOutcome;
      const text=await boundedText(response,maxResponseBytes,controller.signal);let json=null;try{json=JSON.parse(text);}catch{}
      const result={ok:response.ok,status:response.status,text,json,headers:{'content-type':publicContentType(response.headers.get('content-type'))},payment:paymentView('unpaid',null)};
      if(!dispatched){if(handle)storeCall(attemptStore,'release',handle);handle=null;return result;}
      if(response.status===202){
        const id=purchaseIdForNonce(nonce),base='/v1/purchase-jobs/'+id;
        if(lastReceipt?.success!==true||url.pathname!=='/v1/site-audit'||!object(json)||json.status!=='accepted'||json.service!=='site-audit-v1'||
          json.purchaseId!==id||!JOB_STATES.has(json.state)||json.requiresPayment!==false||json.receiptConfirmed!==false||
          json.statusUrl!==base||json.resultUrl!==base+'/result'||json.challengeUrl!=='/v1/purchase-jobs/challenge'||
          json.authentication!=='Sign-In-With-X'||!Number.isFinite(Date.parse(json.expiresAt))||Date.parse(json.expiresAt)<=Date.now()){
          record('unknown',response.status,text);handle=null;return uncertain();}
        const accepted={status:'accepted',service:'site-audit-v1',purchaseId:id,state:json.state,requiresPayment:false,receiptConfirmed:false,
          statusUrl:base,resultUrl:base+'/result',challengeUrl:'/v1/purchase-jobs/challenge',authentication:'Sign-In-With-X',expiresAt:json.expiresAt};
        record('accepted',202,text);handle=null;return{...result,text:JSON.stringify(accepted),json:accepted,payment:paymentView('confirmed',lastReceipt,'accepted')};
      }
      if(response.ok&&lastReceipt?.success===true){record('delivered',response.status,text);handle=null;return{...result,payment:paymentView('confirmed',lastReceipt,'delivered')};}
      if(response.status===402&&lastReceipt?.success===false&&lastReceipt.transaction===''&&json?.stateUnclear!==true&&json?.settlementAttempted!==true&&
          !/unknown|unclear|timeout/i.test(String(json?.error||''))){record('rejected',402,text);handle=null;return{...result,payment:paymentView('rejected')};}
      record('unknown',response.status,text);handle=null;return uncertain();
    }catch(e){
      if(dispatched){if(handle){try{record('unknown');}catch{ /* The durable dispatch seal remains authoritative. */ }}return uncertain();}
      if(handle){try{storeCall(attemptStore,'release',handle);}catch{fail('payment_attempt_store_unavailable');}}
      if(e instanceof PaymentClientError)throw e;fail('payment_request_failed');
    }finally{active=false;clearTimeout(timer);options.signal?.removeEventListener('abort',outsideAbort);controller.abort();}
  }
  return Object.freeze({request,origin:allowedOrigin,maxAtomic:cap});
}
