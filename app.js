'use strict';
const KEY='warikan-note-v1', LIMIT=100000000;
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=n=>'¥'+n.toLocaleString('ja-JP'), today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}, uid=()=>crypto.randomUUID();
let state={version:1,members:[],expenses:[],adjustments:[],payments:[]}, editing=null, toastTimer, storageBlocked=false;
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500)}
function money(n,zero=false){return Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=LIMIT}
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s}
function shares(e){const result={},fixed=e.fixed||{},free=e.participants.filter(id=>fixed[id]===undefined);let remainder=e.amount;for(const id of e.participants){if(fixed[id]!==undefined){if(!money(fixed[id],true))throw Error('固定額は0円以上の整数で入力してください。');result[id]=fixed[id];remainder-=fixed[id]}}
if(remainder<0)throw Error('固定額の合計が支出額を超えています。');if(!free.length&&remainder!==0)throw Error('全員の負担額を固定する場合、合計を支出額と一致させてください。');free.forEach((id,i)=>result[id]=Math.floor(remainder/free.length)+(i<remainder%free.length?1:0));return result}
function calculate(s){const rows=Object.fromEntries(s.members.map(m=>[m.id,{paid:0,share:0,adjust:0,settled:0,balance:0}]));for(const e of s.expenses){rows[e.payer].paid+=e.amount;for(const [id,n]of Object.entries(shares(e)))rows[id].share+=n}for(const a of s.adjustments){rows[a.from].adjust+=a.amount;rows[a.to].adjust-=a.amount}for(const p of s.payments){rows[p.from].settled+=p.amount;rows[p.to].settled-=p.amount}for(const r of Object.values(rows))r.balance=r.share-r.paid+r.adjust-r.settled;
const debt=Object.entries(rows).filter(([,r])=>r.balance>0).map(([id,r])=>({id,n:r.balance})),credit=Object.entries(rows).filter(([,r])=>r.balance<0).map(([id,r])=>({id,n:-r.balance})),transfers=[];let i=0,j=0;while(i<debt.length&&j<credit.length){const amount=Math.min(debt[i].n,credit[j].n);transfers.push({from:debt[i].id,to:credit[j].id,amount});debt[i].n-=amount;credit[j].n-=amount;if(!debt[i].n)i++;if(!credit[j].n)j++}return {rows,transfers}}
function validate(s){if(!s||s.version!==1||!['members','expenses','adjustments','payments'].every(k=>Array.isArray(s[k])&&s[k].length<=10000))throw Error('対応するバックアップファイルではありません。');const ids=new Set(),all=new Set();for(const m of s.members){if(typeof m.id!=='string'||!/^[-\w]{1,80}$/.test(m.id)||ids.has(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>30)throw Error('参加者データが不正です。');ids.add(m.id)}for(const k of ['expenses','adjustments','payments'])for(const e of s[k]){if(typeof e.id!=='string'||!/^[-\w]{1,80}$/.test(e.id)||all.has(e.id)||!money(e.amount)||!validDate(e.date))throw Error('金額・日付データが不正です。');all.add(e.id);if(k==='expenses'){if(!ids.has(e.payer)||typeof e.title!=='string'||!e.title.trim()||e.title.length>80||!Array.isArray(e.participants)||!e.participants.length||new Set(e.participants).size!==e.participants.length||!e.participants.every(id=>ids.has(id))||!e.fixed||typeof e.fixed!=='object'||Array.isArray(e.fixed)||!Object.keys(e.fixed).every(id=>e.participants.includes(id)))throw Error('支出データが不正です。');shares(e)}else if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||typeof e.note!=='string'||e.note.length>160)throw Error('精算データが不正です。')}return s}
function persist(){if(storageBlocked){$('save-status').textContent='自動保存停止中・バックアップしてください';return}try{localStorage.setItem(KEY,JSON.stringify(state));$('save-status').textContent='保存済み · このブラウザー'}catch{$('save-status').textContent='保存できません・バックアップしてください';notify('ブラウザーに保存できません。バックアップをご利用ください。')}}
const name=id=>esc(state.members.find(m=>m.id===id)?.name||'不明');
function options(selected){return state.members.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?'selected':''}>${esc(m.name)}</option>`).join('')}
function refreshMembers(selected,fixed={}){const ids=selected||state.members.map(m=>m.id);$('members').innerHTML=state.members.map(m=>`<span class="chip">${esc(m.name)}<button type="button" data-action="member-delete" data-id="${esc(m.id)}" aria-label="${esc(m.name)}を削除">×</button></span>`).join('');for(const id of ['expense-payer','adjust-from','adjust-to']){const old=$(id).value;$(id).innerHTML=options(old)}$('expense-members').innerHTML=state.members.map(m=>`<label><input type="checkbox" value="${esc(m.id)}" ${ids.includes(m.id)?'checked':''}>${esc(m.name)}</label>`).join('')||'<span class="hint">まず参加者を追加してください。</span>';$('fixed-fields').innerHTML=state.members.map(m=>`<label class="field" data-fixed-label="${esc(m.id)}" ${ids.includes(m.id)?'':'hidden'}><span>${esc(m.name)} の負担額（円）</span><input type="number" inputmode="numeric" data-fixed="${esc(m.id)}" min="0" max="${LIMIT}" step="1" placeholder="空欄：均等割り" value="${fixed[m.id]??''}"></label>`).join('');$('expense-submit').disabled=!state.members.length}
function renderContent(){const {rows,transfers}=calculate(state),total=state.expenses.reduce((n,e)=>n+e.amount,0);$('total').textContent=yen(total);$('average').textContent=yen(state.members.length?Math.round(total/state.members.length*100)/100:0);$('count').innerHTML=`${state.members.length} <small>人</small>`;
$('balances').innerHTML=!state.members.length?'<div class="empty"><span class="empty-icon">↔</span>参加者と支出を登録すると、<br>誰がいくら支払うかがここに表示されます。</div>':`<div class="table-wrap"><table><thead><tr><th>参加者</th><th class="num">立替額</th><th class="num">負担額</th><th class="num">残りの精算額</th></tr></thead><tbody>${state.members.map(m=>{const r=rows[m.id];return `<tr><td>${esc(m.name)}</td><td class="num">${yen(r.paid)}</td><td class="num">${yen(r.share+r.adjust)}</td><td class="num ${r.balance>0?'pay':r.balance<0?'receive':''}">${r.balance>0?'+':r.balance<0?'−':''}${yen(Math.abs(r.balance))}<br><small>${r.balance>0?'支払う':r.balance<0?'受け取る':'精算不要'}</small></td></tr>`}).join('')}</tbody></table></div><p class="hint">精算額 ＝ 負担額（個別調整を含む）− 立替額 − 精算済み支払額 ＋ 精算済み受取額</p>`;
$('transfers').innerHTML=transfers.length?`<div class="subsection"><h3>この順に支払えば、精算完了</h3>${transfers.map(t=>`<div class="transfer"><div class="route">${name(t.from)}<span class="arrow">→</span>${name(t.to)}</div><strong>${yen(t.amount)}</strong><button class="small" data-action="pay" data-from="${t.from}" data-to="${t.to}" data-amount="${t.amount}">支払済みにする</button></div>`).join('')}<p class="hint">実際の支払い後に押してください。今日の日付で履歴に記録されます。</p></div>`:state.expenses.length||state.payments.length?'<div class="notice">✓ 現在、残りの精算はありません。</div>':'';
$('expense-count').textContent=state.expenses.length+'件';$('expenses').innerHTML=state.expenses.length?`<div class="table-wrap"><table><thead><tr><th>支払日 / 内容</th><th>立替者</th><th class="num">請求額</th><th>操作</th></tr></thead><tbody>${[...state.expenses].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<tr><td class="entry-title"><small>${esc(e.date)}</small>${esc(e.title)}<small>${e.participants.map(id=>`${name(id)} ${yen(shares(e)[id])}${e.fixed[id]!==undefined?'（固定）':''}`).join(' / ')}</small></td><td>${name(e.payer)}</td><td class="num">${yen(e.amount)}</td><td><button class="small" data-action="edit" data-id="${e.id}">編集</button> <button class="small danger" data-action="expense-delete" data-id="${e.id}">削除</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">まだ支出はありません。<br>最初の立て替えを記録しましょう。</div>';
$('adjustments').innerHTML=state.adjustments.map(a=>`<div class="transfer"><div class="route">${name(a.from)} → ${name(a.to)}<p class="hint">${esc(a.note)} · ${esc(a.date)}</p></div><strong>${yen(a.amount)}</strong><button class="small danger" data-action="adjust-delete" data-id="${a.id}">取消</button></div>`).join('');
$('payments').innerHTML=state.payments.length?`<div class="table-wrap"><table><thead><tr><th>支払日</th><th>支払者 → 受取者</th><th class="num">支払額</th><th></th></tr></thead><tbody>${[...state.payments].reverse().map(p=>`<tr><td>${esc(p.date)}</td><td>${name(p.from)} → ${name(p.to)}</td><td class="num">${yen(p.amount)}</td><td><button class="small danger" data-action="payment-delete" data-id="${p.id}">取消</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">精算の支払いはまだ記録されていません。</div>'}
function render(){
  renderContent();
  for(const table of document.querySelectorAll('.table-wrap table')){
    const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent || '操作');
    for(const row of table.querySelectorAll('tbody tr')) [...row.cells].forEach((cell,i)=>cell.dataset.label=labels[i]);
  }
}
function update(){persist();render()}
function resetExpense(){editing=null;$('expense-form').reset();$('expense-date').value=today();$('expense-heading').textContent='支出を記録';$('expense-submit').textContent='＋ 支出を追加';$('cancel-edit').hidden=true;refreshMembers()}
$('member-form').addEventListener('submit',e=>{e.preventDefault();const n=$('member-name').value.trim();if(!n)return notify('名前を入力してください。');if(state.members.some(m=>m.name===n))return notify('同じ名前の参加者がいます。');state.members.push({id:uid(),name:n});$('member-form').reset();const chosen=[...$('expense-members').querySelectorAll('input:checked')].map(el=>el.value);const fixed=Object.fromEntries([...$('fixed-fields').querySelectorAll('input')].filter(el=>el.value!=='').map(el=>[el.dataset.fixed,Number(el.value)]));refreshMembers(editing?chosen:undefined,fixed);update()});
$('expense-members').addEventListener('change',()=>{const selected=[...$('expense-members').querySelectorAll('input:checked')].map(el=>el.value);for(const label of $('fixed-fields').children)label.hidden=!selected.includes(label.dataset.fixedLabel)});
$('expense-form').addEventListener('submit',ev=>{ev.preventDefault();try{const participants=[...$('expense-members').querySelectorAll('input:checked')].map(el=>el.value),fixed={};if(!participants.length)throw Error('割り勘するメンバーを1人以上選んでください。');for(const input of $('fixed-fields').querySelectorAll('input'))if(participants.includes(input.dataset.fixed)&&input.value!=='')fixed[input.dataset.fixed]=Number(input.value);const expense={id:editing||uid(),title:$('expense-title').value.trim(),date:$('expense-date').value,amount:Number($('expense-amount').value),payer:$('expense-payer').value,participants,fixed};if(!expense.title||!money(expense.amount)||!validDate(expense.date))throw Error('内容・日付・金額を確認してください。');shares(expense);if(editing)state.expenses=state.expenses.map(e=>e.id===editing?expense:e);else state.expenses.push(expense);resetExpense();update();notify('支出を保存しました。')}catch(e){notify(e.message)}});
$('cancel-edit').onclick=resetExpense;
$('adjust-form').addEventListener('submit',e=>{e.preventDefault();const from=$('adjust-from').value,to=$('adjust-to').value,amount=Number($('adjust-amount').value),note=$('adjust-note').value.trim();if(!from||!to||from===to)return notify('異なる2人を選んでください。');if(!money(amount)||!note)return notify('金額と理由を入力してください。');state.adjustments.push({id:uid(),from,to,amount,note,date:today()});$('adjust-amount').value='';$('adjust-note').value='';update();notify('精算額を調整しました。')});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const {action,id}=b.dataset;
if(action==='edit'){const x=state.expenses.find(e=>e.id===id);editing=id;refreshMembers(x.participants,x.fixed);$('expense-title').value=x.title;$('expense-date').value=x.date;$('expense-amount').value=x.amount;$('expense-payer').value=x.payer;$('expense-heading').textContent='支出を編集';$('expense-submit').textContent='変更を保存';$('cancel-edit').hidden=false;$('expense-title').focus();return}
if(action==='member-delete'){if(state.expenses.some(e=>e.payer===id||e.participants.includes(id))||[...state.adjustments,...state.payments].some(e=>e.from===id||e.to===id))return notify('この参加者の支出・調整・支払履歴を先に削除してください。');state.members=state.members.filter(m=>m.id!==id);refreshMembers();update();return}
if(action==='pay'){const t=calculate(state).transfers.find(t=>t.from===b.dataset.from&&t.to===b.dataset.to&&t.amount===Number(b.dataset.amount));if(!t)return;state.payments.push({...t,id:uid(),date:today(),note:'精算の支払い'});update();notify('支払履歴に記録しました。誤操作は履歴の「取消」で戻せます。');return}
const key={'expense-delete':'expenses','adjust-delete':'adjustments','payment-delete':'payments'}[action];if(key&&confirm(key==='payments'?'この支払いを取り消し、未精算の金額に戻しますか？':'この記録を削除しますか？ 精算額が再計算されます。')){state[key]=state[key].filter(e=>e.id!==id);if(id===editing)resetExpense();update();notify('記録を削除しました。')}});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`warikan-note-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('バックアップファイルを保存しました。')};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error('ファイルが大きすぎます（上限5MB）。');const next=validate(JSON.parse(await file.text()));if(confirm('現在のデータをバックアップの内容に置き換えますか？ 必要な記録は先にバックアップしてください。')){state=next;storageBlocked=false;resetExpense();update();notify('バックアップを復元しました。')}}catch(err){notify('復元できませんでした：'+err.message)}finally{e.target.value=''}};
$('print').onclick=()=>window.print();
try{const raw=localStorage.getItem(KEY);if(raw)state=validate(JSON.parse(raw))}catch{storageBlocked=true;$('save-status').textContent='保存データを読み込めません・自動保存停止中';notify('保存データを読み込めませんでした。復元するか、作成した記録をバックアップしてください。')}
window.addEventListener('storage',e=>{if(e.key===KEY){storageBlocked=true;$('save-status').textContent='別タブで変更あり・再読み込みしてください';notify('別タブの変更を検知しました。上書き防止のため自動保存を停止しました。')}});
resetExpense();render();

// A download remains available when the iOS share sheet does not support files.
$('export').onclick = async () => {
  const file = new File([JSON.stringify(state, null, 2)], `warikan-note-${today()}.json`, {type:'application/json'});
  if (navigator.canShare && navigator.canShare({files:[file]})) {
    try { await navigator.share({files:[file], title:'わりかんノートのバックアップ'}); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify('バックアップの保存先を確認してください。');
};

async function prepareOffline() {
  const status = $('offline-status');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('install-guide').hidden = Boolean(standalone);
  if (!window.isSecureContext || !['https:', 'http:'].includes(location.protocol)) {
    status.textContent = 'ホーム画面追加・オフライン利用にはHTTPSのURLで開いてください。';
    return;
  }
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'このブラウザーではオフライン起動を利用できません。';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', {scope:'./', updateViaCache:'none'});
    const showReady = () => {
      status.textContent = navigator.onLine ? '✓ オフライン利用の準備完了' : 'オフラインで利用中 · 記録は端末に保存されます';
    };
    const showUpdate = () => {
      status.textContent = '更新があります。入力を保存してアプリと同じページのタブをすべて閉じ、開き直してください。';
    };
    const watchInstall = () => {
      const worker = registration.installing;
      if (worker) worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        if (worker.state === 'redundant') status.textContent = 'オフライン準備に失敗しました。オンラインで開き直してください。';
      });
    };
    registration.addEventListener('updatefound', watchInstall);
    watchInstall();
    await navigator.serviceWorker.ready;
    const refreshStatus = () => registration.waiting ? showUpdate() : showReady();
    refreshStatus();
    window.addEventListener('online', refreshStatus);
    window.addEventListener('offline', refreshStatus);
  } catch {
    status.textContent = 'オフライン準備に失敗しました。オンラインで開き直してください。';
  }
}
prepareOffline();
