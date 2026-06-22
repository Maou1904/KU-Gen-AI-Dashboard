"""Reusable layout components"""

import dash_bootstrap_components as dbc
from dash import html


def create_header():
    """Create application header"""
    return dbc.Row(
        [
            dbc.Col(
                [
                    html.H1("KU Gen-AI Dashboard"),
                    html.Hr(),
                ]
            )
        ]
    )


def create_footer():
    """Create application footer"""
    return dbc.Row(
        [
            dbc.Col(
                [
                    html.Hr(),
                    html.P("© 2024 Kasetsart University Gen-AI Initiative"),
                ]
            )
        ]
    )
