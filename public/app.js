/* ===== أقسام لوحة المستخدم ===== */
const A=f=>async(...a)=>{try{await f(...a)}catch(e){toast(e.message,false)}};
const SELF=()=>U&&U.isSub;
function modal(html){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="card" style="max-width:520px;max-height:90vh;overflow:auto">${html}</div>`;m.onclick=e=>{if(e.target==m)m.remove()};document.body.appendChild(m);return m}
const closeM=el=>el.closest('.modal').remove();
const stBadge=s=>`<span class="badge ${{connected:'',qr:'y',connecting:'y',idle:'x'}[s]??'x'}">${{connected:'متصل',qr:'بانتظار المسح',connecting:'جارٍ الاتصال...',idle:'غير متصل'}[s]||s}</span>`;
const sel=(id,opts,cur)=>`<select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}" ${o[0]==cur?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`;
const copyId=t=>{copy(t)};

/* --- قراءة ملفات Excel / CSV --- */
function loadXLSX(){return window.XLSX?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=()=>no(new Error('تعذر تحميل مكتبة Excel. استخدم ملف CSV'));document.head.appendChild(s)})}
function parseCSV(t){return t.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim()).map(l=>{const o=[];let cur='',q=false;for(const ch of l){if(ch=='"')q=!q;else if((ch==','||ch==';'||ch=='\t')&&!q){o.push(cur.trim());cur=''}else cur+=ch}o.push(cur.trim());return o})}
async function readRows(file){if(/\.(xlsx|xls)$/i.test(file.name)){await loadXLSX();const wb=XLSX.read(await file.arrayBuffer());return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''})}return parseCSV(await file.text())}
function rowsToItems(rows){rows=rows.filter(r=>r&&r.some(x=>String(x).trim()));if(!rows.length)return[];let map={name:-1,phone:-1,group:-1};const h=rows[0].map(x=>String(x).toLowerCase());
 h.forEach((x,i)=>{if(/اسم|name/.test(x))map.name=i;else if(/هاتف|رقم|phone|mobile|number|whatsapp/.test(x))map.phone=i;else if(/مجموع|group/.test(x))map.group=i});
 if(map.phone>=0||map.name>=0||map.group>=0){rows=rows.slice(1)}else{const d=x=>String(x).replace(/\D/g,'').length>=8;map=d(rows[0][0])?{phone:0,name:1,group:2}:{name:0,phone:1,group:2}}
 if(map.phone<0)map.phone=map.name==0?1:0;
 return rows.map(r=>({phone:String(r[map.phone]||'').replace(/\D/g,''),name:map.name>=0?String(r[map.name]||'').trim():'',group:map.group>=0?String(r[map.group]||'').trim():''})).filter(x=>x.phone.length>7)}
function pickFile(cb){const i=document.createElement('input');i.type='file';i.accept='.csv,.xlsx,.xls,.txt';i.onchange=A(async()=>{if(i.files[0])cb(rowsToItems(await readRows(i.files[0])))});i.click()}
function downloadCSV(name,rows){const csv='﻿'+rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}

/* --- لوحة التحكم --- */
V.dash=async()=>{const s=await api('/stats'),b=U.sub,pc=Math.min(100,b.used/b.limit*100||0);
 main.innerHTML=banner()+`<div class="grid g4"><div class="card stat"><div class="ic">${ic('send')}</div><div><b>${s.today}</b><span>رسائل اليوم</span></div></div><div class="card stat"><div class="ic">${ic('check')}</div><div><b>${s.total}</b><span>إجمالي المرسل</span></div></div><div class="card stat"><div class="ic">${ic('shield')}</div><div><b>${s.otp}</b><span>رسائل OTP</span></div></div><div class="card stat"><div class="ic">${ic('users')}</div><div><b>${s.contacts}</b><span>جهات الاتصال</span></div></div></div>
 <div class="grid g2" style="margin-top:16px"><div class="card"><h3>حالة واتساب</h3><span class="badge ${s.connected?'':'x'}">${s.connected?`متصل • ${s.connected} من ${s.sessions} جلسة`:'غير متصل'}</span><br><br>${s.connected?'':'<button class="btn s" onclick="go(\'qr\')">ربط الآن</button>'}</div>
 <div class="card"><h3>باقتك: ${esc(b.name)}</h3>${b.type=='admin'?'<span class="badge b">صلاحيات كاملة</span>':`<div class="bar"><i style="width:${pc}%"></i></div><small style="color:var(--m)">${b.used} / ${b.limit} ${b.type=='paid'?'رسالة اليوم':'رسالة تجريبية'}${b.expires?' • ينتهي '+day(b.expires):''}</small>`}</div></div>`};

