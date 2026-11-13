'use strict';
let config=null,session=null,pendingCode='',passwordToken='';
const byId=id=>document.getElementById(id);
const status=message=>byId('status').textContent=message;
const fragment=new URLSearchParams(location.hash.slice(1));
const linkType=fragment.get('type');
let linkToken=fragment.get('access_token');
const linkError=fragment.get('error_code')||fragment.get('error');
if(location.hash)history.replaceState({},'',location.pathname+location.search);

async function request(path,data=null,token=null,method='POST'){
 if(!config?.ready)throw Error('Der Kontodienst wird noch eingerichtet.');
 const headers={apikey:config.publishable_key,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const options={method,headers,redirect:'error'};
 if(method!=='GET')options.body=JSON.stringify(data);
 const result=await fetch(config.url+path,options);
 const raw=await result.text();
 if(raw.length>262144)throw Error('Die Antwort des Kontodienstes ist zu groß.');
 let value;try{value=raw?JSON.parse(raw):{}}catch{throw Error('Der Kontodienst hat ungültig geantwortet.')}
 if(!result.ok)throw Error(result.status===429?'Zu viele Versuche. Bitte später erneut versuchen.':result.status===401?'Anmeldung oder Sitzung ungültig. Bitte erneut anmelden.':'Anfrage nicht möglich. E-Mail-Bestätigung und Zugangsdaten prüfen.');
 return value;
}
function busy(value){document.querySelectorAll('button').forEach(button=>button.disabled=value||!config?.ready)}
function clearCode(){pendingCode='';byId('codeResult').textContent='';byId('redeem').hidden=true}
function signedOut(){session=null;passwordToken='';clearCode();byId('identity').textContent='';byId('accountPanel').hidden=true;byId('passwordPanel').hidden=true;byId('loginPanel').hidden=false;byId('newPassword').value=byId('repeatPassword').value=''}
function showAccount(user,token){if(!user||typeof user.email!=='string'||!token)throw Error('Anmeldung ist noch nicht abgeschlossen.');clearCode();session={access_token:token};byId('identity').textContent='Angemeldet: '+user.email;byId('email').value=user.email;byId('loginPanel').hidden=true;byId('passwordPanel').hidden=true;byId('accountPanel').hidden=false}
async function run(action){busy(true);try{await action()}catch(e){status(e.message)}finally{byId('password').value='';busy(false)}}
async function signIn(){const value=await request('/auth/v1/token?grant_type=password',{email:byId('email').value.trim(),password:byId('password').value});showAccount(value.user,value.access_token);status('Angemeldet. Du kannst jetzt Zugang anfragen oder deinen freigegebenen Code abholen.')}
byId('login').onclick=()=>run(signIn);
byId('signup').onclick=()=>run(async()=>{if(byId('password').value.length<8)throw Error('Bitte mindestens acht Zeichen als Passwort verwenden.');await request('/auth/v1/signup',{email:byId('email').value.trim(),password:byId('password').value});status('Registrierung angefordert. Bitte E-Mail bestätigen und anschließend anmelden.');});
byId('reset').onclick=()=>run(async()=>{await request('/auth/v1/recover',{email:byId('email').value.trim()});status('Falls das Konto vorhanden ist, erhältst du eine E-Mail zum Zurücksetzen.');});
byId('request').onclick=()=>run(async()=>{const r=await request('/rest/v1/rpc/ks_request_access',{},session.access_token);status(r.message||'Zugangsanfrage übermittelt.');});
byId('checkRequest').onclick=()=>run(async()=>{const r=await request('/rest/v1/rpc/ks_access_request_status',{},session.access_token);status(r.message||'Freigabestatus abgefragt.');clearCode();pendingCode=typeof r.code==='string'?r.code:'';byId('codeResult').textContent=pendingCode;byId('redeem').hidden=!pendingCode;});
byId('redeem').onclick=()=>run(async()=>{const r=await request('/rest/v1/rpc/ks_redeem_code',{code:pendingCode},session.access_token);if(!r.active)throw Error(r.message||'Code konnte nicht eingelöst werden.');clearCode();status('Vollversion für dein Konto freigeschaltet. In KS Pro mit demselben Konto anmelden.');});
byId('logout').onclick=()=>{signedOut();status('Abgemeldet.');};
byId('savePassword').onclick=()=>run(async()=>{
 const password=byId('newPassword').value;
 if(password.length<8||password!==byId('repeatPassword').value)throw Error('Passwörter müssen übereinstimmen und mindestens acht Zeichen lang sein.');
 if(!passwordToken)throw Error('Bitte einen neuen Bestätigungs- oder Passwortlink anfordern.');
 const user=await request('/auth/v1/user',{password},passwordToken,'PUT');
 showAccount(user,passwordToken);passwordToken='';byId('newPassword').value=byId('repeatPassword').value='';
 status('Passwort gespeichert. Du kannst jetzt Zugang anfragen und dich in KS Pro mit diesem Passwort anmelden.');
});
(async()=>{busy(true);try{
 const response=await fetch('account-config.json',{cache:'no-store'});
 if(!response.ok)throw Error('Kontodienst-Konfiguration konnte nicht geladen werden.');
 config=await response.json();
 if(config.ready&&(!/^https:\/\/[a-z0-9]{10,64}\.supabase\.co$/.test(config.url)||typeof config.publishable_key!=='string'||!config.publishable_key.startsWith('sb_publishable_')))throw Error('Kontodienst-Konfiguration ist ungültig.');
 if(!config.ready){status('Der Kontodienst und die Code-Ausgabe werden noch eingerichtet. Bitte später einen neuen Bestätigungslink anfordern.');return}
 if(linkError){status('Der Bestätigungslink ist ungültig oder abgelaufen. Bitte erneut anmelden oder einen neuen Passwortlink anfordern.');return}
 if(linkToken){
  const user=await request('/auth/v1/user',null,linkToken,'GET');
  if(['recovery','invite','magiclink'].includes(linkType)){
   passwordToken=linkToken;byId('email').value=user.email||'';byId('loginPanel').hidden=true;byId('passwordPanel').hidden=false;
   byId('passwordTitle').textContent=linkType==='recovery'?'Passwort zurücksetzen':'Dein KS-Passwort festlegen';
   status('E-Mail-Link bestätigt. Lege jetzt dein persönliches KS-Passwort fest.');
  }else{showAccount(user,linkToken);status('E-Mail bestätigt. Du kannst jetzt Zugang anfragen.');}
 }else status('Bitte registrieren oder anmelden. Ein Pro-Code wird nach Anbieterfreigabe bereitgestellt.');
}catch(e){config=null;status(e.message)}finally{linkToken=null;busy(false)}})();
