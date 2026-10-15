import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BarChart3, BrainCircuit, ChevronDown,
  CircleHelp, Clock3, Code2, Cpu, Eye, EyeOff, GitBranch, Layers3,
  Lightbulb, RotateCcw, Sparkles, Target, Undo2, Zap,
} from 'lucide-react';

type Player = 0 | 1 | 2;
type Board = Player[][];
type Strategy = 'optimized' | 'alpha_beta' | 'minimax';
type SearchStats = {
  nodes: number; leaves: number; cutoffs: number; pruned_moves: number;
  cache_hits: number; elapsed_ms: number; depth: number;
};
type Analysis = {
  column: number | null; score: number; principal_variation: number[];
  status: string; stats: SearchStats;
};
type GameStatus = 'playing' | 'red_wins' | 'blue_wins' | 'draw';
type TurnEvent = { player: Player; col: number; board: Board; analysis?: Analysis };

const EMPTY = (): Board => Array.from({ length: 6 }, () => Array(7).fill(0) as Player[]);
const DEPTHS = { casual: 3, skilled: 5, expert: 6 } as const;
type Difficulty = keyof typeof DEPTHS;
const fmt = (num: number) => new Intl.NumberFormat('en-US').format(num);

function drop(board: Board, column: number, player: Player): Board | null {
  const result = board.map(row => [...row]);
  for (let row = 0; row < 6; row++) {
    if (result[row][column] === 0) {
      result[row][column] = player;
      return result;
    }
  }
  return null;
}

function getStatus(board: Board): GameStatus {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const p = board[r][c];
    if (!p) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      if (Array.from({length: 4}, (_, n) => [r + n * dr, c + n * dc])
        .every(([rr, cc]) => rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === p)) {
        return p === 1 ? 'red_wins' : 'blue_wins';
      }
    }
  }
  return board[5].every(v => v !== 0) ? 'draw' : 'playing';
}

function winningCells(board: Board): Set<string> {
  const result = new Set<string>();
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const p = board[r][c];
    if (!p) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const points = Array.from({length: 4}, (_, n) => [r + n * dr, c + n * dc]);
      if (points.every(([rr, cc]) => rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === p)) {
        points.forEach(([rr, cc]) => result.add(`${rr}-${cc}`));
      }
    }
  }
  return result;
}

async function analyze(board: Board, player: 1 | 2, depth: number, strategy: Strategy, signal?: AbortSignal): Promise<Analysis> {
  const response = await fetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, player, depth, strategy }), signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || 'The engine could not analyze this position.');
  }
  return await response.json() as Analysis;
}

function Metric({ icon: Icon, label, value, suffix, tone }: {
  icon: typeof Activity; label: string; value: string; suffix?: string; tone?: string;
}) {
  return <div className="metric">
    <div className="metric-label"><Icon size={15} className={tone || 'icon-muted'}/>{label}</div>
    <div className="metric-number">{value}<span>{suffix}</span></div>
  </div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked}
    onClick={() => onChange(!checked)} aria-label="Toggle suggested move">
    <span/>
  </button>;
}