/* --- ربط واتساب (جلسات متعددة) --- */
let SS={items:[],max:1};
const sessCard=s=>`<div class="card sess ${s.status=='connected'?'ok':''}"><div class="sh"><div><h3 style="margin:0">${esc(s.name)}</h3><div class="ph" dir="ltr">${s.phone?'+'+esc(s.phone):'—'}</div></div>${stBadge(s.status)}</div>
 ${s.isDefault?'<span class="badge y">⭐ الحساب الافتراضي</span>':''}
 <div class="idr"><span>ID</span><code dir="ltr">${s.id}</code><button class="ib" onclick="copyId('${s.id}')">${ic('copy')}</button></div>
 <small style="color:var(--m);display:block;margin:8px 0">تم الإنشاء: ${day(s.at)}${s.lastAt?' • آخر إرسال: '+fmt(s.lastAt):''}</small>
 ${s.qr?`<div style="text-align:center;margin:10px 0"><img src="${s.qr}" width="240" alt="QR" style="border-radius:12px;border:1px solid var(--b)"><p class="hint">افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز</p></div>`:''}
 <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0"><div class="mini g"><b>${s.sent}</b>ناجحة</div><div class="mini r"><b>${s.failed}</b>فاشلة</div><div class="mini"><b>${s.sent+s.failed}</b>إجمالي</div></div>
 <div class="row2">${s.status=='idle'?`<button class="btn w" onclick="sessAct('${s.id}','connect')">${ic('plug')} بدء الاتصال</button>`:`<button class="btn r w" style="background:#fee2e2;color:#b91c1c" onclick="sessAct('${s.id}','stop')">${ic('plug')} إيقاف الاتصال</button>`}</div>
 <div class="row2"><button class="btn g w" onclick="sessAct('${s.id}','logout','تسجيل الخروج من واتساب لهذه الجلسة؟')">تسجيل خروج</button>${s.isDefault?'':`<button class="btn g w" onclick="sessAct('${s.id}','default')">تعيين كافتراضي</button>`}<button class="btn g w" style="color:#b91c1c" onclick="sessDel('${s.id}')">${ic('trash')} حذف</button></div></div>`;
const drawSess=()=>{const el=document.getElementById('sl');if(!el)return;el.innerHTML=SS.items.map(sessCard).join('')||`<div class="card empty"><div class="ic">${ic('qr')}</div><h3>لا توجد جلسات</h3><p>أضف جلسة جديدة ثم امسح رمز QR لربط رقمك.</p></div>`;const c=document.getElementById('sc');if(c)c.textContent=`${SS.items.filter(s=>s.status=='connected').length} / ${SS.max}`};
const loadSess=async()=>{SS=await api('/sessions');drawSess()};
window.sessAct=A(async(id,a,c)=>{if(c&&!confirm(c))return;await api(`/sessions/${id}/${a}`,'POST');await sleepMs(a=='connect'?1200:200);await loadSess()});
window.sessDel=A(async id=>{if(!confirm('حذف الجلسة نهائياً؟'))return;await api('/sessions/'+id,'DELETE');await loadSess()});
window.sessAdd=A(async()=>{const n=prompt('اسم الجلسة (مثال: العراق أولاً)');if(n===null)return;await api('/sessions','POST',{name:n});await sleepMs(1500);await loadSess()});
V.qr=async()=>{main.innerHTML=banner()+`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px"><div><h2 class="ch" style="margin:0">ربط WhatsApp</h2><p class="cd" style="margin:4px 0 0">إدارة جلسات الواتساب المتصلة</p></div><div style="text-align:center"><small style="color:var(--m)">جلسات نشطة</small><div id="sc" style="font-size:28px;font-weight:800;color:#2563eb">0 / 1</div></div></div>
 ${SELF()?'':`<button class="btn" style="margin-bottom:14px" onclick="sessAdd()">${ic('plus')} إضافة جلسة جديدة</button>`}<div id="sl"></div>
 <div class="card info"><h3>ℹ️ تعليمات بسيطة</h3><ul><li>يمكنك ربط أكثر من رقم واتساب حسب خطة اشتراكك.</li><li>لإضافة رقم جديد اضغط على "إضافة جلسة جديدة".</li><li>امسح رمز QR الذي سيظهر باستخدام الرقم الذي تريد ربطه.</li><li>تأكد من بقاء الهاتف متصلاً بالإنترنت لضمان استمرار الخدمة.</li></ul></div>`;
 await loadSess();poll=setInterval(()=>loadSess().catch(()=>{}),3000)};

