/* ===== أقسام لوحة المستخدم (2) ===== */

/* --- OTP --- */
V.otp=()=>{main.innerHTML=banner()+`<div class="card"><h2 class="ch">إرسال OTP</h2><p class="cd">أرسل كلمة مرور لمرة واحدة لأي رقم WhatsApp لأغراض التحقق.</p>
<label>رقم WhatsApp المستلم *</label><input id="to" class="phone" dir="ltr" placeholder="+9647XXXXXXXXX"><p class="hint">اكتب الرقم العراقي مباشرة (مثال: 07701234567) وسيُضاف +964 تلقائياً</p>
<label>رسالة مخصصة (اختياري)</label><textarea id="msg" rows="4" placeholder="رمز التحقق الخاص بك: {OTP} هذا الرمز سينتهي خلال 5 دقائق."></textarea>
<p class="hint">اتركه فارغاً لاستخدام القالب الافتراضي، أو استخدم <code class="k">{OTP}</code> للرمز المكون من 6 أرقام</p><p class="warn">${ic('warn')} يجب أن تتضمن الرسائل المخصصة <code class="k">{OTP}</code></p>
<button class="btn w" style="padding:14px" onclick="otpSend()">إرسال OTP</button></div>
<div class="card info"><h3>كيف يعمل</h3><ul><li>سيتم إنشاء رمز OTP مكون من 6 أرقام تلقائياً</li><li>يُرسل الرمز إلى واتساب المستلم وصلاحيته 5 دقائق</li><li>تحقق من الرمز عبر الـ API: <code class="k">POST /api/otp/verify</code></li></ul></div>
<div class="card"><h3>التحقق من الرمز</h3><label>الرقم</label><input id="vt" class="phone" dir="ltr" placeholder="+9647XXXXXXXXX"><label>الرمز</label><input id="vc" dir="ltr"><button class="btn o w" onclick="otpVerify()">تحقق</button></div>`};
window.otpSend=A(async()=>{await api('/otp/send','POST',{to:to.value,message:msg.value||undefined});toast('تم إرسال الرمز ✓')});
window.otpVerify=A(async()=>{const j=await api('/otp/verify','POST',{to:vt.value,code:vc.value});toast(j.valid?'الرمز صحيح ✓':'غير صحيح',j.valid)});

/* --- قالب OTP --- */
const TPL_EN='Your verification code is: {OTP}\n\nThis code will expire in 5 minutes.\n\nDo not share this code with anyone.',TPL_AR='رمز التحقق الخاص بك: {OTP}\n\nهذا الرمز سينتهي خلال 5 دقائق.\n\nلا تشارك هذا الرمز مع أي شخص.';
V.tpl=async()=>{const r=await api('/otp/template');
 main.innerHTML=`<div class="card"><h2 class="ch">قالب رسالة OTP</h2><p class="cd" style="font-size:15px">أنشئ قالباً مخصصاً لرسائل OTP الخاصة بك. سيتم استخدام هذا القالب تلقائياً عند إرسال OTP عبر API دون تحديد رسالة مخصصة.</p></div>
 <div class="card"><h3>محرر القالب</h3><label>قالب OTP الخاص بك</label><textarea id="tb" rows="7" maxlength="500" oninput="tcnt.textContent=this.value.length">${esc(r.body)}</textarea>
 <p class="hint">استخدم <code class="k">{OTP}</code> حيث تريد ظهور الرمز المكون من 6 أرقام<br>عدد الأحرف: <span id="tcnt">${r.body.length}</span> / 500</p>
 <div class="chips"><button class="btn g s" onclick="tb.value=TPL_EN;tcnt.textContent=tb.value.length">📝 استخدام القالب الافتراضي</button><button class="btn g s" onclick="tb.value=TPL_AR;tcnt.textContent=tb.value.length">🇮🇶 استخدام القالب العربي</button><button class="btn g s" onclick="tb.value='';tcnt.textContent=0">🗑️ مسح القالب</button></div>
 ${SELF()?'':'<button class="btn" style="margin-top:12px" onclick="tplSave()">💾 حفظ القالب</button>'}</div>`};
window.tplSave=A(async()=>{await api('/otp/template','POST',{body:tb.value});toast('تم حفظ القالب ✓')});

