from engine.simulations import simulate_vs_random


def test_simulation_results_sum_to_game_count():
    result = simulate_vs_random(games=5, depth=2, seed=10)
    assert result['ai_wins'] + result['random_wins'] + result['draws'] == 5


def test_seeded_simulation_is_reproducible():
    assert simulate_vs_random(4, 2, 7) == simulate_vs_random(4, 2, 7)