export default function App() {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [first, setFirst] = useState<1 | 2>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('skilled');
  const [strategy, setStrategy] = useState<Strategy>('optimized');
  const [moves, setMoves] = useState<TurnEvent[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [hint, setHint] = useState<number | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [latest, setLatest] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [compareResults, setCompareResults] = useState<{ strategy: Strategy; analysis: Analysis }[]>([]);
  const [comparing, setComparing] = useState(false);
  const gameId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const status = getStatus(board);
  const winnerCells = useMemo(() => winningCells(board), [board]);
  const isHuman = turn === 1 && status === 'playing' && !thinking;
  const currentSearchDepth = DEPTHS[difficulty];
  const lastMove = moves.at(-1);
  const movesCount = moves.length;

  const newGame = useCallback((starting: 1 | 2 = first) => {
    ++gameId.current;
    abort.current?.abort();
    setBoard(EMPTY()); setMoves([]); setTurn(starting);
    setThinking(false); setLatest(null); setHint(null); setError(null);
    setCompareResults([]); setCompare(false); setHover(null);
  }, [first]);

  const undo = useCallback(() => {
    if (moves.length === 0) return;
    ++gameId.current; abort.current?.abort();
    // Undo to the most recent position where it is the human's turn.
    let n = moves.length - 1;
    if (moves[n].player === 2 && n > 0) n -= 1;
    const retained = moves.slice(0, n);
    const previous = retained.length ? retained[retained.length - 1].board : EMPTY();
    setMoves(retained); setBoard(previous);
    setTurn(1); setThinking(false); setLatest(null); setHint(null); setError(null);
    setCompareResults([]); setComparing(false);
  }, [moves]);

  const humanMove = useCallback((col: number) => {
    if (!isHuman) return;
    const next = drop(board, col, 1);
    if (!next) return;
    setBoard(next); setMoves(prev => [...prev, { player: 1, col, board: next }]);
    setTurn(2); setHint(null); setCompareResults([]); setComparing(false); setError(null);
  }, [board, isHuman]);

  useEffect(() => {
    if (turn !== 2 || status !== 'playing') return;
    const controller = new AbortController();
    abort.current = controller;
    const id = gameId.current;
    setThinking(true);
    setError(null);
    analyze(board, 2, currentSearchDepth, strategy, controller.signal)
      .then(result => {
        if (controller.signal.aborted || id !== gameId.current) return;
        if (result.column === null) throw new Error('The engine returned no legal move.');
        const next = drop(board, result.column, 2);
        if (!next) throw new Error('The engine selected a full column.');
        setLatest(result);
        setBoard(next);
        setMoves(prev => [...prev, { player: 2, col: result.column!, board: next, analysis: result }]);
        setTurn(1);
        setThinking(false);
      })
      .catch(err => {
        if (controller.signal.aborted || id !== gameId.current) return;
        setError(err instanceof Error ? err.message : 'Connection failed');
        setThinking(false);
      });
    return () => controller.abort();
  }, [board, turn, status, currentSearchDepth, strategy]);

  useEffect(() => {
    setHint(null);
    if (!showHints || !isHuman || moves.length === 0) return;
    const controller = new AbortController();
    setHintThinking(true);
    analyze(board, 1, Math.min(currentSearchDepth, 5), 'optimized', controller.signal)
      .then(result => { if (!controller.signal.aborted) {setHint(result.column); setHintThinking(false);} })
      .catch(() => { if (!controller.signal.aborted) setHintThinking(false); });
    return () => { controller.abort(); setHintThinking(false); };
  }, [board, isHuman, showHints, currentSearchDepth, moves.length]);

  const runCompare = async () => {
    setCompare(true); setCompareResults([]); setComparing(true);
    const id = gameId.current;
    const results: { strategy: Strategy; analysis: Analysis }[] = [];
    // Depth 4 keeps plain minimax lightweight for interactive comparison.
    for (const s of ['minimax', 'alpha_beta', 'optimized'] as const) {
      try {
        const result = await analyze(board, turn, 4, s);
        if (id !== gameId.current) return;
        results.push({ strategy: s, analysis: result });
        setCompareResults([...results]);
      } catch (err) {
        if (id === gameId.current) setError(err instanceof Error ? err.message : 'Comparison failed');
        break;
      }
    }
    if (id === gameId.current) setComparing(false);
  };

  const headline = status === 'red_wins' ? 'You outsmarted the engine.' :
    status === 'blue_wins' ? 'The engine takes this round.' :
      status === 'draw' ? 'A beautifully played draw.' :
        thinking ? 'The engine is thinking…' : isHuman ? 'Your move. Make it count.' : 'Ready for the next move.';

  return <div className="site-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <div className="page-wrap">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span/><span/><span/><span/></div>
          <div className="brand-name">four<span>forge</span><i>.</i></div>
          <div className="brand-separator"/><span className="brand-subtitle">Connect Four AI Engine</span>
        </div>
        <div className="top-actions">
          <span className="online-badge"><span className="online-dot"/> ENGINE ONLINE</span>
          <button className="header-restart" onClick={() => newGame()}><RotateCcw size={15}/> New game</button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line"/> STRATEGY MEETS COMPUTATION <span className="eyebrow-line"/></div>
        <h1>Outthink the <span>search tree.</span></h1>
        <p>Play Connect Four against an AI that looks ahead, cuts through millions of possibilities, and learns nothing from luck.</p>
      </section>

      <main className="dashboard">
        <section className="play-column">
          <div className="game-card">
            <div className="match-top">
              <div className="match-label"><span className="match-label-dot"/> <span>LIVE MATCH</span><span className="label-slash">/</span><span className="muted-label">01</span></div>
              <div className="match-controls"><span>CLASSIC 7 × 6</span><span className="small-separator"/><span>MOVE {String(movesCount + 1).padStart(2, '0')}</span></div>
            </div>

            <div className="players">
              <div className={`player-box ${turn === 1 && status === 'playing' ? 'active-human' : ''}`}>
                <div className="player-avatar human-avatar"><span/></div>
                <div className="player-info"><div className="player-name">You <span>HUMAN</span></div><div className="player-under">Coral · Player 01</div></div>
                <span className="player-turn">{turn === 1 && status === 'playing' ? 'YOUR TURN' : ' '}</span>
              </div>
              <div className="vs-text">VS</div>
              <div className={`player-box ai-box ${turn === 2 && status === 'playing' ? 'active-ai' : ''}`}>
                <div className="player-avatar ai-avatar"><Cpu size={22}/></div>
                <div className="player-info"><div className="player-name">FourForge <span>AI ENGINE</span></div><div className="player-under">Cyan · Player 02</div></div>
                <span className="player-turn ai-turn">{turn === 2 && status === 'playing' ? 'THINKING' : ' '}</span>
              </div>
            </div>

            <div className="board-area">
              <div className="board-outer">
                <div className="column-guides">
                  {Array.from({length: 7}, (_, c) => <button key={c} className={`column-guide ${hover === c ? 'active' : ''} ${hint === c && isHuman ? 'hint-guide' : ''}`}
                    disabled={!isHuman || board[5][c] !== 0}
                    onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c)} onBlur={() => setHover(null)}
                    onClick={() => humanMove(c)} aria-label={`Drop in column ${c+1}`}>
                    {hover === c && isHuman && board[5][c] === 0 ? <span className="preview-chip"/> :
                      <span className="column-index">{c + 1}</span>}
                    {hint === c && isHuman && <span className="hint-indicator"/>}
                  </button>)}
                </div>
                <div className="board-frame" role="group" aria-label="Connect Four game board">
                  {Array.from({length: 6}, (_, renderRow) => 5 - renderRow).map(r =>
                    Array.from({length: 7}, (_, c) => {
                      const chip = board[r][c];
                      const last = lastMove?.col === c && lastMove?.board[r][c] === chip && chip !== 0;
                      const winning = winnerCells.has(`${r}-${c}`);
                      return <button key={`${r}-${c}`} type="button"
                        className={`cell ${chip === 1 ? 'human' : chip === 2 ? 'computer' : 'empty'} ${winning ? 'winning' : ''} ${last ? 'last-row' : ''}`}
                        aria-label={`Row ${r+1}, column ${c+1}: ${chip === 0 ? 'empty' : chip === 1 ? 'your disc' : 'engine disc'}`}
                        onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
                        disabled={!isHuman || board[5][c] !== 0} onClick={() => humanMove(c)}>
                        <span className="disc"><span className="disc-inner"/></span>
                      </button>;
                    }))}
                </div>
                <div className="board-shadow"/>
              </div>
            </div>

            <div className={`match-message ${status !== 'playing' ? 'ended' : ''}`}>
              <div className="message-icon">{status === 'playing' ? (thinking ? <Cpu size={19}/> : <Target size={19}/>) : <Sparkles size={19}/>}</div>
              <div><strong>{headline}</strong><span>{status === 'playing' ? (thinking ? 'Evaluating outcomes with alpha-beta search.' : 'Choose a column to drop your disc.') : 'Ready for a rematch? Every move is a fresh search.'}</span></div>
              <span className="message-step">{status === 'playing' ? `${Math.min(movesCount, 42)} / 42` : 'FINISHED'}</span>
            </div>

            {error && <div className="error-panel" role="alert"><strong>Engine connection problem</strong><span>{error} Make sure the Python API is running on port 8000.</span><button onClick={() => newGame()}>Restart match</button></div>}

            <div className="game-bottom">
              <button className="secondary-button" disabled={!moves.length || thinking} onClick={undo}><Undo2 size={16}/> Undo move</button>
              <button className="primary-button" onClick={() => newGame()}><RotateCcw size={16}/> New match <ArrowRight size={16}/></button>
            </div>
          </div>

          <div className="feature-strip">
            <div><GitBranch size={18}/><span><strong>Minimax search</strong><small>Adversarial reasoning</small></span></div>
            <div><Zap size={18}/><span><strong>Alpha-beta pruning</strong><small>Smarter exploration</small></span></div>
            <div><Layers3 size={18}/><span><strong>Position caching</strong><small>Skip repeat states</small></span></div>
          </div>
        </section>

        <aside className="insights-column">
          <div className="insights-head"><div><div className="panel-eyebrow">THE ENGINE ROOM</div><h2>Search insights<span className="title-sparkle">✦</span></h2></div><div className="insight-live"><span/> LIVE</div></div>

          <div className="insight-card analysis-card">
            <div className="card-title-row"><div className="section-title"><span className="icon-square purple"><BrainCircuit size={18}/></span><span>Last AI decision</span></div><CircleHelp size={16} className="icon-muted"/></div>
            <div className="decision-row"><div><div className="decision-label">EVALUATED SCORE</div><div className={`score-value ${latest && latest.score < 0 ? 'negative' : ''}`}>{latest ? (latest.score >= 0 ? '+' : '') + fmt(latest.score) : '—'}</div></div><div className="decision-badge"><Activity size={14}/>{latest ? (Math.abs(latest.score) > 900000 ? 'FORCED OUTCOME' : latest.score > 0 ? 'ENGINE EDGE' : latest.score < 0 ? 'HUMAN EDGE' : 'EVEN POSITION') : 'AWAITING FIRST MOVE'}</div></div>
            <div className="score-meter"><span className="score-meter-middle"/><span className="score-meter-fill" style={{width: `${latest ? Math.max(7, Math.min(93, 50 + Math.sign(latest.score) * (Math.abs(latest.score) > 900000 ? 39 : Math.min(37, Math.abs(latest.score) / 22)))) : 50}%`}}/></div>
            <div className="meter-legend"><span>HUMAN ADVANTAGE</span><span>ENGINE ADVANTAGE</span></div>
            <div className="decision-explain"><Lightbulb size={17}/><span>{latest ? `Selected column ${latest.column! + 1} after exploring ${fmt(latest.stats.nodes)} positions at depth ${latest.stats.depth}.` : 'Your first move starts the analysis. The engine will explain its search here.'}</span></div>
          </div>

          <div className="insight-card metrics-card">
            <div className="card-title-row"><div className="section-title"><span className="icon-square cyan"><BarChart3 size={18}/></span><span>Performance metrics</span></div><span className="last-move-tag">LAST SEARCH</span></div>
            <div className="metrics-grid">
              <Metric icon={GitBranch} label="States explored" value={latest ? fmt(latest.stats.nodes) : '—'}/>
              <Metric icon={Zap} label="Pruning cutoffs" value={latest ? fmt(latest.stats.cutoffs) : '—'} tone="icon-yellow"/>
              <Metric icon={Clock3} label="Compute time" value={latest ? latest.stats.elapsed_ms.toLocaleString('en-US',{maximumFractionDigits:1}) : '—'} suffix="ms"/>
              <Metric icon={Layers3} label="Cache hits" value={latest ? fmt(latest.stats.cache_hits) : '—'} tone="icon-purple"/>
            </div>
            <div className="metrics-footer"><span>SEARCH DEPTH</span><div>{Array.from({length: 6}, (_, idx) => <i key={idx} className={idx < currentSearchDepth ? 'lit' : ''}/>)}</div><strong>{currentSearchDepth} PLY</strong></div>
          </div>

          <div className="insight-card config-card">
            <div className="card-title-row"><div className="section-title"><span className="icon-square amber"><Target size={18}/></span><span>Engine settings</span></div><span className="config-dot"/></div>
            <div className="config-label"><span>DIFFICULTY</span><span>{currentSearchDepth}-PLY SEARCH</span></div>
            <div className="difficulty-picker">{(['casual','skilled','expert'] as const).map(d => <button key={d} className={difficulty === d ? 'selected' : ''} onClick={() => {setDifficulty(d); setLatest(null); setHint(null);}} disabled={thinking}><span>{d}</span><small>{DEPTHS[d]} ply</small></button>)}</div>
            <label className="selector-label" htmlFor="strategy">SEARCH ALGORITHM</label>
            <div className="custom-select"><select id="strategy" value={strategy} disabled={thinking} onChange={e => {setStrategy(e.target.value as Strategy); setLatest(null);}}><option value="optimized">Optimized alpha-beta</option><option value="alpha_beta">Basic alpha-beta</option><option value="minimax">Classic minimax</option></select><ChevronDown size={16}/></div>
            <div className="settings-line"><div><span className="setting-name">Show suggested move</span><span className="setting-helper">Analyze the board on your turn</span></div><Toggle checked={showHints} onChange={setShowHints}/></div>
            <div className="settings-line starting"><div><span className="setting-name">First move</span><span className="setting-helper">Applied on new matches</span></div><div className="first-pick"><button className={first === 1 ? 'picked' : ''} onClick={() => {setFirst(1); newGame(1);}}>You</button><button className={first === 2 ? 'picked' : ''} onClick={() => {setFirst(2); newGame(2);}}>AI</button></div></div>
            {showHints && <div className="hint-note"><span>{hintThinking ? 'Analyzing your options…' : hint !== null ? `Suggested: column ${hint+1}` : 'Play a move to see hints.'}</span><span>{showHints ? <Eye size={15}/> : <EyeOff size={15}/>}</span></div>}
          </div>

          <div className="comparison-card">
            <div className="comparison-heading"><Code2 size={19}/><div><strong>Under the hood</strong><span>See the algorithmic difference.</span></div></div>
            <button onClick={runCompare} disabled={comparing || thinking} className="compare-button">{comparing ? 'Benchmarking…' : 'Compare algorithms'}<ArrowRight size={16}/></button>
            {compare && <div className="comparison-results">
              {compareResults.map(({strategy: mode, analysis: result}) => <div key={mode} className="comparison-row"><span>{mode === 'minimax' ? 'Minimax' : mode === 'alpha_beta' ? 'Alpha-beta' : 'Optimized'}</span><strong>{fmt(result.stats.nodes)} nodes</strong></div>)}
              {compareResults.length === 3 && <small>Same depth (4 ply). Move ordering changes pruning efficiency; lower node counts are better.</small>}
            </div>}
          </div>
        </aside>
      </main>

      <footer className="footer"><div><span className="footer-mark">✣</span> FOURFORGE <span className="footer-divider">/</span> ENGINEERING THE NEXT MOVE</div><div>BUILT WITH <span>PYTHON</span> + <span>REACT</span> <span className="footer-heart">✦</span></div></footer>
    </div>
  </div>;
}