/* --- مفاتيح API --- */
let KT='keys',KS=false;
window.keyTab=t=>{KT=t;V.keys()};
V.keys=async()=>{const b=location.origin+'/api',k=U.apiKey,m='مرحباً بك! هذه رسالة تجريبية من WP Sender API 🚀',s=await api('/sessions'),on=s.items.some(x=>x.status=='connected');
 const S={cURL:`curl -X POST "${b}/send" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${k}" \\\n  -d '{\n    "phone": "9647XXXXXXXXX",\n    "message": "${m}"\n  }'`,
 'Node.js':`const response = await fetch('${b}/send', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-API-Key': '${k}'\n  },\n  body: JSON.stringify({\n    phone: '9647XXXXXXXXX',\n    message: '${m}'\n  })\n});\nconst data = await response.json();`,
 Python:`import requests\n\nr = requests.post('${b}/send',\n  headers={'X-API-Key': '${k}'},\n  json={'phone': '9647XXXXXXXXX',\n        'message': '${m}'})\nprint(r.json())`,
 PHP:`$ch = curl_init('${b}/send');\ncurl_setopt_array($ch, [\n  CURLOPT_POST => 1,\n  CURLOPT_RETURNTRANSFER => 1,\n  CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ${k}'],\n  CURLOPT_POSTFIELDS => json_encode(['phone' => '9647XXXXXXXXX', 'message' => '${m}'])\n]);\necho curl_exec($ch);`};
 window._S=S;
 const kv=(l,v,sh,d,c='')=>`<div class="card kv"><div class="tp"><span class="lb">${l}</span><button class="cp" onclick="copy(${esc(JSON.stringify(v))})">${ic('copy')}</button></div><code class="${c}">${esc(sh||v)}</code><small>${d}</small></div>`;
 let body;
 if(KT=='keys')body=`<div class="card"><h3>${ic('key')} مفتاح الـ API الشخصي (Secret Key)</h3><p class="hint">استخدم هذا المفتاح السري في ترويسة <code class="k">X-API-Key</code> عند إرسال أي طلب برمجي للمنصة.</p>
  <div class="card" style="background:var(--bg);box-shadow:none"><code id="kv" dir="ltr" style="word-break:break-all;display:block;margin-bottom:10px">${KS?esc(k):'•'.repeat(36)}</code><div class="row2"><button class="btn w" onclick="copy('${esc(k)}')">${ic('copy')} نسخ المفتاح</button><button class="btn g w" onclick="KS=!KS;V.keys()">${ic('eye')} ${KS?'إخفاء':'إظهار'}</button></div></div>
  <p class="warn">${ic('warn')} حافظ على سرية هذا المفتاح ولا تقم بمشاركته أو رفعه في ملفات عامة (Frontend / GitHub). المفتاح يمتلك صلاحية كاملة لإرسال الرسائل واستهلاك رصيد حسابك.</p><button class="btn r s" onclick="keyReset()">${ic('refresh')} تجديد المفتاح (Reset Key)</button></div>
  ${kv('BASE API URL',b,'','نقطة النهاية الأساسية لجميع طلبات REST API')}${kv('AUTHENTICATION HEADER','X-API-Key: '+k,'X-API-Key: '+k.slice(0,11)+'...','مرر المفتاح في Header كل طلب للمصادقة','g')}${kv('REQUEST FORMAT','Content-Type: application/json','','جميع البيانات ترسل وتُستقبل بصيغة JSON')}
  <div class="card dk"><div class="hd"><h3>${ic('term')}<span>نموذج كود الإرسال السريع (Send Message)</span></h3><button class="cpb" onclick="copy(kc.textContent)">${ic('copy')}نسخ الكود</button></div><div class="seg">${Object.keys(S).map(n=>`<button class="${n=='cURL'?'on':''}" onclick="kc.textContent=_S['${n}'];document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x==this))">${n}</button>`).join('')}</div><pre id="kc"></pre><p>* الكود أعلاه يحتوي على مفتاح الـ API الخاص بك جاهزاً للنسخ والتجربة المباشرة في تطبيقك. يمكنك اختيار جلسة محددة بإضافة <code>"session": "ID"</code>.</p></div>
  <div class="card"><div class="hd2"><h3>${ic('bolt')} مختبر تجربة الـ API المباشر (Tester)</h3><span class="badge">تجربة حية</span></div><p class="hint">أرسل طلباً حقيقياً من خلال المتصفح للتأكد من فاعلية الربط وسلامة ردود السيرفر فوراً.</p><label>رقم هاتف المستلم</label><input id="tph" class="phone" dir="ltr" placeholder="+9647XXXXXXXXX"><label>نص الرسالة</label><textarea id="tmsg" rows="3">${m}</textarea><button class="btn w" onclick="keyTest()">${ic('send')} إرسال رسالة تجريبية عبر الـ API</button><pre id="tres" class="c" style="display:none;margin-top:10px"></pre></div>`;
 else{const w=await api('/settings').then(x=>x.webhook);body=`<div class="card"><h3>${ic('hook')} إعدادات Webhook</h3><p class="hint">عند وصول رسالة جديدة لأي جلسة، نرسل طلب POST بصيغة JSON إلى الرابط أدناه.</p><label>رابط Webhook (https://...)</label><input id="whu" dir="ltr" value="${esc(w.url)}" placeholder="https://example.com/webhook"><label>السر (يُرسل في الترويسة X-Webhook-Secret)</label><input id="whs" dir="ltr" value="${esc(w.secret)}"><button class="btn" onclick="whSave()">حفظ</button></div>
 <div class="card dk"><div class="hd"><h3>${ic('code')}<span>شكل البيانات المُرسلة</span></h3></div><pre style="height:auto">{\n  "event": "message",\n  "session": "SESSION_ID",\n  "from": "9647xxxxxxxx",\n  "name": "اسم المرسل",\n  "text": "نص الرسالة",\n  "at": "2026-10-22T10:00:00.000Z"\n}</pre></div>`}
 main.innerHTML=banner()+`<div class="card"><div class="hd2"><h2 class="ch" style="font-size:22px;margin:0">${ic('code')} مركز المطورين والربط البرمجي (API Hub)</h2></div><p class="cd" style="font-size:14px">احصل على مفاتيح الربط، وأكواد التكامل السريعة، وإعدادات الـ Webhooks لربط متجرك ونظامك بسهولة.</p><div class="chips"><span class="badge ${on?'':'x'}">${on?'الواتساب متصل وجاهز للربط':'الواتساب غير متصل'}</span><span class="badge b">الباقة: ${esc(U.sub.name)}</span></div></div>
 <div class="tabs2"><button class="lt ${KT=='keys'?'on':''}" onclick="keyTab('keys')">${ic('key')} مفاتيح الربط والبدء السريع</button>${SELF()?'':`<button class="lt ${KT=='wh'?'on':''}" onclick="keyTab('wh')">${ic('hook')} إعدادات Webhook</button>`}</div>${body}`;
 if(KT=='keys')kc.textContent=S.cURL};
