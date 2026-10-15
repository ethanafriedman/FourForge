"""Evaluate the engine against a seeded random-move baseline.

Usage: python -m engine.simulations --games 40 --depth 3 --seed 42
"""
from __future__ import annotations

import argparse
import random

from .board import BLUE, RED, Board
from .search import search


def simulate_vs_random(games: int = 40, depth: int = 3, seed: int = 42) -> dict[str, int]:
    """Play alternating first movers; return wins, losses, and draws."""
    if type(games) is not int or games < 1:
        raise ValueError('games must be positive')
    rng = random.Random(seed)
    outcomes = {"ai_wins": 0, "random_wins": 0, "draws": 0}
    for game in range(games):
        board = Board()
        to_move = BLUE if game % 2 == 0 else RED
        while board.status() == 'playing':
            if to_move == BLUE:
                decision = search(board, BLUE, depth)
                assert decision.column is not None
                column = decision.column
            else:
                column = rng.choice(board.valid_moves())
            board = board.drop(column, to_move)
            to_move = RED if to_move == BLUE else BLUE
        result = board.status()
        if result == 'blue_wins':
            outcomes['ai_wins'] += 1
        elif result == 'red_wins':
            outcomes['random_wins'] += 1
        else:
            outcomes['draws'] += 1
    return outcomes


def main() -> None:
    parser = argparse.ArgumentParser(description='Test engine against a random opponent')
    parser.add_argument('--games', type=int, default=40)
    parser.add_argument('--depth', type=int, default=3)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    result = simulate_vs_random(args.games, args.depth, args.seed)
    print(f"Games: {args.games} · Depth: {args.depth} · Seed: {args.seed}")
    print(f"AI wins: {result['ai_wins']} · Random wins: {result['random_wins']} · Draws: {result['draws']}")


if __name__ == '__main__':
    main()
