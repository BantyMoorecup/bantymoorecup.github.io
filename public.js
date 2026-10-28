(async function(){
const $=id=>document.getElementById(id);
const empty=(cols,msg="No data published yet.")=>`<p class="muted">${BANTY.esc(msg)}</p>`;
const table=(heads,rows)=>rows.length?`<table><thead><tr>${heads.map(h=>`<th>${BANTY.esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`:empty();
try{
 const c=await BANTY.ready();
 const [{data:teams,error:te},{data:players,error:pe},{data:matches,error:me},{data:goals,error:ge},{data:cards,error:ce}]=await Promise.all([
 c.from("teams").select("id,name").order("name"),
 c.from("players").select("id,team_id,full_name,jersey_number").eq("registration_status","approved"),
 c.from("matches").select("id,home_team_id,away_team_id,kickoff,venue,home_score,away_score,status").order("kickoff"),
 c.from("goals").select("player_id,match_id"),
 c.from("cards").select("player_id,match_id,card_type")
 ]);
 if(te||pe||me||ge||ce) throw new Error("Could not load some tournament data. Check database setup and policies.");
 const tm=Object.fromEntries((teams||[]).map(t=>[t.id,t.name]));
 const pl=Object.fromEntries((players||[]).map(p=>[p.id,p]));
 let standings={};(teams||[]).forEach(t=>standings[t.id]={name:t.name,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
 (matches||[]).filter(m=>m.status==="played"&&m.home_score!=null&&m.away_score!=null).forEach(m=>{let h=standings[m.home_team_id],a=standings[m.away_team_id];if(!h||!a)return;h.p++;a.p++;h.gf+=m.home_score;h.ga+=m.away_score;a.gf+=m.away_score;a.ga+=m.home_score;if(m.home_score>m.away_score){h.w++;a.l++;h.pts+=3}else if(m.home_score<m.away_score){a.w++;h.l++;a.pts+=3}else{h.d++;a.d++;h.pts++;a.pts++}});
 const sr=Object.values(standings).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf).map((s,i)=>`<tr><td>${i+1}</td><td>${BANTY.esc(s.name)}</td><td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gf-s.ga}</td><td><b>${s.pts}</b></td></tr>`);
 $("league").innerHTML=table(["#","Team","P","W","D","L","GD","Pts"],sr);
 const counts={};(goals||[]).forEach(g=>{if(pl[g.player_id])counts[g.player_id]=(counts[g.player_id]||0)+1});
 $("scorers").innerHTML=table(["Player","Team","Goals"],Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<tr><td>${BANTY.esc(pl[id].full_name)}</td><td>${BANTY.esc(tm[pl[id].team_id]||"")}</td><td>${n}</td></tr>`));
 const cc={};(cards||[]).forEach(x=>{if(pl[x.player_id]){const k=x.player_id;cc[k]??={y:0,r:0};cc[k][x.card_type==="yellow"?"y":"r"]++}});
 $("cards").innerHTML=table(["Player","Team","Yellow","Red"],Object.entries(cc).sort((a,b)=>(b[1].r-b[1].r)||(b[1].y-a[1].y)).map(([id,v])=>`<tr><td>${BANTY.esc(pl[id].full_name)}</td><td>${BANTY.esc(tm[pl[id].team_id]||"")}</td><td>${v.y}</td><td>${v.r}</td></tr>`));
 $("matches").innerHTML=table(["Match","Kick-off","Venue","Score","Status"],(matches||[]).map(m=>`<tr><td>${BANTY.esc(tm[m.home_team_id]||"TBD")} vs ${BANTY.esc(tm[m.away_team_id]||"TBD")}</td><td>${m.kickoff?BANTY.esc(new Date(m.kickoff).toLocaleString()):"TBC"}</td><td>${BANTY.esc(m.venue||"TBC")}</td><td>${m.status==="played"?`${m.home_score} – ${m.away_score}`:"—"}</td><td>${BANTY.esc(m.status)}</td></tr>`));
 $("teams").innerHTML=(teams||[]).map(t=>`<div class="panel"><b>${BANTY.esc(t.name)}</b><ul>${(players||[]).filter(p=>p.team_id===t.id).map(p=>`<li>${BANTY.esc(p.full_name)}${p.jersey_number!=null?` (#${p.jersey_number})`:""}</li>`).join("")||"<li class=\"muted\">No approved players yet</li>"}</ul></div>`).join("")||empty();
}catch(e){["league","scorers","cards","matches","teams"].forEach(id=>$(id).innerHTML=empty([],e.message||"Site setup is not complete."));console.error(e)}
})();