window.keyReset=A(async()=>{if(!confirm('سيتوقف المفتاح القديم عن العمل. متابعة؟'))return;await api('/key/regen','POST');await go('keys')});
window.keyTest=A(async()=>{const r=document.getElementById('tres');r.style.display='block';r.textContent='...';try{const j=await api('/send','POST',{phone:tph.value,message:tmsg.value});r.textContent=JSON.stringify(j,null,2);toast('تم الإرسال ✓')}catch(e){r.textContent=JSON.stringify({error:e.message},null,2);toast(e.message,false)}});
window.whSave=A(async()=>{await api('/settings','POST',{webhook:{url:whu.value,secret:whs.value}});toast('تم الحفظ ✓')});

/* --- الردود الآلية --- */
V.auto=async()=>{const [l,ses]=await Promise.all([api('/autoreplies'),api('/sessions')]);
 main.innerHTML=`<div class="card"><h2 class="ch">الردود الآلية</h2><p class="cd" style="font-size:14px">رد تلقائي على الرسائل الواردة عند احتوائها على كلمات مفتاحية. يعمل على الرسائل الخاصة فقط (وليس الجروبات).</p></div>
 ${SELF()?'':`<div class="card"><h3>قاعدة جديدة</h3><label>الكلمات المفتاحية (افصل بينها بفاصلة)</label><input id="ark" placeholder="السعر، كم سعر، price"><label>نص الرد (يمكن استخدام {name})</label><textarea id="arr" rows="3"></textarea>
 <div class="grid g2"><div><label>نوع المطابقة</label><select id="arm"><option value="contains">تحتوي على الكلمة</option><option value="exact">مطابقة تامة</option></select></div><div><label>الجلسة</label>${sel('ars',[['','كل الجلسات'],...ses.items.map(s=>[s.id,s.name])],'')}</div></div><button class="btn" onclick="arAdd()">${ic('plus')} إضافة</button></div>`}
 <div class="card tw"><table><tr><th>الكلمات</th><th>الرد</th><th>الحالة</th><th></th></tr>${l.map(r=>row([esc(r.keywords.join('، ')),`<small>${esc(r.reply.slice(0,80))}</small>`,`<span class="badge ${r.active?'':'x'}">${r.active?'مفعّل':'متوقف'}</span>`,SELF()?'':`<button class="btn g s" onclick="arTog('${r.id}')">${r.active?'إيقاف':'تفعيل'}</button> <button class="ib" onclick="arDel('${r.id}')">${ic('trash')}</button>`])).join('')||'<tr><td colspan="4">لا توجد قواعد</td></tr>'}</table></div>`};