/* --- إعدادات منع الحظر --- */
window.banModal=A(async()=>{const s=await api('/settings'),b=s.ban,m=modal(`<h3>🛡️ إعدادات منع الحظر</h3><p class="hint">تُطبَّق على الحملات الجديدة. فواصل عشوائية وراحة بين الدفعات تقلل خطر الحظر.</p>
 <div class="grid g2"><div><label>أقل فاصل (ثانية)</label><input id="bmin" type="number" min="1" value="${b.delayMin}"></div><div><label>أقصى فاصل (ثانية)</label><input id="bmax" type="number" min="1" value="${b.delayMax}"></div>
 <div><label>راحة كل (رسالة)</label><input id="bb" type="number" min="0" value="${b.batch}"></div><div><label>مدة الراحة (ثانية)</label><input id="bp" type="number" min="0" value="${b.batchPause}"></div></div>
 <div class="row2"><button class="btn w" id="bsv">حفظ</button><button class="btn g w" onclick="closeM(this)">إلغاء</button></div>`);
 m.querySelector('#bsv').onclick=A(async()=>{await api('/settings','POST',{ban:{delayMin:+bmin.value,delayMax:+bmax.value,batch:+bb.value,batchPause:+bp.value}});m.remove();toast('تم الحفظ ✓')})});

/* --- إرسال الحملات والرسائل --- */
let MV=[],SM='manual',CT=[];
window.msgsModal=()=>{const m=modal(`<h3>تعدد الرسائل</h3><p class="hint">أضف من 3 إلى 50 رسالة مختلفة: يختار النظام واحدة عشوائياً لكل مستلم لتقليل الحظر. استخدم {name} لاسم جهة الاتصال.</p><div id="mvl"></div><button class="btn g s" id="mva">${ic('plus')} إضافة رسالة</button><div class="row2" style="margin-top:14px"><button class="btn w" id="mvs">حفظ</button><button class="btn g w" onclick="closeM(this)">إلغاء</button></div>`);
 const draw=()=>{mvl.innerHTML=MV.map((x,i)=>`<div style="display:flex;gap:6px;align-items:flex-start"><textarea rows="2" data-i="${i}">${esc(x)}</textarea><button class="ib" data-d="${i}">${ic('x')}</button></div>`).join('');mvl.querySelectorAll('textarea').forEach(t=>t.oninput=()=>MV[+t.dataset.i]=t.value);mvl.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{MV.splice(+b.dataset.d,1);draw()})};
 draw();mva.onclick=()=>{if(MV.length<50){MV.push('');draw()}};mvs.onclick=()=>{MV=MV.map(x=>x.trim()).filter(Boolean);m.remove();const b=document.getElementById('mvb');if(b)b.textContent=`تعدد الرسائل (${MV.length})`}};
