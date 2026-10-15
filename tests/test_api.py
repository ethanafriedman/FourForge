from fastapi.testclient import TestClient

from engine.api import app
from engine.board import Board

client = TestClient(app)


def test_health():
    assert client.get('/api/health').json()['status'] == 'ok'


def test_analyze_returns_valid_move_and_metrics():
    response = client.post('/api/analyze', json={"board": Board().rows(), "depth": 3})
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body['column'] < 7
    assert body['stats']['nodes'] > 1
    assert body['stats']['depth'] == 3
    assert body['principal_variation'][0] == body['column']


def test_rejects_invalid_board():
    response = client.post('/api/analyze', json={"board": [[0, 0]], "depth": 3})
    assert response.status_code == 422


def test_rejects_invalid_strategy():
    response = client.post('/api/analyze', json={"board": Board().rows(), "strategy": 'fake'})
    assert response.status_code == 422


def test_bundled_web_frontend():
    home = client.get('/')
    assert home.status_code == 200
    assert 'FourForge' in home.text
    assert client.get('/app.js').status_code == 200
    assert client.get('/styles.css').status_code == 200