window.arAdd=A(async()=>{await api('/autoreplies','POST',{keywords:ark.value,reply:arr.value,match:arm.value,sid:ars.value});toast('تمت الإضافة ✓');await V.auto()});
window.arTog=A(async id=>{await api(`/autoreplies/${id}/toggle`,'POST');await V.auto()});
window.arDel=A(async id=>{await api('/autoreplies/'+id,'DELETE');await V.auto()});

/* --- شات بوت الذكاء الاصطناعي --- */
V.ai=async()=>{const [s,ses]=await Promise.all([api('/settings'),api('/sessions')]),b=s.bot;
 main.innerHTML=`<div class="card"><h2 class="ch">شات بوت الذكاء الاصطناعي</h2><p class="cd" style="font-size:14px">يرد تلقائياً على عملائك بالذكاء الاصطناعي عبر مفتاح OpenRouter الخاص بك (يُضبط من <a href="#" onclick="go('settings');return false" style="color:var(--p);font-weight:700">الإعدادات</a>). تُطبَّق الردود الآلية بالكلمات المفتاحية أولاً، ثم البوت للباقي.</p>
 ${s.ai.hasKey?'':'<p class="warn">'+ic('warn')+' لم تُدخل مفتاح OpenRouter بعد.</p>'}
 <div class="card tg" style="margin-top:12px"><div><b>تفعيل البوت</b></div><label class="sw"><input type="checkbox" id="bot_on" ${b.enabled?'checked':''} ${SELF()?'disabled':''}><i></i></label></div>
 <label>الجلسة</label>${sel('bot_s',[['','كل الجلسات'],...ses.items.map(x=>[x.id,x.name])],b.sid)}
 <label>تعليمات البوت (من هو وكيف يرد)</label><textarea id="bot_p" rows="6" placeholder="أنت مساعد خدمة عملاء لمتجر ... أجب باختصار وبلغة العميل. إن لم تعرف الإجابة اطلب منه انتظار موظف.">${esc(b.prompt)}</textarea>
 ${SELF()?'':'<button class="btn" onclick="botSave()">حفظ</button>'}</div>`};
window.botSave=A(async()=>{await api('/settings','POST',{bot:{enabled:bot_on.checked,sid:bot_s.value,prompt:bot_p.value}});toast('تم الحفظ ✓')});

/* --- استخراج البيانات --- */
let GX={sid:'',tab:'contacts',contacts:[],groups:[],conv:[]};
const drawGx=()=>{const el=document.getElementById('gxb');if(!el)return;
 document.querySelectorAll('.gt').forEach(b=>b.classList.toggle('on',b.dataset.t==GX.tab));
 if(GX.tab=='contacts')el.innerHTML=`<div class="sh"><b>إجمالي جهات الاتصال <span class="badge b">${GX.contacts.length}</span></b><span><button class="btn g s" onclick="gxSaveC()">حفظ في أرقام العملاء</button> <button class="btn s" onclick="downloadCSV('contacts.csv',[['الاسم','الرقم'],...GX.contacts.map(c=>[c.name,c.phone])])">${ic('file')} تصدير CSV</button></span></div><div class="tw"><table><tr><th>#</th><th>جهة الاتصال</th><th>رقم الهاتف</th></tr>${GX.contacts.slice(0,300).map((c,i)=>row([i+1,esc(c.name),`<span dir="ltr">+${esc(c.phone)}</span>`])).join('')||'<tr><td colspan="3">لا توجد جهات اتصال. اختر جلسة واضغط "جلب البيانات".<br><small>ملاحظة: تظهر جهات الاتصال التي تزامنت مع الجلسة منذ الربط.</small></td></tr>'}</table></div>`;
 else if(GX.tab=='groups')el.innerHTML=`<div class="sh"><b>المجموعات <span class="badge b">${GX.groups.length}</span></b><button class="btn s" onclick="gxExportAll()">${ic('file')} تصدير كل الأعضاء CSV</button></div>${GX.groups.map((g,i)=>`<div class="card" style="margin:10px 0 0"><div class="sh"><div><b>${esc(g.name)||'(بدون اسم)'}</b><br><small style="color:var(--m)">${g.size} عضو${g.hidden?` • <span style="color:#d97706">${g.hidden} رقم مخفي (LID)</span>`:''}</small></div><span><button class="btn g s" onclick="gxSaveG(${i})">حفظ في أرقام العملاء</button> <button class="btn s" onclick="gxExportG(${i})">CSV</button></span></div></div>`).join('')||'<div class="card empty"><p>لا توجد مجموعات. اختر جلسة واضغط "جلب البيانات".</p></div>'}`;
 else el.innerHTML=`<label>الصق معرفات (JID/LID) واحداً في كل سطر</label><textarea id="gxi" rows="6" dir="ltr" placeholder="9647XXXXXXXXX@s.whatsapp.net"></textarea><button class="btn" onclick="gxConv()">تحويل</button>${GX.conv.length?`<div class="tw" style="margin-top:12px"><table><tr><th>المعرف</th><th>الرقم</th></tr>${GX.conv.map(c=>row([`<small dir="ltr">${esc(c.id)}</small>`,c.phone?`<span dir="ltr">+${esc(c.phone)}</span>`:'<span class="badge x">غير معروف</span>'])).join('')}</table></div><button class="btn s" style="margin-top:8px" onclick="downloadCSV('converted.csv',[['المعرف','الرقم'],...GX.conv.map(c=>[c.id,c.phone||''])])">تصدير CSV</button>`:''}`};
