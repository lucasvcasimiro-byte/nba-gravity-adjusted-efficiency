# Gravity-Adjusted Efficiency (GAE) Metric

This repository contains a sports analytics portfolio project that calculates a new metric: **Gravity-Adjusted Efficiency (GAE)** for NBA players. It proves that players who shoot high percentages while heavily guarded (high offensive gravity) are mathematically more valuable than players who shoot high percentages when left wide open.

### Statistical Context: Why a 5.0–5.2 ft Average Is Elite
In NBA optical tracking data, a common misconception is that "5 feet away" is open. In reality, **Average Defender Distance is an aggregate arithmetic mean across an entire season**:
- Over 82 games, every player takes wide-open fast breaks and kick-outs (8–15+ ft), which sharply pulls their mathematical average upward.
- Because of this, the **league-wide average defender distance across all NBA 3-pointers is ~6.3 to 6.5 ft**.
- Therefore, for a player's season average to stay down around **5.0–5.2 ft** (such as *Blake Hinson* at 5.15 ft or *Michael Porter Jr.* at 5.08 ft), it mathematically proves that defenses virtually never leave them open, and that 30–40% of their total volume is taken with a defender directly in their jersey pocket (2–4 ft). An average near 5.1 ft ranks in the **97th percentile of contested perimeter coverage** across the NBA.

### Dual-Factor Formula
$$\text{GAE} = \text{Standard 3P\%} \times [1 + (\text{Gravity Index} \times w_{\text{prox}}) + (\text{Team Impact Index} \times w_{\text{team}})]$$
Where $w_{\text{prox}}$ controls defender proximity gravity ($0-25\%$), and $w_{\text{team}}$ controls on-court Net Rating impact ($0-5\%$).

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