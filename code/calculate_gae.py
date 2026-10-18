import os
import time
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from nba_api.stats.endpoints import leaguedashplayerstats
from nba_api.stats.endpoints import leaguedashplayerptshot
from nba_api.stats.endpoints import leaguedashptdefend
from nba_api.stats.endpoints import leaguedashptstats
from nba_api.stats.endpoints import leaguedashplayershotlocations
from nba_api.stats.endpoints import playerindex

def calculate_season(season='2025-26', min_3pa=60):
    print(f"\n==========================================")
    print(f" Processing NBA Season: {season} (Min 3PA: {min_3pa})")
    print(f"==========================================")

    # 1. Pull Overall Player Stats
    print("1/7 Fetching Overall Player Stats Data...")
    all_stats_data = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star='Regular Season'
    ).get_data_frames()[0]

    all_stats_data['EFG_PCT'] = (all_stats_data['FGM'] + 0.5 * all_stats_data['FG3M']) / all_stats_data['FGA']
    df_stats = all_stats_data[all_stats_data['FG3A'] >= min_3pa].copy()
    print(f"Filtered to {len(df_stats)} players with {min_3pa}+ Total 3PAs.")

    # 2. Catch & Shoot Stats
    print("2/7 Fetching Catch and Shoot Data...")
    time.sleep(1)
    cs_data = leaguedashptstats.LeagueDashPtStats(
        player_or_team='Player',
        pt_measure_type='CatchShoot',
        season=season,
        season_type_all_star='Regular Season'
    ).get_data_frames()[0]

    df_merged = pd.merge(
        df_stats, 
        cs_data[['PLAYER_ID', 'CATCH_SHOOT_FG3A', 'CATCH_SHOOT_FG3_PCT']], 
        on='PLAYER_ID', 
        how='left'
    )
    df_merged['CATCH_SHOOT_FG3A'] = df_merged['CATCH_SHOOT_FG3A'].fillna(0)
    df_merged['CATCH_SHOOT_FG3_PCT'] = df_merged['CATCH_SHOOT_FG3_PCT'].fillna(0)

    # 3. Pull-Up Stats
    print("3/7 Fetching Pull-Up Stats...")
    time.sleep(1)
    try:
        pu_data = leaguedashptstats.LeagueDashPtStats(
            player_or_team='Player',
            pt_measure_type='PullUpShot',
            season=season,
            season_type_all_star='Regular Season'
        ).get_data_frames()[0]
        df_merged = pd.merge(
            df_merged,
            pu_data[['PLAYER_ID', 'PULL_UP_FG3A', 'PULL_UP_FG3_PCT']],
            on='PLAYER_ID',
            how='left'
        )
        df_merged['PULL_UP_FG3A'] = df_merged['PULL_UP_FG3A'].fillna(0)
        df_merged['PULL_UP_FG3_PCT'] = df_merged['PULL_UP_FG3_PCT'].fillna(0)
    except Exception as e:
        print(f"Warning on pull-up stats: {e}")
        df_merged['PULL_UP_FG3A'] = 0
        df_merged['PULL_UP_FG3_PCT'] = 0

    # 4. Closest Defender Distance Buckets
    print("4/7 Fetching Closest Defender Distance Buckets...")
    buckets = {
        '0-2 Feet - Very Tight': 1.0,
        '2-4 Feet - Tight': 3.0,
        '4-6 Feet - Open': 5.0,
        '6+ Feet - Wide Open': 8.0
    }
    df_dist_all = pd.DataFrame()
    for bucket_name, dist_val in buckets.items():
        time.sleep(1)
        shot_data = leaguedashplayerptshot.LeagueDashPlayerPtShot(
            season=season,
            season_type_all_star='Regular Season',
            close_def_dist_range_nullable=bucket_name
        ).get_data_frames()[0]

        shot_data = shot_data[['PLAYER_ID', 'FG3A', 'FG3_PCT']].copy()
        shot_data.rename(columns={
            'FG3A': f'FG3A_{bucket_name}',
            'FG3_PCT': f'FG3_PCT_{bucket_name}'
        }, inplace=True)

        if df_dist_all.empty:
            df_dist_all = shot_data
        else:
            df_dist_all = pd.merge(df_dist_all, shot_data, on='PLAYER_ID', how='outer')

    df_dist_all.fillna(0, inplace=True)
    df_dist_all['TOTAL_TRACKED_FG3A'] = (
        df_dist_all['FG3A_0-2 Feet - Very Tight'] +
        df_dist_all['FG3A_2-4 Feet - Tight'] +
        df_dist_all['FG3A_4-6 Feet - Open'] +
        df_dist_all['FG3A_6+ Feet - Wide Open']
    )
    tracked_safe = df_dist_all['TOTAL_TRACKED_FG3A'].replace(0, 1)
    df_dist_all['AVG_DEF_DIST'] = (
        (df_dist_all['FG3A_0-2 Feet - Very Tight'] * 1.0) +
        (df_dist_all['FG3A_2-4 Feet - Tight'] * 3.0) +
        (df_dist_all['FG3A_4-6 Feet - Open'] * 5.0) +
        (df_dist_all['FG3A_6+ Feet - Wide Open'] * 8.0)
    ) / tracked_safe

    df_dist_all['PCT_VERY_TIGHT'] = (df_dist_all['FG3A_0-2 Feet - Very Tight'] / tracked_safe) * 100
    df_dist_all['PCT_TIGHT'] = (df_dist_all['FG3A_2-4 Feet - Tight'] / tracked_safe) * 100
    df_dist_all['PCT_OPEN'] = (df_dist_all['FG3A_4-6 Feet - Open'] / tracked_safe) * 100
    df_dist_all['PCT_WIDE_OPEN'] = (df_dist_all['FG3A_6+ Feet - Wide Open'] / tracked_safe) * 100

    cols_dist = [
        'PLAYER_ID', 'AVG_DEF_DIST', 
        'PCT_VERY_TIGHT', 'PCT_TIGHT', 'PCT_OPEN', 'PCT_WIDE_OPEN',
        'FG3_PCT_0-2 Feet - Very Tight', 'FG3_PCT_2-4 Feet - Tight',
        'FG3_PCT_4-6 Feet - Open', 'FG3_PCT_6+ Feet - Wide Open'
    ]
    df_final = pd.merge(df_merged, df_dist_all[cols_dist], on='PLAYER_ID', how='inner')

    # 5. Advanced Stats (On-Court Team Impact)
    print("5/7 Fetching Advanced Stats for Team Impact...")
    time.sleep(1)
    adv_data = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        measure_type_detailed_defense='Advanced'
    ).get_data_frames()[0]

    adv_cols = ['PLAYER_ID', 'NET_RATING', 'OFF_RATING', 'DEF_RATING', 'TS_PCT']
    df_final = pd.merge(df_final, adv_data[adv_cols], on='PLAYER_ID', how='left')
    df_final['NET_RATING'] = df_final['NET_RATING'].fillna(0)
    df_final['OFF_RATING'] = df_final['OFF_RATING'].fillna(100)
    if 'W_PCT' in df_final.columns:
        df_final['W_PCT'] = df_final['W_PCT'].fillna(0.5)

    # 6. Shot Locations Breakdown (Court Heatmaps)
    print("6/7 Fetching Shot Locations Breakdown for Court Heatmaps...")
    time.sleep(1)
    try:
        loc_data = leaguedashplayershotlocations.LeagueDashPlayerShotLocations(season=season).get_data_frames()[0]
        loc_data.columns = ['_'.join(c).strip('_') for c in loc_data.columns.values]
        zone_map = {
            'Restricted Area_FGA': 'ZONE_RA_FGA',
            'Restricted Area_FG_PCT': 'ZONE_RA_PCT',
            'In The Paint (Non-RA)_FGA': 'ZONE_PAINT_FGA',
            'In The Paint (Non-RA)_FG_PCT': 'ZONE_PAINT_PCT',
            'Mid-Range_FGA': 'ZONE_MID_FGA',
            'Mid-Range_FG_PCT': 'ZONE_MID_PCT',
            'Left Corner 3_FGA': 'ZONE_LC3_FGA',
            'Left Corner 3_FG_PCT': 'ZONE_LC3_PCT',
            'Right Corner 3_FGA': 'ZONE_RC3_FGA',
            'Right Corner 3_FG_PCT': 'ZONE_RC3_PCT',
            'Above the Break 3_FGA': 'ZONE_AB3_FGA',
            'Above the Break 3_FG_PCT': 'ZONE_AB3_PCT'
        }
        loc_subset = loc_data[['PLAYER_ID'] + [c for c in zone_map.keys() if c in loc_data.columns]].copy()
        loc_subset.rename(columns=zone_map, inplace=True)
        df_final = pd.merge(df_final, loc_subset, on='PLAYER_ID', how='left')
    except Exception as e:
        print(f"Warning on shot locations: {e}")

    for col in df_final.columns:
        if col.startswith('ZONE_'):
            df_final[col] = df_final[col].fillna(0)

    # Gravity Index (Proximity Z-Score)
    league_avg_dist = df_final['AVG_DEF_DIST'].mean()
    df_final['PROXIMITY_DELTA'] = league_avg_dist - df_final['AVG_DEF_DIST']
    delta_mean = df_final['PROXIMITY_DELTA'].mean()
    delta_std = df_final['PROXIMITY_DELTA'].std()
    df_final['Gravity_Index'] = (df_final['PROXIMITY_DELTA'] - delta_mean) / delta_std

    # Team Impact Index (Net Rating Z-Score)
    net_mean = df_final['NET_RATING'].mean()
    net_std = df_final['NET_RATING'].std()
    if net_std == 0: net_std = 1
    df_final['Team_Impact_Index'] = (df_final['NET_RATING'] - net_mean) / net_std

    # Default Baseline GAE (w_prox = 0.05, w_team = 0.015)
    w_prox = 0.05
    w_team = 0.015
    df_final['GAE'] = df_final['FG3_PCT'] * (
        1 + (df_final['Gravity_Index'] * w_prox) + (df_final['Team_Impact_Index'] * w_team)
    )
    df_final['GAE_DIFF'] = df_final['GAE'] - df_final['FG3_PCT']
    df_final = df_final.sort_values('GAE_DIFF', ascending=False).reset_index(drop=True)

    # Volume Category
    bins = [59, 150, 250, 350, 500, float('inf')]
    labels = ['60-150 3PA', '151-250 3PA', '251-350 3PA', '351-500 3PA', '500+ 3PA']
    df_final['Volume_Category'] = pd.cut(df_final['FG3A'], bins=bins, labels=labels, right=True)

    # 7. Player Index (Position and Team)
    print("7/7 Fetching Player Index for Position/Team...")
    time.sleep(1)
    try:
        pi_data = playerindex.PlayerIndex(season=season).get_data_frames()[0]
        df_final = pd.merge(df_final, pi_data[['PERSON_ID', 'POSITION']], left_on='PLAYER_ID', right_on='PERSON_ID', how='left')
    except Exception as e:
        print(f"Warning player index: {e}")
        if 'POSITION' not in df_final.columns:
            df_final['POSITION'] = 'N/A'

    target_substrings = ['Luka', 'LaMelo', 'Jamal Murray', 'Donovan Mitchell', 
                         'Tyrese Maxey', 'Kon Knueppel', 'Wembanyama', 'LeBron', 
                         'Stephen Curry', 'Gilgeous-Alexander', 'Tatum', 'Durant', 'Haliburton']
    df_final['is_target'] = df_final['PLAYER_NAME'].str.contains('|'.join(target_substrings), case=False, na=False)

    top_5_ids = df_final.head(5)['PLAYER_ID'].tolist()
    bottom_5_ids = df_final.tail(5)['PLAYER_ID'].tolist()

    def get_group(row):
        if row['PLAYER_ID'] in top_5_ids: return 'Top 5'
        if row['PLAYER_ID'] in bottom_5_ids: return 'Bottom 5'
        if row['is_target']: return 'Target Player'
        return 'Standard'

    df_final['Group'] = df_final.apply(get_group, axis=1)

    return df_final

def main():
    os.makedirs('app/data', exist_ok=True)

    # 1. Generate 2025-26
    df_2025 = calculate_season('2025-26', min_3pa=60)
    df_2025.to_json('app/data/gae_data_2025_26.json', orient='records')
    df_2025.to_json('app/gae_data.json', orient='records')
    print("Exported 2025-26 data to app/data/gae_data_2025_26.json and app/gae_data.json")

    # 2. Generate 2024-25
    df_2024 = calculate_season('2024-25', min_3pa=80)
    df_2024.to_json('app/data/gae_data_2024_25.json', orient='records')
    print("Exported 2024-25 data to app/data/gae_data_2024_25.json")

if __name__ == '__main__':
    main()
