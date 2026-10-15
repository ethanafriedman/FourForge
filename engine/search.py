"""Depth-limited minimax with alpha-beta pruning and search instrumentation.

The optimized strategy adds center-first move ordering and a transposition
 table with exact/lower/upper bounds to preserve alpha-beta correctness.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter
from typing import Literal

from .board import BLUE, RED, CENTER_FIRST, WINNING_LINES, Board

Strategy = Literal["minimax", "alpha_beta", "optimized"]
WIN_SCORE = 1_000_000


@dataclass
class SearchStats:
    nodes: int = 0
    leaves: int = 0
    cutoffs: int = 0
    pruned_moves: int = 0
    cache_hits: int = 0
    elapsed_ms: float = 0.0
    depth: int = 0

    def as_dict(self) -> dict:
        return {"nodes": self.nodes, "leaves": self.leaves,
                "cutoffs": self.cutoffs, "pruned_moves": self.pruned_moves,
                "cache_hits": self.cache_hits,
                "elapsed_ms": round(self.elapsed_ms, 2), "depth": self.depth}


@dataclass(frozen=True)
class SearchResult:
    column: int | None
    score: int
    principal_variation: tuple[int, ...]
    stats: SearchStats = field(compare=False)


@dataclass(frozen=True)
class _Entry:
    score: int
    pv: tuple[int, ...]
    flag: str  # EXACT, LOWER, or UPPER


def evaluate(board: Board, perspective: int) -> int:
    """Return a relative heuristic score for `perspective` at nonterminal leaves."""
    enemy = RED if perspective == BLUE else BLUE
    cells = board.cells
    center = sum(cells[r * 7 + 3] == perspective for r in range(6))
    enemy_center = sum(cells[r * 7 + 3] == enemy for r in range(6))
    score = (center - enemy_center) * 6
    for line in WINNING_LINES:
        own = sum(cells[i] == perspective for i in line)
        other = sum(cells[i] == enemy for i in line)
        if other == 0:
            score += (0, 2, 14, 105, 0)[own]
        elif own == 0:
            score -= (0, 2, 18, 120, 0)[other]
    return score


def search(board: Board, player: int = BLUE, depth: int = 5,
           strategy: Strategy = "optimized") -> SearchResult:
    """Find the best move with a deterministic depth-limited game-tree search.

    Both players are treated as rational adversaries. Scores always refer to
    the root player. Terminal wins include depth to prefer quicker victories.
    """
    if player not in (RED, BLUE):
        raise ValueError("Player must be 1 or 2")
    if type(depth) is not int or not 1 <= depth <= 7:
        raise ValueError("Depth must be between 1 and 7")
    if strategy not in ("minimax", "alpha_beta", "optimized"):
        raise ValueError("Unknown strategy")
    stats = SearchStats(depth=depth)
    table: dict[tuple[tuple[int, ...], int, int], _Entry] = {}
    started = perf_counter()
    enemy = RED if player == BLUE else BLUE
    pruning = strategy != "minimax"

    def visit(state: Board, current: int, remaining: int,
              alpha: float, beta: float) -> tuple[int, tuple[int, ...]]:
        stats.nodes += 1
        winner = state.winner()
        if winner:
            stats.leaves += 1
            return ((WIN_SCORE + remaining) if winner == player
                    else (-WIN_SCORE - remaining)), ()
        if state.is_full():
            stats.leaves += 1
            return 0, ()
        if remaining == 0:
            stats.leaves += 1
            return evaluate(state, player), ()

        key = (state.cells, current, remaining)
        original_alpha, original_beta = alpha, beta
        if strategy == "optimized" and key in table:
            stats.cache_hits += 1
            entry = table[key]
            if entry.flag == "EXACT":
                return entry.score, entry.pv
            if entry.flag == "LOWER":
                alpha = max(alpha, entry.score)
            else:
                beta = min(beta, entry.score)
            if alpha >= beta:
                stats.cutoffs += 1
                return entry.score, entry.pv

        legal = state.valid_moves()
        order = [col for col in (CENTER_FIRST if strategy == "optimized" else range(7))
                 if col in legal]
        maximizing = current == player
        best = float('-inf') if maximizing else float('inf')
        best_pv: tuple[int, ...] = ()
        next_player = enemy if current == player else player
        for i, col in enumerate(order):
            child = state.drop(col, current)
            score, child_pv = visit(child, next_player, remaining - 1, alpha, beta)
            if (maximizing and score > best) or (not maximizing and score < best):
                best = score
                best_pv = (col,) + child_pv
            if pruning:
                if maximizing:
                    alpha = max(alpha, best)
                else:
                    beta = min(beta, best)
                if alpha >= beta:
                    stats.cutoffs += 1
                    stats.pruned_moves += len(order) - i - 1
                    break
        result = (int(best), best_pv)
        if strategy == "optimized":
            # Bound-aware TT entries are necessary: an alpha-beta cutoff
            # produces a bound, not necessarily an exact minimax value.
            flag = ("UPPER" if result[0] <= original_alpha else
                    "LOWER" if result[0] >= original_beta else "EXACT")
            table[key] = _Entry(*result, flag)
        return result

    score, line = visit(board, player, depth, float('-inf'), float('inf'))
    stats.elapsed_ms = (perf_counter() - started) * 1000
    return SearchResult(column=line[0] if line else None, score=score,
                        principal_variation=line, stats=stats)
