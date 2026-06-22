"""Application configuration"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# App Configuration
APP_CONFIG = {
    "DEBUG": os.getenv("DEBUG", "True").lower() == "true",
    "HOST": os.getenv("HOST", "127.0.0.1"),
    "PORT": int(os.getenv("PORT", 8050)),
}

# Data Configuration
DATA_CONFIG = {
    "RAW_DATA_PATH": os.path.join(os.path.dirname(__file__), "..", "data", "raw"),
    "PROCESSED_DATA_PATH": os.path.join(
        os.path.dirname(__file__), "..", "data", "processed"
    ),
}

# Logging Configuration
LOGGING_CONFIG = {
    "LOG_LEVEL": os.getenv("LOG_LEVEL", "INFO"),
    "LOG_FILE": os.getenv("LOG_FILE", "logs/app.log"),
}
