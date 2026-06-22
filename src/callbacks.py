"""Dash callbacks for interactive components"""

from dash import callback, Input, Output


# Example callback - add your callbacks here
@callback(
    Output("example-output", "children"),
    Input("example-input", "value"),
)
def update_output(value):
    """Example callback function"""
    if value:
        return f"You entered: {value}"
    return "Enter something to see output"