window.importRecipients=()=>pickFile(items=>{if(!items.length)return toast('لا توجد أرقام صالحة في الملف',false);const t=document.getElementById('rcp');t.value=(t.value.trim()?t.value.trim()+'\n':'')+items.map(x=>x.phone+(x.name?','+x.name:'')).join('\n');rcCount();toast(`تم استيراد ${items.length} رقم ✓`)});
window.rcCount=()=>{const t=document.getElementById('rcp');if(t)document.getElementById('rcn').textContent=t.value.split('\n').filter(l=>l.replace(/\D/g,'').length>7).length+' مستلم'};
window.setMode=m=>{SM=m;document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m==m));drawRc()};
const groupsOf=()=>[...new Set(CT.map(c=>c.group).filter(Boolean))];
function drawRc(){const el=document.getElementById('rcbox');if(!el)return;
 if(SM=='manual')el.innerHTML=`<div style="display:flex;justify-content:space-between"><label>المستلمون *</label><small id="rcn" style="color:var(--m)">0 مستلم</small></div><textarea id="rcp" rows="6" dir="ltr" oninput="rcCount()" placeholder="+1234567890&#10;+9876543210,أحمد&#10;1122334455"></textarea><p class="hint">رقم هاتف واحد في كل سطر بالتنسيق الدولي (يمكن إضافة الاسم بعد فاصلة لاستخدام {name})، أو استورد من Excel.</p>`;
 else if(SM=='contact')el.innerHTML=`<label>جهة الاتصال *</label>${sel('rcs',[['','— اختر —'],...CT.map(c=>[c.id,`${c.name||'بدون اسم'} • ${c.phone}`])],'')}`;
 else if(SM=='group')el.innerHTML=`<label>المجموعة *</label>${sel('rcs',[['','— اختر —'],...groupsOf().map(g=>[g,`${g} (${CT.filter(c=>c.group==g).length})`])],'')}${groupsOf().length?'':'<p class="hint">لا توجد مجموعات. أضف عمود "المجموعة" عند استيراد جهات الاتصال.</p>'}`;
 else el.innerHTML=`<p class="hint" style="font-size:14px">سيتم الإرسال لجميع جهات الاتصال المحفوظة: <b>${CT.length}</b></p>`}
const recipients=()=>{if(SM=='manual')return document.getElementById('rcp').value.split('\n').map(l=>{const [p,...n]=l.split(/[,;\t]/);return{phone:(p||'').replace(/\D/g,''),name:n.join(' ').trim()}}).filter(x=>x.phone.length>7);
 if(SM=='contact'){const c=CT.find(x=>x.id==rcs.value);return c?[{phone:c.phone,name:c.name}]:[]}
 if(SM=='group')return rcs.value?CT.filter(c=>c.group==rcs.value).map(c=>({phone:c.phone,name:c.name})):[];
 return CT.map(c=>({phone:c.phone,name:c.name}))};
window.sendCampaign=A(async()=>{const rc=recipients();if(!rc.length)throw new Error('أضف مستلماً واحداً على الأقل');
 const msgs=[cmsg.value.trim(),...MV.map(x=>x.trim())].filter(Boolean);if(!msgs.length)throw new Error('اكتب الرسالة');
 const body={name:cnm.value.trim()||'حملة '+new Date().toLocaleDateString('ar-EG'),messages:msgs,recipients:rc,session:csn.value,ai:cai.checked};
 if(csc.checked){if(!csd.value)throw new Error('حدد وقت الجدولة');body.scheduledAt=new Date(csd.value).toISOString()}
 if(rc.length>1&&!confirm(`سيتم الإرسال إلى ${rc.length} مستلم. متابعة؟`))return;
 await api('/campaigns','POST',body);toast(body.scheduledAt?'تمت جدولة الحملة ✓':'بدأت الحملة ✓');go('track')});
