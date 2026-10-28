(function(){
const $=id=>document.getElementById(id), notice=$("notice"), area=$("adminArea"), login=$("login"), logout=$("logout");
let client, teams=[], players=[], matches=[];
const linkStoreKey="bantyMooreRegistrationLinks";

function savedLinks(){try{return JSON.parse(localStorage.getItem(linkStoreKey)||"[]")}catch{return []}}
function saveLink(item){const all=savedLinks().filter(x=>String(x.team_id)!==String(item.team_id));all.push(item);localStorage.setItem(linkStoreKey,JSON.stringify(all))}
function msg(t,bad=false){notice.hidden=false;BANTY.message(notice,t,bad)}
function opts(el,rows,label){el.innerHTML=rows.map(r=>`<option value="${BANTY.esc(r.id)}">${BANTY.esc(label(r))}</option>`).join("")}

async function requireAdmin(){
 client=await BANTY.ready();
 const a=await BANTY.adminCheck(client);
 if(!a.user){area.hidden=true;logout.hidden=true;login.hidden=false;return false}
 if(!a.admin){await client.auth.signOut();msg("This account is not listed as an authorized tournament admin.",true);return false}
 login.hidden=true;logout.hidden=false;area.hidden=false;
 await refresh();
 return true;
}

async function refresh(){
 const [t,p,m]=await Promise.all([
  client.from("teams").select("*").order("name"),
  client.from("players").select("*").order("created_at",{ascending:true}),
  client.from("matches").select("*").order("kickoff")
 ]);
 if(t.error||p.error||m.error)throw new Error(t.error?.message||p.error?.message||m.error?.message);

 teams=t.data||[];
 players=p.data||[];
 matches=m.data||[];

 opts($("homeTeam"),teams,x=>x.name);
 opts($("awayTeam"),teams,x=>x.name);

 const matchLabel=m=>`${teams.find(t=>t.id===m.home_team_id)?.name||"Home"} vs ${teams.find(t=>t.id===m.away_team_id)?.name||"Away"} (${m.status})`;
 opts($("resultMatch"),matches,matchLabel);
 opts($("eventMatch"),matches,matchLabel);
 opts($("eventPlayer"),players.filter(p=>p.registration_status==="approved"),p=>`${p.full_name} — ${teams.find(t=>t.id===p.team_id)?.name||""}`);
const { data: tokenRows, error: tokenError } = await client
  .from("team_registration_tokens")
  .select("team_id, token_value, active")
  .eq("active", true);

if (tokenError) throw tokenError;

const storedLinks = tokenRows || [];

$("teamLinks").innerHTML = teams.map(t => {
  const item = storedLinks.find(
    x => String(x.team_id) === String(t.id) && x.token_value
  );

  const url = item
    ? `${location.origin}${location.pathname.replace("admin.html", "registration.html")}?token=${encodeURIComponent(item.token_value)}`
    : "";

  return `
    <div class="panel">
      <b>${BANTY.esc(t.name)}</b>
      ${
        url
          ? `<p>
              <input readonly value="${BANTY.esc(url)}"
                aria-label="Private registration link for ${BANTY.esc(t.name)}">
              <button class="button" type="button"
                data-copy-link="${BANTY.esc(t.id)}">Copy link</button>
            </p>`
          : `<p class="muted">No active manager link found.</p>`
      }
      <button class="button danger" type="button"
        data-delete-team="${BANTY.esc(t.id)}"
        data-team-name="${BANTY.esc(t.name)}">Delete Team</button>
    </div>
  `;
}).join("") || "<p class=\"muted\">No teams yet.</p>";

$("teamLinks").querySelectorAll("[data-copy-link]").forEach(b => {
  b.onclick = async () => {
    const item = storedLinks.find(
      x => String(x.team_id) === b.dataset.copyLink && x.token_value
    );

    if (!item) return;

    const url = `${location.origin}${location.pathname.replace("admin.html", "registration.html")}?token=${encodeURIComponent(item.token_value)}`;

    try {
      await navigator.clipboard.writeText(url);
      msg("Manager link copied. Send it only to the correct team manager.");
    } catch {
      const input = b.parentElement.querySelector("input");
      if (input) {
        input.focus();
        input.select();
        msg("Link selected. Press Ctrl+C to copy it.");
      }
    }
  };
});

$("teamLinks").querySelectorAll("[data-delete-team]").forEach(b => {
  b.onclick = () => deleteTeam(b.dataset.deleteTeam, b.dataset.teamName);
});
 const pending=players.filter(p=>p.registration_status==="pending");
 $("pending").innerHTML=pending.map(p=>`
  <div class="panel">
   <b>${BANTY.esc(p.full_name)}</b> — ${BANTY.esc(teams.find(t=>t.id===p.team_id)?.name||"Team")}
   ${p.jersey_number==null?"":`(#${p.jersey_number})`}
   <div class="row-actions">
    <button class="button" data-approve="${p.id}">Approve</button>
    <button class="button danger" data-reject="${p.id}">Reject</button>
   </div>
  </div>`).join("")||"<p class=\"muted\">No pending registrations.</p>";

 $("pending").querySelectorAll("[data-approve]").forEach(b=>b.onclick=()=>setStatus(b.dataset.approve,"approved"));
 $("pending").querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>setStatus(b.dataset.reject,"rejected"));
}

function confirmDeleteTeam(teamName){
 return new Promise(resolve=>{
  const dialog=document.createElement("dialog");
  dialog.setAttribute("aria-labelledby","deleteTeamTitle");
  dialog.style.cssText="max-width:420px;width:calc(100% - 40px);border:1px solid #ccc;border-radius:12px;padding:24px;color:#222";
  dialog.innerHTML=`
   <h2 id="deleteTeamTitle">Delete Team?</h2>
   <p>Are you sure you want to delete <strong></strong>?</p>
   <p>This action cannot be undone. The team's players and related personal match events will be deleted. Teams with fixtures cannot be deleted.</p>
   <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap">
    <button type="button" data-cancel-delete>Cancel</button>
    <button type="button" data-confirm-delete style="background:#b42318;color:white;border:0;border-radius:6px;padding:10px 14px">Yes, Delete Team</button>
   </div>`;
  dialog.querySelector("strong").textContent=teamName;

  const finish=value=>{
   if(dialog.open)dialog.close();
   dialog.remove();
   resolve(value);
  };

  dialog.querySelector("[data-cancel-delete]").onclick=()=>finish(false);
  dialog.querySelector("[data-confirm-delete]").onclick=()=>finish(true);
  dialog.addEventListener("cancel",e=>{e.preventDefault();finish(false)},{once:true});
  dialog.addEventListener("click",e=>{if(e.target===dialog)finish(false)});
  document.body.appendChild(dialog);
  dialog.showModal();
 });
}

async function deleteTeam(teamId,teamName){
 const confirmed=await confirmDeleteTeam(teamName);
 if(!confirmed)return;

 const button=$("teamLinks").querySelector(`[data-delete-team="${CSS.escape(String(teamId))}"]`);
 if(button)button.disabled=true;

 try{
  const {data,error}=await client.rpc("delete_team_safe",{p_team_id:Number(teamId)});
  if(error)throw error;

  // Remove only this team's saved private link from this browser.
  localStorage.setItem(linkStoreKey,JSON.stringify(
   savedLinks().filter(x=>String(x.team_id)!==String(teamId))
  ));

  msg(`Team "${typeof data==="string"?data:teamName}" was deleted successfully.`);
  await refresh();
 }catch(error){
  msg(error.message||"Could not delete this team.",true);
  if(button)button.disabled=false;
 }
}

async function setStatus(id,status){
 const {error}=await client.from("players").update({registration_status:status}).eq("id",id);
 if(error)msg(error.message,true);
 else{msg("Player status updated.");await refresh()}
}

login.addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  client=await BANTY.ready();
  const {error}=await client.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error)throw error;
  await requireAdmin();
 }catch(e){msg(e.message||"Sign in failed.",true)}
});

logout.addEventListener("click",async()=>{
 await client.auth.signOut();
 area.hidden=true;
 login.hidden=false;
 logout.hidden=true;
 msg("Signed out.");
});

$("teamForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const name=$("teamName").value.trim();
  const token=crypto.randomUUID().replaceAll("-","");
  const {data,error}=await client.from("teams").insert({name}).select("id,name").single();
  if(error)throw error;
  const {error:te}=await client.from("team_registration_tokens").insert({
  team_id: data.id,
  token_hash: await sha256(token),
  token_value: token,
  active: true
});
  if(te)throw te;
  const url=`${location.origin}${location.pathname.replace("admin.html","registration.html")}?token=${encodeURIComponent(token)}`;
  saveLink({team_id:data.id,name,url});
  msg("Team created. Copy the private link shown below and send it only to that manager. Save the link somewhere safe too.");
  $("teamName").value="";
  await refresh();
 }catch(err){msg(err.message||"Could not create team.",true)}
});

async function sha256(s){
 const bytes=new TextEncoder().encode(s),hash=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

$("matchForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const h=Number($("homeTeam").value),a=Number($("awayTeam").value);
  if(!h||!a||h===a)throw new Error("Choose two different teams.");
  const when=$("kickoff").value;
  const {error}=await client.from("matches").insert({home_team_id:h,away_team_id:a,kickoff:when?new Date(when).toISOString():null,venue:$("venue").value.trim()||null});
  if(error)throw error;
  msg("Fixture created.");
  await refresh();
 }catch(e){msg(e.message,true)}
});

$("resultForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const {error}=await client.from("matches").update({home_score:Number($("homeScore").value),away_score:Number($("awayScore").value),status:"played"}).eq("id",Number($("resultMatch").value));
  if(error)throw error;
  msg("Result saved.");
  await refresh();
 }catch(e){msg(e.message,true)}
});

$("eventForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const type=$("eventType").value,base={match_id:Number($("eventMatch").value),player_id:$("eventPlayer").value};
  let result;
  if(type==="goal")result=await client.from("goals").insert({...base,goal_time:$("eventMinute").value.trim()||null});
  else result=await client.from("cards").insert({...base,card_type:type,card_time:$("eventMinute").value.trim()||null});
  if(result.error)throw result.error;
  msg("Match event recorded.");
  $("eventMinute").value="";
 }catch(e){msg(e.message,true)}
});

requireAdmin().catch(e=>msg(e.message,true));
})();
