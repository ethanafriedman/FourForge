"""Optional accessible terminal gameplay: python -m engine.cli."""
from __future__ import annotations

from .board import BLUE, RED, Board
from .search import search


def display(board: Board) -> None:
    print("\n  1 2 3 4 5 6 7")
    for row in reversed(board.rows()):
        print("  " + " ".join("·XO"[v] for v in row))
    print()


def main() -> None:
    board = Board()
    print("FourForge · Connect Four AI | X: you · O: engine")
    while board.status() == "playing":
        display(board)
        while True:
            answer = input("Choose a column (1–7), or q to quit: ").strip().lower()
            if answer in ("q", "quit"):
                return
            try:
                col = int(answer) - 1
                board = board.drop(col, RED)
                break
            except (ValueError, TypeError):
                print("Please enter a non-full column from 1 to 7.")
        if board.status() != "playing":
            break
        decision = search(board, BLUE, depth=5)
        assert decision.column is not None
        board = board.drop(decision.column, BLUE)
        print(f"Engine plays column {decision.column + 1} "
              f"({decision.stats.nodes:,} states · {decision.stats.cutoffs:,} cutoffs)")
    display(board)
    print({"red_wins": "You win!", "blue_wins": "The engine wins!", "draw": "Draw!"}[board.status()])


if __name__ == "__main__":
    main()