window.gxFetch=A(async()=>{GX.sid=gxs.value;if(!GX.sid)throw new Error('اختر جلسة متصلة');const [c,g]=await Promise.all([api(`/extract/${GX.sid}/contacts`).catch(()=>[]),api(`/extract/${GX.sid}/groups`)]);GX.contacts=c;GX.groups=g;drawGx();toast('تم جلب البيانات ✓')});
window.gxTab=t=>{GX.tab=t;drawGx()};
window.gxSaveC=A(async()=>{const r=await api('/contacts','POST',{items:GX.contacts});toast(`أُضيف ${r.added} • مكرر ${r.skipped} ✓`)});
window.gxSaveG=A(async i=>{const g=GX.groups[i],r=await api('/contacts','POST',{items:g.members.filter(m=>m.phone).map(m=>({phone:m.phone,name:'',group:g.name}))});toast(`أُضيف ${r.added} • مكرر ${r.skipped} ✓`)});
window.gxExportG=i=>{const g=GX.groups[i];downloadCSV('group-'+(g.name||i)+'.csv',[['الرقم','مشرف'],...g.members.map(m=>[m.phone||m.id,m.admin?'نعم':''])])};
window.gxExportAll=()=>downloadCSV('groups.csv',[['المجموعة','الرقم','مشرف'],...GX.groups.flatMap(g=>g.members.map(m=>[g.name,m.phone||m.id,m.admin?'نعم':'']))]);
window.gxConv=A(async()=>{GX.conv=await api('/extract/convert','POST',{ids:gxi.value.split('\n'),sid:GX.sid||undefined});drawGx()});
V.groups=async()=>{const ses=await api('/sessions'),on=ses.items.filter(s=>s.status=='connected');if(!GX.sid||!on.find(s=>s.id==GX.sid))GX.sid=on[0]?.id||'';
 main.innerHTML=`<div class="card"><h2 class="ch">استخراج البيانات</h2><p class="cd" style="font-size:14px">استخراج وإدارة جهات الاتصال والمجموعات من جلسات واتساب</p>
 <div class="row2">${sel('gxs',on.length?on.map(s=>[s.id,`${s.name} • +${s.phone}`]):[['','لا توجد جلسة متصلة']],GX.sid)}<button class="btn" onclick="gxFetch()">${ic('search')} جلب البيانات</button></div>
 <div class="tabs2" style="margin-top:12px"><button class="lt gt" data-t="contacts" onclick="gxTab('contacts')">جهات الاتصال</button><button class="lt gt" data-t="groups" onclick="gxTab('groups')">المجموعات</button><button class="lt gt" data-t="convert" onclick="gxTab('convert')">تحويل المعرفات</button></div></div><div class="card" id="gxb"></div>`;drawGx()};