V.send=async()=>{const [ses,ct,st]=await Promise.all([api('/sessions'),api('/contacts'),api('/settings')]);CT=ct.items;SM='manual';MV=[];
 main.innerHTML=banner()+`<div class="card"><h2 class="ch">إرسال الرسائل</h2>
 <div class="chips"><button class="btn g s" id="mvb" onclick="msgsModal()">تعدد الرسائل (0)</button><button class="btn g s" onclick="banModal()">إعدادات منع الحظر</button><button class="btn g s" onclick="importRecipients()">استيراد Excel</button></div>
 <p class="cd" style="font-size:14px">أرسل رسائل WhatsApp لمستلم واحد أو عدة مستلمين. استخدم {name} في رسالتك لتخصيصها.</p>
 <div class="card" style="background:var(--bg);box-shadow:none"><label>وضع الإرسال:</label><div id="modes" class="modes"><button data-m="manual" class="on" onclick="setMode('manual')">إدخال يدوي</button><button data-m="contact" onclick="setMode('contact')">جهة اتصال واحدة</button><button data-m="group" onclick="setMode('group')">مجموعة</button><button data-m="all" onclick="setMode('all')">جميع جهات الاتصال</button></div></div>
 <div id="rcbox"></div>
 <label>اسم الحملة (اختياري)</label><input id="cnm">
 <label>الرسالة *</label><textarea id="cmsg" rows="6" placeholder="أدخل رسالتك هنا... استخدم {name} لتخصيص الرسالة باسم جهة الاتصال"></textarea>
 <label>رقم المرسل (اختياري)</label>${sel('csn',[['','تلقائي (استخدم الحساب الافتراضي)'],...ses.items.map(s=>[s.id,`${s.name}${s.phone?' • +'+s.phone:''}${s.status!='connected'?' (غير متصل)':''}`])],'')}
 <div class="card tg"><div><b>${ic('bolt')} إعادة صياغة الرسالة بالذكاء الاصطناعي (Anti-Spam)</b><p class="hint" style="margin:4px 0 0">يعيد صياغة رسالتك لكل مستلم بشكل فريد لتجنب الحظر، اعتماداً على إعدادات OpenRouter الخاصة بك ${st.ai.hasKey?'':'<b style="color:#b45309">(لم تُدخل المفتاح بعد — من الإعدادات)</b>'}.</p></div><label class="sw"><input type="checkbox" id="cai" ${st.ai.hasKey?'':'disabled'}><i></i></label></div>
 <div class="card"><label style="display:flex;gap:10px;align-items:center;margin:0"><input type="checkbox" id="csc" style="width:auto;margin:0" onchange="csd.classList.toggle('hide',!this.checked)">جدولة الحملة للإرسال لاحقاً</label><input type="datetime-local" id="csd" class="hide"></div>
 <button class="btn w" style="padding:14px" onclick="sendCampaign()">إرسال الرسائل</button></div>
 <div class="card info"><h3>💡 نصائح</h3><ul><li>استخدم {name} في رسالتك لتخصيصها باسم كل جهة اتصال.</li><li>أضف من 3 إلى 50 رسالة مختلفة لتفعيل التبديل التلقائي بين الرسائل (ميزة منع الحظر).</li><li>اختر "جهة اتصال واحدة" لإرسال رسالة لعميل محدد، أو "مجموعة" / "جميع جهات الاتصال" للإرسال الجماعي.</li><li>تُرسل الحملة بفواصل زمنية عشوائية وتأخذ راحة بين الدفعات حسب إعدادات منع الحظر.</li></ul></div>`;drawRc()};

/* --- متابعة الحملات --- */
const CST={running:['جارية','y'],scheduled:['مجدولة','b'],paused:['متوقفة','x'],done:['مكتملة',''],cancelled:['ملغاة','x']};
let CF='';
const campCard=c=>{const pc=c.total?Math.round(c.idx/c.total*100):0,s=CST[c.status]||[c.status,''];return `<div class="card"><div class="sh"><h3 style="margin:0">${esc(c.name)}</h3><span class="badge ${s[1]}">${s[0]}</span></div>
 <div class="bar"><i style="width:${pc}%"></i></div><small style="color:var(--m)">${c.idx} / ${c.total} (${pc}%) • ناجحة ${c.sent} • فاشلة ${c.failed}${c.msgCount>1?' • '+c.msgCount+' رسائل متبدلة':''}${c.ai?' • AI':''}</small>
 ${c.scheduledAt&&c.status=='scheduled'?`<br><small style="color:var(--m)">🕒 ${fmt(c.scheduledAt)}</small>`:''}${c.err&&c.status!='done'?`<p class="warn" style="margin:8px 0 0">${esc(c.err)}</p>`:''}
 <div class="row2" style="margin-top:10px">${c.status=='running'||c.status=='scheduled'?`<button class="btn g s" onclick="campAct('${c.id}','pause')">${ic('pause')} إيقاف مؤقت</button>`:''}${c.status=='paused'?`<button class="btn s" onclick="campAct('${c.id}','resume')">${ic('play')} استئناف</button>`:''}${['running','paused','scheduled'].includes(c.status)?`<button class="btn g s" onclick="campAct('${c.id}','cancel','إلغاء الحملة نهائياً؟')">${ic('stop')} إلغاء</button>`:`<button class="btn g s" style="color:#b91c1c" onclick="campDel('${c.id}')">${ic('trash')} حذف</button>`}</div></div>`};
