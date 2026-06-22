"""Main Dash application"""

import os
from dotenv import load_dotenv

import dash
from dash import dcc, html
import dash_bootstrap_components as dbc

# Load environment variables
load_dotenv()

# Configuration
APP_CONFIG = {
    "DEBUG": os.getenv("DEBUG", "True").lower() == "true",
    "HOST": os.getenv("HOST", "127.0.0.1"),
    "PORT": int(os.getenv("PORT", 8050)),
}


# Initialize the Dash app
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    meta_tags=[
        {"name": "viewport", "content": "width=device-width, initial-scale=1"}
    ],
)

app.title = "KU Gen-AI Dashboard"


# App layout
app.layout = dbc.Container(
    [
        dbc.Row(
            [
                dbc.Col(
                    [
                        html.H1(
                            "KU Gen-AI Dashboard",
                            className="text-center mb-4 mt-4",
                        )
                    ]
                )
            ]
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        dbc.Alert(
                            "Welcome to the KU Gen-AI Dashboard. Start building your dashboard here!",
                            color="info",
                        )
                    ]
                )
            ]
        ),
    ],
    fluid=True,
)


if __name__ == "__main__":
    app.run(
        debug=APP_CONFIG["DEBUG"],
        host=APP_CONFIG["HOST"],
        port=APP_CONFIG["PORT"],
    )