/* --- حالة الاتصال --- */
V.health=async()=>{const r=await api('/sessions');clearInterval(poll);
 main.innerHTML=`<div class="card"><h2 class="ch">حالة استقرار الاتصال</h2><p class="cd" style="font-size:14px">${r.items.filter(s=>s.status=='connected').length} من ${r.items.length} جلسة متصلة</p></div>${r.items.map(s=>{const t=s.sent+s.failed,pc=t?Math.round(s.sent/t*100):100;return`<div class="card"><div class="sh"><h3 style="margin:0">${esc(s.name)} <small dir="ltr" style="color:var(--m)">${s.phone?'+'+esc(s.phone):''}</small></h3>${stBadge(s.status)}</div><div class="bar"><i style="width:${pc}%"></i></div><small style="color:var(--m)">نسبة النجاح ${pc}% • ${s.sent} ناجحة • ${s.failed} فاشلة${s.lastAt?' • آخر إرسال '+fmt(s.lastAt):''}</small></div>`}).join('')||`<div class="card empty"><div class="ic">${ic('bars')}</div><p>لا توجد جلسات</p></div>`}`;
 poll=setInterval(()=>V.health().catch(()=>{}),5000)};

/* --- الحسابات الفرعية --- */
V.team=async()=>{const l=await api('/subs');
 main.innerHTML=`<div class="card"><div class="sh"><div><h2 class="ch" style="font-size:22px">الحسابات الفرعية</h2><p class="cd" style="font-size:14px;margin:0">أنشئ حسابات فرعية بمفاتيح API مخصصة تستخدم جلساتك وباقتك بحدود شهرية تحددها</p></div><button class="btn s" onclick="subNew()">${ic('plus')} إنشاء حساب فرعي</button></div></div>
 <div class="card info"><h3>كيف تعمل الحسابات الفرعية؟</h3><ul><li>كل حساب فرعي له مفتاح API خاص به للاستخدام عبر API.</li><li>الحد الشهري للرسائل وOTP يُخصم من باقتك الرئيسية (0 = غير مسموح).</li><li>يمكن للحساب الفرعي الدخول للوحة بالبريد وكلمة المرور (صلاحيات محدودة).</li><li>يمكنك إيقاف أي حساب فرعي في أي وقت.</li></ul></div>
 ${l.map(u=>`<div class="card"><div class="sh"><div><h3 style="margin:0">${esc(u.name)}</h3><small dir="ltr" style="color:var(--m)">${esc(u.email)}</small></div><span class="badge ${u.disabled?'x':''}">${u.disabled?'موقوف':'نشط'}</span></div>
 <small style="color:var(--m)">الرسائل هذا الشهر: ${u.usage.msgs} / ${u.limits.msgs||0} • OTP: ${u.usage.otp} / ${u.limits.otp||0}</small><div class="idr"><span>KEY</span><code dir="ltr">${esc(u.apiKey.slice(0,14))}...</code><button class="ib" onclick="copy('${esc(u.apiKey)}')">${ic('copy')}</button></div>
 <div class="row2"><button class="btn g s" onclick="subTog('${u.id}')">${u.disabled?'تفعيل':'إيقاف'}</button><button class="btn g s" style="color:#b91c1c" onclick="subDel('${u.id}')">${ic('trash')} حذف</button></div></div>`).join('')||`<div class="card empty"><div class="ic">${ic('uc')}</div><h3>لا توجد حسابات فرعية حتى الآن</h3><p>ابدأ بإنشاء أول حساب فرعي.</p></div>`}`};
window.subNew=()=>{const m=modal(`<h3>إنشاء حساب فرعي</h3><label>اسم الحساب الفرعي *</label><input id="sn" placeholder="مثال: فريق المبيعات"><div class="grid g2"><div><label>حد الرسائل الشهري</label><input id="sm" type="number" min="0" value="0"></div><div><label>حد OTP الشهري</label><input id="so" type="number" min="0" value="0"></div></div><p class="hint">0 تعني عدم السماح باستخدام الميزة للحساب الفرعي.</p><label>البريد الإلكتروني *</label><input id="se" dir="ltr" placeholder="sub@example.com"><label>كلمة المرور *</label><input id="sp" type="password" dir="ltr" placeholder="6 أحرف على الأقل"><div class="row2"><button class="btn w" id="ssv">إنشاء</button><button class="btn g w" onclick="closeM(this)">إلغاء</button></div>`);
 m.querySelector('#ssv').onclick=A(async()=>{await api('/subs','POST',{name:sn.value,email:se.value,password:sp.value,msgs:+sm.value,otp:+so.value});m.remove();toast('تم الإنشاء ✓');await V.team()})};
window.subTog=A(async id=>{await api(`/subs/${id}/toggle`,'POST');await V.team()});
window.subDel=A(async id=>{if(!confirm('حذف الحساب الفرعي؟'))return;await api('/subs/'+id,'DELETE');await V.team()});

