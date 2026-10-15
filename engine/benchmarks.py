"""Reproducible benchmark of equal-depth minimax variants.

Usage: python -m engine.benchmarks --depth 4 --json benchmarks.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .board import BLUE, RED, Board
from .search import search


POSITIONS = {
    "opening": [],
    "midgame": [3, 2, 3, 2, 4, 1, 4, 1],
    "contested": [3, 3, 2, 4, 2, 4, 1, 5, 5, 1],
}


def make_board(moves: list[int]) -> Board:
    board = Board()
    for i, col in enumerate(moves):
        board = board.drop(col, RED if i % 2 == 0 else BLUE)
    return board


def benchmark(depth: int = 4) -> list[dict]:
    results = []
    for name, moves in POSITIONS.items():
        board = make_board(moves)
        for strategy in ("minimax", "alpha_beta", "optimized"):
            result = search(board, RED, depth, strategy)
            results.append({"position": name, "strategy": strategy,
                            "move": result.column, "score": result.score,
                            **result.stats.as_dict()})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Connect Four search")
    parser.add_argument("--depth", type=int, default=4)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    records = benchmark(args.depth)
    print(f"{'Position':<12} {'Strategy':<13} {'Move':<6} {'Nodes':>9} {'Pruned':>9} {'Time(ms)':>10}")
    print("-" * 70)
    for r in records:
        move = '-' if r['move'] is None else str(r['move'] + 1)
        print(f"{r['position']:<12} {r['strategy']:<13} {move:<6} "
              f"{r['nodes']:>9,} {r['pruned_moves']:>9,} {r['elapsed_ms']:>10.2f}")
    if args.json:
        args.json.write_text(json.dumps(records, indent=2) + "\n")
        print(f"\nSaved {args.json}")


if __name__ == '__main__':
    main()