window.campAct=A(async(id,a,c)=>{if(c&&!confirm(c))return;await api(`/campaigns/${id}/${a}`,'POST');await V.track()});
window.campDel=A(async id=>{await api('/campaigns/'+id,'DELETE');await V.track()});
V.track=async()=>{clearInterval(poll);const l=await api('/campaigns'),v=CF?l.filter(c=>c.status==CF):l;
 main.innerHTML=banner()+`<div class="card"><h2 class="ch">حملات الإرسال</h2><p class="cd" style="font-size:14px">تتبع وتحكم في حملات الرسائل الجماعية</p><div class="chips"><button class="btn s" onclick="go('send')">${ic('plus')} حملة جديدة</button><button class="btn g s" onclick="banModal()">${ic('shield')} منع الحظر</button></div></div>
 <select id="cfl" onchange="CF=this.value;V.track()"><option value="">جميع العمليات</option>${Object.entries(CST).map(([k,x])=>`<option value="${k}" ${k==CF?'selected':''}>${x[0]}</option>`).join('')}</select>
 ${v.map(campCard).join('')||`<div class="card empty"><div class="ic">${ic('send')}</div><h3>لا توجد عمليات حالياً</h3><p>ابدأ حملة جديدة من قسم الإرسال.</p></div>`}`;
 if(l.some(c=>c.status=='running'||c.status=='scheduled'))poll=setInterval(()=>V.track().catch(()=>{}),5000)};

/* --- جهات الاتصال --- */
let CQ='',CG='';
const drawCt=()=>{const q=CQ.toLowerCase(),l=CT.filter(c=>(!CG||c.group==CG)&&(!q||(c.name+' '+c.phone).toLowerCase().includes(q)));
 document.getElementById('ctl').innerHTML=`<table><tr><th>الاسم</th><th>الرقم</th><th>المجموعة</th><th></th></tr>${l.slice(0,500).map(c=>row([esc(c.name),`<span dir="ltr">+${esc(c.phone)}</span>`,esc(c.group),`<button class="ib" onclick="ctDel('${c.id}')">${ic('trash')}</button>`])).join('')||'<tr><td colspan="4">لا توجد جهات اتصال</td></tr>'}</table>${l.length>500?`<small style="color:var(--m)">يعرض أول 500 من ${l.length}</small>`:''}`};
window.ctDel=A(async id=>{await api('/contacts/'+id,'DELETE');CT=CT.filter(c=>c.id!=id);drawCt();document.getElementById('cnt').textContent=CT.length});
window.ctImport=()=>pickFile(A(async items=>{if(!items.length)throw new Error('لا توجد أرقام صالحة في الملف');const r=await api('/contacts','POST',{items});toast(`أُضيف ${r.added} • مكرر ${r.skipped} ✓`);await V.contacts()}));
window.ctAdd=()=>{const m=modal(`<h3>إضافة جهة اتصال</h3><label>الاسم</label><input id="an"><label>الرقم (دولي)</label><input id="ap2" dir="ltr" placeholder="+9647..."><label>المجموعة (اختياري)</label><input id="ag"><div class="row2"><button class="btn w" id="asv">إضافة</button><button class="btn g w" onclick="closeM(this)">إلغاء</button></div>`);
 m.querySelector('#asv').onclick=A(async()=>{await api('/contacts','POST',{name:an.value,phone:ap2.value,group:ag.value});m.remove();await V.contacts()})};