/* --- الاشتراكات --- */
let PER='monthly';
const pnum=p=>parseFloat(String(p.price).replace(/[^\d.]/g,''))||0;
window.setPer=p=>{PER=p;V.sub()};
window.planBuy=A(async id=>{const p=PL.plans.find(x=>x.id==id),c=pnum(p)*(PER=='yearly'?12*.8:1);if(!confirm(`سيتم خصم ${iqd(c)} من رصيد المحفظة وتفعيل ${p.name}. متابعة؟`))return;await api('/wallet/buy','POST',{planId:id,period:PER});toast('تم التفعيل ✓');await go('sub')});
window.planReq=A(async id=>{await api('/request','POST',{planId:id,note:prompt('رقم هاتفك / رقم عملية الدفع (اختياري)')||''});toast('تم إرسال الطلب، سيتم التفعيل بعد التأكيد ✓')});
V.sub=async()=>{const s=U.sub,pl=await api('/plans');PL=pl;
 main.innerHTML=`<h2 class="ch">إدارة الاشتراكات</h2><p class="cd">تحكم في باقتك وتابع استهلاكك</p>
 <div class="tabs2"><button class="lt ${PER=='monthly'?'on':''}" onclick="setPer('monthly')">شهري</button><button class="lt ${PER=='yearly'?'on':''}" onclick="setPer('yearly')">سنوي <span class="badge">وفر 20%</span></button></div>
 <div class="card"><h3>الاشتراك الحالي</h3><span class="badge ${s.active?'':'x'}">${esc(s.name)}</span> ${s.expires?`<small style="color:var(--m)">ينتهي ${fmt(s.expires)}</small>`:''}<div class="bar"><i style="width:${Math.min(100,s.used/s.limit*100||0)}%"></i></div><small style="color:var(--m)">${s.used} / ${s.type=='admin'?'∞':s.limit} ${s.type=='paid'?'رسالة اليوم':'رسالة'}</small></div>
 <h2 class="ch" style="font-size:22px;text-align:center;margin-top:20px">اختر خطتك المثالية</h2>
 <div class="grid g3">${pl.plans.map((p,i)=>{const n=pnum(p),yr=PER=='yearly',price=n?(yr?n*12*.8:n):0;return`<div class="card plan ${i==1?'hot':''}"><h3>${esc(p.name)}</h3><div class="pr">${price?iqd(price):esc(p.price)}</div><small style="color:var(--m)">${yr?'/ سنة':'/ شهر'}</small><ul><li>${p.days*(yr?12:1)} يوم</li><li>${p.daily.toLocaleString('ar-EG')} رسالة يومياً</li><li>${p.sessions} جلسة واتساب</li><li>API وOTP وحملات</li></ul>${SELF()?'':`<button class="btn w" onclick="planBuy('${p.id}')">${ic('wallet')} اشترك من المحفظة</button><button class="btn o w" style="margin-top:8px" onclick="planReq('${p.id}')">طلب تفعيل (دفع خارجي)</button>`}</div>`}).join('')}</div>
 ${pl.support?`<div class="card" style="text-align:center">للدفع والتفعيل السريع تواصل معنا<br><br><a class="btn" href="https://wa.me/${esc(pl.support.replace(/\D/g,''))}" target="_blank">تواصل عبر واتساب</a></div>`:''}`};

/* --- المحفظة --- */
V.wallet=async()=>{const w=await api('/wallet');
 main.innerHTML=`<h2 class="ch">المحفظة الإلكترونية</h2><p class="cd">اشحن رصيد محفظتك لتجديد اشتراكاتك بسهولة</p>
 <div class="card wal"><small>رصيدك الحالي</small><div class="amt">${iqd(w.balance)}</div>${w.pending?`<span class="pillw">لديك ${w.pending} طلب شحن قيد المراجعة</span>`:'<span class="pillw">المحفظة نشطة وجاهزة للتجديد</span>'}</div>
 <div class="card"><h3>شحن رصيد المحفظة</h3><label>اختر قيمة الشحن</label><div class="grid g2">${[10000,25000,50000,100000,250000,500000].map(a=>`<button class="btn g" onclick="wlAmt.value=${a}">${iqd(a)}</button>`).join('')}</div><label>قيمة مخصصة (د.ع)</label><input id="wlAmt" type="number" min="1000" step="500" dir="ltr"><label>رقم عملية الدفع / ملاحظة</label><input id="wlNote"><button class="btn w" onclick="wlTop()">إرسال طلب الشحن</button><p class="hint">بعد إرسال الطلب حوّل المبلغ حسب تعليمات الدعم، وسيُضاف الرصيد بعد تأكيد الإدارة.</p></div>
 <div class="card tw"><h3>سجل العمليات</h3><table><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th></tr>${w.txns.map(t=>row([fmt(t.at),{topup:'شحن',purchase:'اشتراك',adjust:'تعديل'}[t.type]||t.type,`<b style="color:${t.amount<0?'#b91c1c':'#15803d'}" dir="ltr">${t.amount>0?'+':''}${iqd(t.amount)}</b>`,esc(t.note)])).join('')||'<tr><td colspan="4">لا توجد عمليات</td></tr>'}</table></div>`};
