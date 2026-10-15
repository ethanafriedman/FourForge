"""Immutable Connect Four board primitives.

Cells are stored bottom row first. 0 = empty, 1 = coral/human,
2 = blue/AI. The AI can move first, so neither side has a fixed first-turn rule.
"""
from __future__ import annotations

from dataclasses import dataclass

ROWS = 6
COLS = 7
EMPTY = 0
RED = 1
BLUE = 2
CELL_COUNT = ROWS * COLS
CENTER_FIRST = (3, 2, 4, 1, 5, 0, 6)


def _build_lines() -> tuple[tuple[int, ...], ...]:
    lines: list[tuple[int, ...]] = []
    for r in range(ROWS):
        for c in range(COLS - 3):
            lines.append(tuple(r * COLS + c + x for x in range(4)))
    for r in range(ROWS - 3):
        for c in range(COLS):
            lines.append(tuple((r + x) * COLS + c for x in range(4)))
    for r in range(ROWS - 3):
        for c in range(COLS - 3):
            lines.append(tuple((r + x) * COLS + c + x for x in range(4)))
            lines.append(tuple((r + x) * COLS + c + 3 - x for x in range(4)))
    return tuple(lines)


WINNING_LINES = _build_lines()


@dataclass(frozen=True, slots=True)
class Board:
    cells: tuple[int, ...] = (EMPTY,) * CELL_COUNT

    def __post_init__(self) -> None:
        if len(self.cells) != CELL_COUNT:
            raise ValueError("Board must have exactly 42 cells")
        if any(x not in (EMPTY, RED, BLUE) or type(x) is not int for x in self.cells):
            raise ValueError("Board cells must be integers 0, 1, or 2")
        for col in range(COLS):
            gap_seen = False
            for row in range(ROWS):
                if self.cells[row * COLS + col] == EMPTY:
                    gap_seen = True
                elif gap_seen:
                    raise ValueError("Invalid board: floating disc")
        if abs(self.cells.count(RED) - self.cells.count(BLUE)) > 1:
            raise ValueError("Invalid board: player disc counts differ by more than one")

    @classmethod
    def from_rows(cls, rows: list[list[int]]) -> Board:
        if len(rows) != ROWS or any(len(row) != COLS for row in rows):
            raise ValueError("Board must have six bottom-first rows of seven cells")
        return cls(tuple(cell for row in rows for cell in row))

    def rows(self) -> list[list[int]]:
        return [list(self.cells[r * COLS:(r + 1) * COLS]) for r in range(ROWS)]

    def valid_moves(self) -> tuple[int, ...]:
        return tuple(c for c in range(COLS) if self.cells[(ROWS - 1) * COLS + c] == EMPTY)

    def drop(self, col: int, player: int) -> Board:
        if type(col) is not int or not 0 <= col < COLS:
            raise ValueError("Column must be an integer from 0 to 6")
        if player not in (RED, BLUE):
            raise ValueError("Unknown player")
        if self.winner() or self.is_full():
            raise ValueError("The game is already over")
        for row in range(ROWS):
            idx = row * COLS + col
            if self.cells[idx] == EMPTY:
                new_cells = list(self.cells)
                new_cells[idx] = player
                return Board(tuple(new_cells))
        raise ValueError("This column is full")

    def winner(self) -> int:
        cells = self.cells
        for a, b, c, d in WINNING_LINES:
            v = cells[a]
            if v != EMPTY and v == cells[b] == cells[c] == cells[d]:
                return v
        return EMPTY

    def is_full(self) -> bool:
        return all(x != EMPTY for x in self.cells[(ROWS - 1) * COLS:])

    def status(self) -> str:
        victor = self.winner()
        if victor == RED:
            return "red_wins"
        if victor == BLUE:
            return "blue_wins"
        if self.is_full():
            return "draw"
        return "playing"
