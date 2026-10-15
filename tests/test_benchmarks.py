from engine.benchmarks import benchmark


def test_benchmark_produces_complete_algorithms():
    records = benchmark(depth=2)
    assert len(records) == 9
    assert set(r['strategy'] for r in records) == {'minimax', 'alpha_beta', 'optimized'}
    for name in {'opening', 'midgame', 'contested'}:
        scores = {r['score'] for r in records if r['position'] == name}
        assert len(scores) == 1