window.wlTop=A(async()=>{await api('/wallet/topup','POST',{amount:+wlAmt.value,note:wlNote.value});toast('تم إرسال طلب الشحن ✓');await V.wallet()});

/* --- الدعم --- */
V.help=()=>{main.innerHTML=`<div class="card empty"><div class="ic">${ic('help')}</div><h3>الدعم الفني والمساعدة</h3><p>فريقنا جاهز لمساعدتك عبر واتساب.</p>${PL.support?`<a class="btn" target="_blank" href="https://wa.me/${esc(PL.support.replace(/\D/g,''))}">تواصل عبر واتساب</a>`:'<p class="hint">لم يُضبط رقم الدعم بعد.</p>'}</div>`};

/* --- الإعدادات --- */
V.settings=async()=>{const s=await api('/settings');
 main.innerHTML=`<h2 class="ch">الإعدادات</h2><p class="cd">إدارة حسابك وتفضيلات النظام</p>
 <div class="card"><h3>${ic('uc')} معلومات الملف الشخصي</h3><label>الاسم الكامل</label><input id="sn1" value="${esc(s.name)}"><label>البريد الإلكتروني</label><input value="${esc(s.email)}" readonly dir="ltr" style="background:var(--bg)"><label>رقم الهاتف</label><input id="sp1" class="phone" dir="ltr" value="${esc(s.phone)}">
 ${SELF()?'':`<label>رقم هاتف الإشعارات (واتساب)</label><input id="sn2" class="phone" dir="ltr" placeholder="+9647XXXXXXXXX" value="${esc(s.notifyPhone)}"><p class="hint">${ic('bell')} سيتم إرسال تنبيهات انفصال الجلسات لهذا الرقم (عبر جلسة متصلة أخرى)</p>
 <h3 style="margin-top:20px">${ic('bolt')} إعدادات الذكاء الاصطناعي</h3><label>AI Provider (مزود الخدمة)</label><select disabled><option>OpenRouter (شامل)</option></select><label>OpenRouter API Key</label><input id="aik" dir="ltr" placeholder="${s.ai.hasKey?s.ai.keyMask:'sk-or-v1-...'}"><label>Model (الموديل)</label><input id="aim" dir="ltr" placeholder="مثال: meta-llama/llama-3.1-8b-instruct:free" value="${esc(s.ai.model)}">
 <div class="card" style="background:#faf5ff;border-color:#e9d5ff;box-shadow:none"><div class="sh"><b>مدى قوة تغيير الرسالة (الذكاء الاصطناعي)</b><span class="badge b" id="ais">${s.ai.strength}%</span></div><input type="range" id="ait" min="0" max="100" value="${s.ai.strength}" oninput="ais.textContent=this.value+'%'" style="padding:0"><div class="sh"><small>تغيير طفيف (دقيق)</small><small>تغيير كبير (إبداعي)</small></div></div>
 <button class="btn g s" onclick="aiTest()">${ic('check')} اختبار اتصال الذكاء الاصطناعي</button>`}
 <div style="margin-top:14px"><button class="btn" onclick="setSave()">تحديث البيانات</button></div></div>
 <div class="card"><h3>${ic('lock')} تغيير كلمة المرور</h3><label>كلمة المرور الحالية</label><input id="pw0" type="password" dir="ltr"><label>كلمة المرور الجديدة</label><input id="pw1" type="password" dir="ltr"><button class="btn o" onclick="pwSave()">تغيير كلمة المرور</button></div>`};
window.setSave=A(async()=>{const b={name:sn1.value,phone:sp1.value};if(!SELF())Object.assign(b,{notifyPhone:sn2.value,ai:{key:aik.value||undefined,model:aim.value,strength:+ait.value}});await api('/settings','POST',b);toast('تم الحفظ ✓');U=await api('/me')});
window.aiTest=A(async()=>{await setSave();const r=await api('/ai/test','POST');toast(`الاتصال ناجح ✓ (${r.ms}ms)`)});
window.pwSave=A(async()=>{await api('/me/password','POST',{old:pw0.value,next:pw1.value});pw0.value=pw1.value='';toast('تم تغيير كلمة المرور ✓')});
