/* FourForge — dependency-free, playable web interface. */
'use strict';
const root = document.getElementById('root');
const icons = {
  restart: '<path d="M3 11a9 9 0 1 1 2.9 6.6"/><path d="M3 3v8h8"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zm0-7v2m6-2v2M9 20v2m6-2v2M20 9h2m-2 6h2M2 9h2m-2 6h2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  git: '<circle cx="6" cy="3" r="2"/><path d="M6 5v12"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M18 8a6 6 0 0 1-6 6H6"/>',
  zap: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  brain: '<path d="M12 18a4 4 0 0 1-4-4V8a4 4 0 0 1 7-2 4 4 0 0 1 5 5 4 4 0 0 1 0 6 4 4 0 0 1-6 3V9"/><path d="M12 18a4 4 0 0 0-8-1 4 4 0 0 1 0-6 4 4 0 0 1 5-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bar: '<path d="M4 20V12h4v8M10 20V4h4v16M16 20v-9h4v9"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 1 1 0 12h-2"/>',
  bulb: '<path d="M9 18h6m-5 4h4m-5-7a7 7 0 1 1 6 0l-1 3h-4z"/>',
  code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-13-3 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sparkle: '<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};
const I = (name,size=17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const empty = () => Array.from({length:6},()=>Array(7).fill(0));
const fmt = n => Number(n).toLocaleString('en-US');
const safe = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const depths = {casual:3,skilled:5,expert:6};
let state = { board:empty(), turn:1, first:1, difficulty:'skilled', strategy:'optimized', moves:[], thinking:false,
  latest:null, showHints:false, hint:null, hintThinking:false, error:null, online:null, comparing:false, compare:false, compareResults:[] };
let gameId=0, activeRequest=null;

function drop(board,col,player){
  if(!Number.isInteger(col)||col<0||col>6)return null;
  const next=board.map(row=>[...row]);
  for(let r=0;r<6;r++)if(next[r][col]===0){next[r][col]=player;return next;}
  return null;
}
function outcome(board){
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    const piece=board[r][c];if(!piece)continue;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      if(Array.from({length:4},(_,n)=>[r+n*dr,c+n*dc]).every(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<7&&board[rr][cc]===piece))
        return piece===1?'red_wins':'blue_wins';
    }
  }
  return board[5].every(x=>x)?'draw':'playing';
}
function winCells(board){
  const set=new Set();
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    const piece=board[r][c];if(!piece)continue;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      const points=Array.from({length:4},(_,n)=>[r+n*dr,c+n*dc]);
      if(points.every(([rr,cc])=>rr>=0&&rr<6&&cc>=0&&cc<7&&board[rr][cc]===piece))points.forEach(([rr,cc])=>set.add(`${rr}-${cc}`));
    }
  }
  return set;
}
async function analyze(board,player,depth,strategy,signal){
  const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({board,player,depth,strategy}),signal});
  if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.detail||`Engine HTTP ${res.status}`);}
  return res.json();
}
function badgeMetric(icon,label,value,suffix='',tone='icon-muted'){
  return `<div class="metric"><div class="metric-label"><span class="${tone}">${I(icon,15)}</span>${label}</div><div class="metric-number">${value}<span>${suffix}</span></div></div>`;
}
function render(){
  const s=state, status=outcome(s.board), isHuman=s.turn===1&&status==='playing'&&!s.thinking;
  const last=s.moves.at(-1), highlighted=winCells(s.board), depth=depths[s.difficulty];
  const headline=status==='red_wins'?'You outsmarted the engine.':status==='blue_wins'?'The engine takes this round.':status==='draw'?'A beautifully played draw.':s.thinking?'The engine is thinking…':isHuman?'Your move. Make it count.':'Ready for the next move.';
  const stats=s.latest?.stats;
  const evalScore=s.latest?.score ?? 0;
  const scoreIndicator=s.latest?Math.max(7,Math.min(93,50+Math.sign(evalScore)*(Math.abs(evalScore)>900000?39:Math.min(37,Math.abs(evalScore)/22)))):50;
  root.innerHTML=`<div class="site-shell"><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div><div class="page-wrap">
    <header class="topbar"><div class="brand-lockup"><div class="brand-mark"><span></span><span></span><span></span><span></span></div><div class="brand-name">four<span>forge</span><i>.</i></div><div class="brand-separator"></div><span class="brand-subtitle">Connect Four AI Engine</span></div><div class="top-actions"><span class="online-badge ${s.online===false?'offline':''}"><span class="online-dot"></span>${s.online===false?'ENGINE OFFLINE':s.online?'ENGINE ONLINE':'CONNECTING...'}</span><button class="header-restart" data-action="new">${I('restart',15)} New game</button></div></header>
    <section class="hero"><div class="eyebrow"><span class="eyebrow-line"></span> STRATEGY MEETS COMPUTATION <span class="eyebrow-line"></span></div><h1>Outthink the <span>search tree.</span></h1><p>Play Connect Four against an AI that looks ahead, cuts through possibilities, and makes every move count.</p></section>
    <main class="dashboard"><section class="play-column"><div class="game-card"><div class="match-top"><div class="match-label"><span class="match-label-dot"></span><span>LIVE MATCH</span><span class="label-slash">/</span><span class="muted-label">01</span></div><div class="match-controls"><span>CLASSIC 7 × 6</span><span class="small-separator"></span><span>MOVE ${String(s.moves.length+1).padStart(2,'0')}</span></div></div>
    <div class="players"><div class="player-box ${s.turn===1&&status==='playing'?'active-human':''}"><div class="player-avatar human-avatar"><span></span></div><div class="player-info"><div class="player-name">You <span>HUMAN</span></div><div class="player-under">Coral · Player 01</div></div><span class="player-turn">${s.turn===1&&status==='playing'?'YOUR TURN':''}</span></div><div class="vs-text">VS</div><div class="player-box ai-box ${s.turn===2&&status==='playing'?'active-ai':''}"><div class="player-avatar ai-avatar">${I('cpu',22)}</div><div class="player-info"><div class="player-name">FourForge <span>AI ENGINE</span></div><div class="player-under">Cyan · Player 02</div></div><span class="player-turn ai-turn">${s.turn===2&&status==='playing'?'THINKING':''}</span></div></div>
    <div class="board-area"><div class="board-outer"><div class="column-guides">${Array.from({length:7},(_,c)=>`<button class="column-guide ${s.hint===c&&isHuman?'hint-guide':''}" data-action="drop" data-col="${c}" aria-label="Drop in column ${c+1}" ${!isHuman||s.board[5][c]?'disabled':''}><span class="column-index">${c+1}</span><span class="preview-chip"></span>${s.hint===c&&isHuman?'<span class="hint-indicator"></span>':''}</button>`).join('')}</div>
    <div class="board-frame" role="group" aria-label="Connect Four board">${Array.from({length:6},(_,i)=>5-i).map(r=>Array.from({length:7},(_,c)=>{
      const piece=s.board[r][c],winning=highlighted.has(`${r}-${c}`);
      return `<button type="button" class="cell ${piece===1?'human':piece===2?'computer':'empty'} ${winning?'winning':''}" data-action="drop" data-col="${c}" aria-label="Row ${r+1}, column ${c+1}: ${piece===0?'empty':piece===1?'your disc':'engine disc'}" ${!isHuman||s.board[5][c]?'disabled':''}><span class="disc"><span class="disc-inner"></span></span></button>`;
    }).join('')).join('')}</div><div class="board-shadow"></div></div></div>
    <div class="match-message ${status!=='playing'?'ended':''}"><div class="message-icon">${I(status==='playing'?(s.thinking?'cpu':'target'):'sparkle',19)}</div><div><strong>${headline}</strong><span>${status==='playing'?(s.thinking?'Evaluating outcomes with alpha-beta search.':'Choose a column to drop your disc.'):'Ready for a rematch? Every move is a fresh search.'}</span></div><span class="message-step">${status==='playing'?`${s.moves.length} / 42`:'FINISHED'}</span></div>
    ${s.error?`<div class="error-panel" role="alert"><strong>Engine connection problem</strong><span>${safe(s.error)} · Make sure Python is running.</span><button data-action="new">Restart match</button></div>`:''}
    <div class="game-bottom"><button class="secondary-button" data-action="undo" ${!s.moves.length||s.thinking?'disabled':''}>${I('undo',16)} Undo move</button><button class="primary-button" data-action="new">${I('restart',16)} New match ${I('arrow',16)}</button></div></div>
    <div class="feature-strip"><div>${I('git',18)}<span><strong>Minimax search</strong><small>Adversarial reasoning</small></span></div><div>${I('zap',18)}<span><strong>Alpha-beta pruning</strong><small>Smarter exploration</small></span></div><div>${I('layers',18)}<span><strong>Position caching</strong><small>Skip repeat states</small></span></div></div></section>
    <aside class="insights-column"><div class="insights-head"><div><div class="panel-eyebrow">THE ENGINE ROOM</div><h2>Search insights<span class="title-sparkle">✦</span></h2></div><div class="insight-live"><span></span> LIVE</div></div>
    <div class="insight-card analysis-card"><div class="card-title-row"><div class="section-title"><span class="icon-square purple">${I('brain',18)}</span><span>Last AI decision</span></div>${I('help',16)}</div>
    <div class="decision-row"><div><div class="decision-label">EVALUATED SCORE</div><div class="score-value ${evalScore<0?'negative':''}">${s.latest?`${evalScore>=0?'+':''}${fmt(evalScore)}`:'—'}</div></div><div class="decision-badge">${I('activity',14)}${s.latest?(Math.abs(evalScore)>900000?'FORCED OUTCOME':evalScore>0?'ENGINE EDGE':evalScore<0?'HUMAN EDGE':'EVEN POSITION'):'AWAITING FIRST MOVE'}</div></div>
    <div class="score-meter"><span class="score-meter-middle"></span><span class="score-meter-fill" style="width:${scoreIndicator}%"></span></div><div class="meter-legend"><span>HUMAN ADVANTAGE</span><span>ENGINE ADVANTAGE</span></div>
    <div class="decision-explain">${I('bulb',17)}<span>${s.latest?`Selected column ${s.latest.column+1} after exploring ${fmt(stats.nodes)} positions at depth ${stats.depth}.`:'Your first move starts the analysis. The engine will explain its search here.'}</span></div></div>
    <div class="insight-card metrics-card"><div class="card-title-row"><div class="section-title"><span class="icon-square cyan">${I('bar',18)}</span><span>Performance metrics</span></div><span class="last-move-tag">LAST SEARCH</span></div><div class="metrics-grid">
    ${badgeMetric('git','States explored',stats?fmt(stats.nodes):'—')}${badgeMetric('zap','Pruning cutoffs',stats?fmt(stats.cutoffs):'—','','icon-yellow')}${badgeMetric('clock','Compute time',stats?fmt(stats.elapsed_ms):'—','ms')}${badgeMetric('layers','Cache hits',stats?fmt(stats.cache_hits):'—','','icon-purple')}</div>
    <div class="metrics-footer"><span>SEARCH DEPTH</span><div>${Array.from({length:6},(_,i)=>`<i class="${i<depth?'lit':''}"></i>`).join('')}</div><strong>${depth} PLY</strong></div></div>
    <div class="insight-card config-card"><div class="card-title-row"><div class="section-title"><span class="icon-square amber">${I('target',18)}</span><span>Engine settings</span></div><span class="config-dot"></span></div>
    <div class="config-label"><span>DIFFICULTY</span><span>${depth}-PLY SEARCH</span></div><div class="difficulty-picker">${Object.keys(depths).map(d=>`<button data-action="difficulty" data-value="${d}" class="${s.difficulty===d?'selected':''}" ${s.thinking?'disabled':''}><span>${d}</span><small>${depths[d]} ply</small></button>`).join('')}</div>
    <label class="selector-label" for="strategy">SEARCH ALGORITHM</label><div class="custom-select"><select id="strategy" ${s.thinking?'disabled':''}><option value="optimized" ${s.strategy==='optimized'?'selected':''}>Optimized alpha-beta</option><option value="alpha_beta" ${s.strategy==='alpha_beta'?'selected':''}>Basic alpha-beta</option><option value="minimax" ${s.strategy==='minimax'?'selected':''}>Classic minimax</option></select>${I('chevron',16)}</div>
    <div class="settings-line"><div><span class="setting-name">Show suggested move</span><span class="setting-helper">Analyze the board on your turn</span></div><button class="toggle ${s.showHints?'checked':''}" role="switch" aria-checked="${s.showHints}" aria-label="Toggle suggested move" data-action="hint"><span></span></button></div>
    <div class="settings-line starting"><div><span class="setting-name">First move</span><span class="setting-helper">Applied on new matches</span></div><div class="first-pick"><button data-action="first" data-value="1" class="${s.first===1?'picked':''}">You</button><button data-action="first" data-value="2" class="${s.first===2?'picked':''}">AI</button></div></div>
    ${s.showHints?`<div class="hint-note"><span>${s.hintThinking?'Analyzing your options…':s.hint!==null?`Suggested: column ${s.hint+1}`:'Play a move to see hints.'}</span>${I('eye',15)}</div>`:''}</div>
    <div class="comparison-card"><div class="comparison-heading">${I('code',19)}<div><strong>Under the hood</strong><span>See the algorithmic difference.</span></div></div><button data-action="compare" class="compare-button" ${s.comparing||s.thinking?'disabled':''}>${s.comparing?'Benchmarking…':'Compare algorithms'}${I('arrow',16)}</button>
    ${s.compare?`<div class="comparison-results">${s.compareResults.map(({strategy,analysis})=>`<div class="comparison-row"><span>${strategy==='minimax'?'Minimax':strategy==='alpha_beta'?'Alpha-beta':'Optimized'}</span><strong>${fmt(analysis.stats.nodes)} nodes</strong></div>`).join('')}${s.compareResults.length===3?'<small>Same depth (4 ply). Lower node counts mean less search effort.</small>':''}</div>`:''}</div>
    </aside></main><footer class="footer"><div><span class="footer-mark">✣</span> FOURFORGE <span class="footer-divider">/</span> ENGINEERING THE NEXT MOVE</div><div>BUILT WITH <span>PYTHON</span> + <span>JAVASCRIPT</span> <span class="footer-heart">✦</span></div></footer></div></div>`;
}
async function testConnection(){try{const r=await fetch('/api/health');state.online=r.ok;}catch{state.online=false;}render();}
function newGame(start=state.first){
  gameId++;activeRequest?.abort();
  state={...state,board:empty(),turn:start,moves:[],thinking:false,latest:null,hint:null,hintThinking:false,error:null,compare:false,compareResults:[],comparing:false};
  render();if(start===2)engineTurn();else maybeHint();
}
function humanMove(col){
  if(state.turn!==1||state.thinking||outcome(state.board)!=='playing')return;
  const b=drop(state.board,col,1);if(!b)return;
  state.board=b;state.turn=2;state.moves.push({player:1,col,board:b});state.hint=null;state.compareResults=[];state.compare=false;state.comparing=false;state.error=null;
  render();if(outcome(b)==='playing')engineTurn();
}
async function engineTurn(){
  if(state.turn!==2||outcome(state.board)!=='playing')return;
  const id=gameId,board=state.board,controller=new AbortController();activeRequest?.abort();activeRequest=controller;
  state.thinking=true;state.error=null;render();
  try{
    const analysis=await analyze(board,2,depths[state.difficulty],state.strategy,controller.signal);
    if(gameId!==id||controller.signal.aborted)return;
    const b=analysis.column===null?null:drop(board,analysis.column,2);
    if(!b)throw Error('The engine did not return a legal move.');
    state.board=b;state.latest=analysis;state.moves.push({player:2,col:analysis.column,board:b,analysis});state.turn=1;state.thinking=false;state.online=true;render();maybeHint();
  }catch(err){if(gameId!==id||controller.signal.aborted)return;state.error=err.message;state.thinking=false;state.online=false;render();}
}
async function maybeHint(){
  if(!state.showHints||state.turn!==1||outcome(state.board)!=='playing')return;
  const id=gameId,board=state.board;state.hintThinking=true;state.hint=null;render();
  try{const result=await analyze(board,1,Math.min(depths[state.difficulty],5),'optimized');
    if(id!==gameId||state.board!==board||!state.showHints)return;
    state.hint=result.column;state.hintThinking=false;render();
  }catch{if(id!==gameId||state.board!==board)return;state.hintThinking=false;render();}
}
function undo(){
  if(!state.moves.length||state.thinking)return;
  gameId++;activeRequest?.abort();
  let keep=state.moves.length-1;
  if(state.moves.at(-1).player===2&&keep>0)keep--;
  state.moves=state.moves.slice(0,keep);
  state.board=state.moves.length?state.moves.at(-1).board:empty();
  state.turn=1;state.hint=null;state.error=null;state.latest=null;state.thinking=false;state.compare=false;state.compareResults=[];state.comparing=false;
  render();maybeHint();
}
async function compare(){
  if(state.comparing||state.thinking)return;
  const id=gameId,board=state.board,player=state.turn;
  state.comparing=true;state.compare=true;state.compareResults=[];state.error=null;render();
  for(const strategy of ['minimax','alpha_beta','optimized']){
    try{const analysis=await analyze(board,player,4,strategy);
      if(id!==gameId||state.board!==board)return;
      state.compareResults.push({strategy,analysis});render();
    }catch(err){if(id===gameId){state.error=err.message;break;}}
  }
  if(gameId===id){state.comparing=false;render();}
}
root.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action;
  if(action==='drop')humanMove(Number(el.dataset.col));
  else if(action==='new')newGame();
  else if(action==='undo')undo();
  else if(action==='difficulty'){state.difficulty=el.dataset.value;state.latest=null;render();maybeHint();}
  else if(action==='hint'){state.showHints=!state.showHints;state.hint=null;render();maybeHint();}
  else if(action==='first'){state.first=Number(el.dataset.value);newGame(state.first);}
  else if(action==='compare')compare();
});
root.addEventListener('change',e=>{if(e.target.id==='strategy'){state.strategy=e.target.value;state.latest=null;render();}});
render();testConnection();
