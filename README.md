# Gravity-Adjusted Efficiency (GAE) Metric

This repository contains a sports analytics portfolio project that calculates a new metric: **Gravity-Adjusted Efficiency (GAE)** for NBA players. It proves that players who shoot high percentages while heavily guarded (high offensive gravity) are mathematically more valuable than players who shoot high percentages when left wide open.

## Project Structure

- `code/`: Contains the `calculate_gae.py` script that pulls data from the `nba_api`, engineers the Gravity Index, and exports the data.
- `app/`: Contains the front-end interactive web application (HTML, CSS, JS) using Plotly.js to visualize the metrics.
- `plots/`: Contains static images generated from previous scripts.

## How to Run the Interactive Web App Locally

The easiest way to view the interactive Plotly graphs is to start a local Python HTTP server.

1. Open your terminal or command prompt.
2. Navigate into the `app/` directory of this project:

   ```bash
   cd app
   ```

3. Start the local Python server. (Note: use your direct path to Python if `python` doesn't work out of the box on Windows):

   ```bash
   C:\Users\lucas\AppData\Local\Python\pythoncore-3.14-64\python.exe -m http.server 8000
   ```

   *(Or simply `python -m http.server 8000` if Python is added to your PATH).*
4. Open your web browser and go to:
   **[http://localhost:8000](http://localhost:8000)**

## Generating Fresh Data

If you want to pull the latest stats from the NBA API and regenerate `gae_data.json` for the web app:

1. Navigate into the `code/` folder:

   ```bash
   cd code
   ```

2. Run the generator script:

   ```bash
   C:\Users\lucas\AppData\Local\Python\pythoncore-3.14-64\python.exe calculate_gae.py
   ```

3. Move the newly generated `gae_data.json` into the `app/` folder so the website can read it.