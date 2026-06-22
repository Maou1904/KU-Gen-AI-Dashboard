"""Test cases for the Dash application"""

import pytest
from src.app import app


@pytest.fixture
def client():
    """Create a test client for the Dash app"""
    app.config.suppress_callback_exceptions = True
    with app.server.test_client() as client:
        yield client


def test_app_loads(client):
    """Test that the app loads successfully"""
    response = client.get("/")
    assert response.status_code == 200


def test_app_title():
    """Test that the app has the correct title"""
    assert app.title == "KU Gen-AI Dashboard"
