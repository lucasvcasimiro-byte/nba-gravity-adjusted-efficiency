# Gravity-Adjusted Efficiency (GAE) Metric

This repository contains a sports analytics portfolio project that calculates a new metric: **Gravity-Adjusted Efficiency (GAE)** for NBA players. It proves that players who shoot high percentages while heavily guarded (high offensive gravity) are mathematically more valuable than players who shoot high percentages when left wide open.

## Project Structure

- `code/`: Contains the `calculate_gae.py` script that pulls data from the `nba_api`, engineers the Gravity Index, and exports the data.
- `app/`: Contains the front-end interactive web application (HTML, CSS, JS) using Plotly to visualize the metrics.
- `plots/`: Contains static images generated from previous scripts.

## How to Run the Interactive Web App Locally

The easiest way to view the interactive Plotly graphs is to start a local Python HTTP server.

1. Open your terminal or command prompt.
2. Navigate into the `app/` directory of this project:

   ```bash
   cd app
   ```

3. Start the local Python server:

   ```bash
   python -m http.server 8000
   ```
   *(Note: If you are on Windows and get a "Python was not found" error, use `py` instead: `py -m http.server 8000`. On Mac/Linux, you may need to use `python3 -m http.server 8000`)*
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
   python calculate_gae.py
   ```
   *(Note: If you get a "Python was not found" error, try using `py calculate_gae.py` on Windows, or `python3 calculate_gae.py` on Mac/Linux).*

3. Move the newly generated `gae_data.json` into the `app/` folder so the website can read it.
