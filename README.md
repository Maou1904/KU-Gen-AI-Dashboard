# KU-Gen-AI-Dashboard

A dashboard application built with Dash for visualizing and analyzing data.

## Project Structure

```
KU-Gen-AI-Dashboard/
├── src/                      # Main application source code
│   ├── app.py               # Main Dash application
│   ├── callbacks.py         # Dash callbacks
│   ├── layouts.py           # UI layout components
│   └── __init__.py
├── assets/                  # CSS, JS, images
├── data/                    # Data files
│   ├── raw/                # Raw data
│   └── processed/          # Processed data
├── config/                  # Configuration files
│   └── config.py           # App configuration
├── tests/                   # Test files
├── .env.example            # Environment variables template
├── requirements.txt        # Python dependencies
├── README.md              # This file
└── .gitignore             # Git ignore rules
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd KU-Gen-AI-Dashboard
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
```

## Running the Application

```bash
python src/app.py
```

The application will be available at `http://localhost:8050`

## Development

### Running Tests
```bash
pytest tests/
```

### Code Style
Follow PEP 8 style guidelines.

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Test your changes
4. Submit a pull request

## License

This project is part of KU's Gen-AI initiative.