window.ctClear=A(async()=>{if(!confirm('حذف كل جهات الاتصال نهائياً؟'))return;await api('/contacts','DELETE');await V.contacts()});
V.contacts=async()=>{const r=await api('/contacts');CT=r.items;CQ='';CG='';
 main.innerHTML=`<div class="card"><div class="sh"><div><h2 class="ch" style="font-size:22px">أرقام العملاء</h2><p class="cd" style="margin:0;font-size:14px">إدارة أرقام هواتف العملاء لإرسال الرسائل</p></div><span class="badge b">الأرقام المحفوظة: <span id="cnt">${CT.length}</span> / ${r.max.toLocaleString()}</span></div>
 <div class="chips" style="margin-top:12px"><button class="btn s" onclick="ctAdd()">${ic('plus')} إضافة جهة اتصال</button><button class="btn g s" onclick="ctImport()">${ic('upload')} استيراد Excel/CSV</button><button class="btn g s" onclick="downloadCSV('contacts.csv',[['الاسم','الرقم','المجموعة'],...CT.map(c=>[c.name,c.phone,c.group])])">تصدير CSV</button></div></div>
 <div class="card"><label>بحث في جهات الاتصال:</label><input placeholder="ابحث بالاسم أو رقم الهاتف..." oninput="CQ=this.value;drawCt()"><label>فلترة حسب المجموعة:</label>${sel('cgf',[['','جميع جهات الاتصال'],...groupsOf().map(g=>[g,g])],'')}<button class="btn r s" style="margin-top:10px" onclick="ctClear()">${ic('trash')} تنظيف كل الأرقام</button></div>
 <div class="card tw" id="ctl"></div>
 <div class="card info"><h3>ℹ️ حول أرقام العملاء</h3><ul><li>هذه هي أرقام هواتف العملاء الذين تريد إرسال الرسائل إليهم.</li><li>استورد جهات الاتصال من ملفات Excel (الأعمدة: الاسم، الهاتف، والمجموعة اختياري).</li><li>يجب أن تتضمن أرقام الهواتف كود الدولة (مثال: 964+ للعراق).</li><li>استخدم هذه الجهات عند إرسال الرسائل من صفحة الإرسال.</li></ul></div>`;
 document.getElementById('cgf').onchange=function(){CG=this.value;drawCt()};drawCt()};

/* --- السجلات --- */
let LK='msg';
window.loadLogs=A(async()=>{const q=new URLSearchParams({kind:LK,status:lst.value,type:ltp.value,q:lq.value}),r=await api('/logs?'+q);
 document.getElementById('lt1').textContent=`الرسائل (${r.counts.msg})`;document.getElementById('lt2').textContent=`OTP (${r.counts.otp})`;
 ll.innerHTML=`<table><tr><th>التاريخ</th><th>المستلم</th><th>الجلسة</th><th>النوع</th><th>الحالة</th><th>النص</th></tr>${r.items.map(x=>row([fmt(x.at),`<span dir="ltr">+${esc(x.to)}</span>`,esc(x.sname||''),{api:'API',otp:'OTP',campaign:'حملة',auto:'رد آلي'}[x.type]||x.type,`<span class="badge ${x.ok?'':'x'}" title="${esc(x.err||'')}">${x.ok?'تم':'فشل'}</span>`,`<small>${esc((x.text||'').slice(0,60))}</small>`])).join('')||'<tr><td colspan="6">لا توجد سجلات</td></tr>'}</table>`});
window.logTab=k=>{LK=k;document.querySelectorAll('.lt').forEach(b=>b.classList.toggle('on',b.dataset.k==k));loadLogs()};
V.logs=async()=>{LK='msg';main.innerHTML=`<h2 class="ch">سجل الرسائل و OTP</h2><div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e"><b>ملاحظة هامة:</b> يتم تلقائياً حذف جميع رسائل السجل (سواء كانت رسائل عادية أو رموز تحقق OTP) التي يمر عليها أكثر من 3 أيام من النظام.</div>
 <div class="tabs2"><button class="lt on" data-k="msg" id="lt1" onclick="logTab('msg')">الرسائل</button><button class="lt" data-k="otp" id="lt2" onclick="logTab('otp')">OTP</button></div>
 <div class="card"><label>بحث</label><div style="display:flex;gap:8px"><input id="lq" placeholder="الرقم المستلم، اسم الجلسة..." style="margin:0" onkeydown="if(event.key=='Enter')loadLogs()"><button class="btn" onclick="loadLogs()">بحث</button></div>
 <div class="grid g2" style="margin-top:10px"><div><label>الحالة</label><select id="lst" onchange="loadLogs()"><option value="">جميع الحالات</option><option value="ok">ناجحة</option><option value="fail">فاشلة</option></select></div><div><label>النوع</label><select id="ltp" onchange="loadLogs()"><option value="">جميع الأنواع</option><option value="api">API</option><option value="campaign">حملة</option><option value="auto">رد آلي</option></select></div></div></div>
 <div class="card tw" id="ll"></div>`;await loadLogs()};
