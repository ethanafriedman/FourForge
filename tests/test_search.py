from engine.board import BLUE, RED, Board
from engine.search import WIN_SCORE, search


def create_position(columns):
    b = Board()
    for i, col in enumerate(columns):
        b = b.drop(col, RED if i % 2 == 0 else BLUE)
    return b


def test_immediate_win():
    b = create_position([0, 3, 1, 3, 2, 3, 6])
    assert search(b, BLUE, 4).column == 3


def test_blocks_immediate_loss():
    b = create_position([0, 6, 1, 6, 2])
    assert search(b, BLUE, 4).column == 3


def test_terminal_state_is_checked_before_any_new_move():
    b = create_position([0, 6, 1, 6, 2, 5, 3])
    result = search(b, BLUE, 5)
    assert result.column is None
    assert result.score < -WIN_SCORE
    assert result.stats.nodes == 1


def test_same_optimal_score_for_all_three_algorithms():
    for cols in ([], [3, 2, 3, 2, 4, 1], [0, 6, 1, 6, 2]):
        b = create_position(cols)
        player = RED if len(cols) % 2 == 0 else BLUE
        results = [search(b, player, 4, s) for s in ('minimax', 'alpha_beta', 'optimized')]
        assert len({r.score for r in results}) == 1


def test_alpha_beta_prunes_on_opening():
    b = Board()
    brute = search(b, RED, 4, 'minimax')
    fast = search(b, RED, 4, 'optimized')
    assert fast.stats.nodes < brute.stats.nodes
    assert fast.stats.cutoffs > 0


def test_valid_search_parameters():
    import pytest
    with pytest.raises(ValueError):
        search(Board(), depth=0)
    with pytest.raises(ValueError):
        search(Board(), strategy='unknown')


def test_randomized_positions_agree_with_full_minimax():
    import random
    rng = random.Random(2026)
    for _ in range(20):
        board = Board()
        current = RED
        for _ in range(rng.randrange(0, 14)):
            if board.status() != 'playing':
                break
            board = board.drop(rng.choice(board.valid_moves()), current)
            current = RED if current == BLUE else BLUE
        if board.status() != 'playing':
            continue
        baseline = search(board, current, 3, 'minimax')
        optimized = search(board, current, 3, 'optimized')
        assert baseline.score == optimized.score
