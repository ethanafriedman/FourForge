import pytest

from engine.board import Board, RED, BLUE, WINNING_LINES


def test_game_starts_empty():
    board = Board()
    assert board.valid_moves() == tuple(range(7))
    assert len(WINNING_LINES) == 69
    assert board.status() == 'playing'


def test_stacking_and_full_column():
    board = Board()
    for i in range(6):
        board = board.drop(0, RED if i % 2 == 0 else BLUE)
    assert 0 not in board.valid_moves()
    with pytest.raises(ValueError, match='full'):
        board.drop(0, RED)


def test_horizontal_win():
    b = Board()
    for c in range(4):
        b = b.drop(c, RED)
        if c < 3:
            b = b.drop(c, BLUE)
    assert b.winner() == RED


def test_vertical_win():
    b = Board()
    for _ in range(3):
        b = b.drop(0, RED).drop(1, BLUE)
    b = b.drop(0, RED)
    assert b.winner() == RED


def test_diagonal_win():
    b = Board()
    # R at (0,0), (1,1), (2,2), (3,3), with supporting B discs.
    seq = [0, 1, 1, 2, 5, 2, 2, 3, 6, 3, 4, 3, 3]
    for i, col in enumerate(seq):
        b = b.drop(col, RED if i % 2 == 0 else BLUE)
    assert b.winner() == RED


def test_invalid_floating_disc_and_shape():
    rows = [[0] * 7 for _ in range(6)]
    rows[1][0] = RED
    with pytest.raises(ValueError, match='floating'):
        Board.from_rows(rows)
    with pytest.raises(ValueError, match='six'):
        Board.from_rows([[0] * 7])


def test_immutable():
    start = Board()
    after = start.drop(3, RED)
    assert start.cells[3] == 0
    assert after.cells[3] == RED


def test_terminal_drop_rejected():
    b = Board()
    for c in range(3):
        b = b.drop(c, RED).drop(c, BLUE)
    b = b.drop(3, RED)
    with pytest.raises(ValueError, match='over'):
        b.drop(4, BLUE)
