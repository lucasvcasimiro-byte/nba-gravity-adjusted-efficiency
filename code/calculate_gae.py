import time
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from nba_api.stats.endpoints import leaguedashplayerstats
from nba_api.stats.endpoints import leaguedashplayerptshot
from nba_api.stats.endpoints import leaguedashptdefend
from nba_api.stats.endpoints import leaguedashptstats
from nba_api.stats.endpoints import playerindex

def main():
    print("Fetching Overall Player Stats Data...")
    # 1. Pull Overall Player Stats (All 3s)
    all_stats_data = leaguedashplayerstats.LeagueDashPlayerStats(
        season='2025-26',
        season_type_all_star='Regular Season'
    ).get_data_frames()[0]

    all_stats_data['EFG_PCT'] = (all_stats_data['FGM'] + 0.5 * all_stats_data['FG3M']) / all_stats_data['FGA']

    # Filter for volume shooters (> 100 3PA overall)
    df_stats = all_stats_data[all_stats_data['FG3A'] >= 100].copy()
    
    print(f"Filtered to {len(df_stats)} players with 100+ Total 3PAs.")
    
    print("Fetching Catch and Shoot Data...")
    time.sleep(1)
    cs_data = leaguedashptstats.LeagueDashPtStats(
        player_or_team='Player',
        pt_measure_type='CatchShoot',
        season='2025-26',
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
    
    print("Fetching Defense Data (dashptshotdefend)...")
    time.sleep(1)
    def_data = leaguedashptdefend.LeagueDashPtDefend(
        defense_category='3 Pointers',
        season='2025-26',
        season_type_all_star='Regular Season'
    ).get_data_frames()[0]
    
    df_merged = pd.merge(
        df_merged, 
        def_data[['CLOSE_DEF_PERSON_ID', 'FG3A']], 
        left_on='PLAYER_ID', 
        right_on='CLOSE_DEF_PERSON_ID', 
        how='left'
    )
    df_merged.rename(columns={'FG3A_y': 'DEF_FG3A_CONTESTED', 'FG3A_x': 'FG3A'}, inplace=True)
    
    buckets = {
        '0-2 Feet - Very Tight': 1.0,
        '2-4 Feet - Tight': 3.0,
        '4-6 Feet - Open': 5.0,
        '6+ Feet - Wide Open': 8.0
    }
    
    print("Fetching Closest Defender Distance Buckets...")
    df_dist_all = pd.DataFrame()
    
    for bucket_name, dist_val in buckets.items():
        time.sleep(1) 
        shot_data = leaguedashplayerptshot.LeagueDashPlayerPtShot(
            season='2025-26',
            season_type_all_star='Regular Season',
            close_def_dist_range_nullable=bucket_name
        ).get_data_frames()[0]
        
        shot_data = shot_data[['PLAYER_ID', 'FG3A']].copy()
        shot_data.rename(columns={'FG3A': f'FG3A_{bucket_name}'}, inplace=True)
        
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
    
    df_dist_all['AVG_DEF_DIST'] = (
        (df_dist_all['FG3A_0-2 Feet - Very Tight'] * 1.0) +
        (df_dist_all['FG3A_2-4 Feet - Tight'] * 3.0) +
        (df_dist_all['FG3A_4-6 Feet - Open'] * 5.0) +
        (df_dist_all['FG3A_6+ Feet - Wide Open'] * 8.0)
    ) / df_dist_all['TOTAL_TRACKED_FG3A']
    
    df_final = pd.merge(df_merged, df_dist_all[['PLAYER_ID', 'AVG_DEF_DIST']], on='PLAYER_ID', how='inner')
    
    league_avg_dist = df_final['AVG_DEF_DIST'].mean()
    print(f"League Average Defender Distance on 3s: {league_avg_dist:.2f} feet")
    
    df_final['PROXIMITY_DELTA'] = league_avg_dist - df_final['AVG_DEF_DIST']
    
    delta_mean = df_final['PROXIMITY_DELTA'].mean()
    delta_std = df_final['PROXIMITY_DELTA'].std()
    df_final['Gravity_Index'] = (df_final['PROXIMITY_DELTA'] - delta_mean) / delta_std
    
    weight_multiplier = 0.05
    df_final['GAE'] = df_final['FG3_PCT'] * (1 + (df_final['Gravity_Index'] * weight_multiplier))
    
    df_final['GAE_DIFF'] = df_final['GAE'] - df_final['FG3_PCT']
    df_final = df_final.sort_values('GAE_DIFF', ascending=False).reset_index(drop=True)
    
    bins = [99, 200, 300, 400, 500, float('inf')]
    labels = ['100-200 3PA', '201-300 3PA', '301-400 3PA', '401-500 3PA', '500+ 3PA']
    df_final['Volume_Category'] = pd.cut(df_final['FG3A'], bins=bins, labels=labels, right=True)
    
    # Target players
    target_substrings = ['Luka', 'LaMelo', 'Jamal Murray', 'Donovan Mitchell', 
                         'Tyrese Maxey', 'Kon Knueppel', 'Wembanyama', 'LeBron', 
                         'Stephen Curry', 'Gilgeous-Alexander']
                         
    target_df = df_final[df_final['PLAYER_NAME'].str.contains('|'.join(target_substrings), case=False, na=False)]
    
    # --- PLOT 1: Scatter Plot ---
    plt.figure(figsize=(12, 8))
    sns.set_style("whitegrid")
    
    sns.scatterplot(
        data=df_final, 
        x='FG3_PCT', 
        y='GAE', 
        hue='Volume_Category',
        palette='viridis',
        s=100,
        edgecolor='k',
        alpha=0.6
    )
    
    min_val = min(df_final['FG3_PCT'].min(), df_final['GAE'].min()) - 0.02
    max_val = max(df_final['FG3_PCT'].max(), df_final['GAE'].max()) + 0.02
    plt.plot([min_val, max_val], [min_val, max_val], color='black', linestyle='--', label='y=x (No Gravity Impact)')
    
    top_5 = df_final.head(5)
    bottom_5 = df_final.tail(5)
    notable_players = pd.concat([top_5, bottom_5, target_df]).drop_duplicates(subset=['PLAYER_ID'])
    
    for _, row in notable_players.iterrows():
        # Draw a line from the y=x point to the actual point to emphasize the delta
        plt.plot([row['FG3_PCT'], row['FG3_PCT']], [row['FG3_PCT'], row['GAE']], color='gray', linestyle=':', alpha=0.5)
        
        plt.annotate(
            row['PLAYER_NAME'], 
            (row['FG3_PCT'], row['GAE']),
            textcoords="offset points", 
            xytext=(0, 8), 
            ha='center',
            fontsize=9,
            fontweight='bold',
            color='black'
        )
        
    plt.title("Gravity-Adjusted Efficiency (GAE) vs Standard 3P%", fontsize=16)
    plt.xlabel("Standard Overall 3P%", fontsize=14)
    plt.ylabel("Gravity-Adjusted Efficiency (GAE)", fontsize=14)
    plt.legend()
    plt.tight_layout()
    plt.savefig('gravity_adjusted_efficiency.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    # --- PLOT 2: All 3s vs Proximity (Reverted to original design) ---
    plt.figure(figsize=(12, 8))
    sns.set_style("whitegrid")
    
    sns.scatterplot(
        data=df_final, 
        x='AVG_DEF_DIST', 
        y='FG3_PCT', 
        hue='Volume_Category',
        palette='viridis',
        s=80,
        edgecolor='k',
        alpha=0.7
    )
    
    sns.regplot(
        data=df_final, 
        x='AVG_DEF_DIST', 
        y='FG3_PCT', 
        scatter=False, 
        color='darkgreen', 
        line_kws={"linestyle": "--"}
    )
    
    notable_proximity_players = pd.concat([
        df_final.nsmallest(3, 'AVG_DEF_DIST'),
        df_final.nlargest(3, 'AVG_DEF_DIST'),
        df_final.nlargest(3, 'FG3_PCT'),
        df_final.nsmallest(3, 'FG3_PCT'),
        target_df
    ]).drop_duplicates(subset=['PLAYER_ID'])
    
    for _, row in notable_proximity_players.iterrows():
        plt.annotate(
            row['PLAYER_NAME'], 
            (row['AVG_DEF_DIST'], row['FG3_PCT']),
            textcoords="offset points", 
            xytext=(0, 10), 
            ha='center',
            fontsize=8,
            fontweight='bold',
            color='black'
        )
    
    plt.title("Standard Overall 3P% vs Average Defender Proximity", fontsize=16)
    plt.xlabel("Average Defender Distance (feet)", fontsize=14)
    plt.ylabel("Standard Overall 3P%", fontsize=14)
    plt.legend(loc='lower right', bbox_to_anchor=(1.15, 0))
    plt.tight_layout()
    plt.savefig('all_3s_vs_proximity.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    # --- PLOT 3: Dumbbell Plot (Alternative GAE visualization) ---
    # Sort notable players by GAE for the plot
    dumbbell_df = notable_players.sort_values('GAE', ascending=True)
    
    plt.figure(figsize=(10, 8))
    sns.set_style("whitegrid")
    
    # Draw lines connecting std 3P% to GAE
    plt.hlines(y=range(len(dumbbell_df)), xmin=dumbbell_df[['FG3_PCT', 'GAE']].min(axis=1), 
               xmax=dumbbell_df[['FG3_PCT', 'GAE']].max(axis=1), color='grey', alpha=0.4)
    
    # Draw points for std 3P%
    plt.scatter(dumbbell_df['FG3_PCT'], range(len(dumbbell_df)), color='darkred', alpha=1, label='Standard 3P%', s=80, zorder=3)
    # Draw points for GAE
    plt.scatter(dumbbell_df['GAE'], range(len(dumbbell_df)), color='mediumseagreen', alpha=1, label='GAE', s=80, zorder=3)
    
    plt.yticks(range(len(dumbbell_df)), dumbbell_df['PLAYER_NAME'], fontsize=10)
    plt.title("Gravity Impact: Standard 3P% vs GAE (Selected Players)", fontsize=16)
    plt.xlabel("Efficiency (%)", fontsize=14)
    plt.legend(loc='lower right')
    
    # Annotate the differences
    for i, (_, row) in enumerate(dumbbell_df.iterrows()):
        diff = row['GAE'] - row['FG3_PCT']
        text_x = max(row['FG3_PCT'], row['GAE']) + 0.005
        color = 'green' if diff > 0 else 'red'
        plt.text(text_x, i, f"{diff*100:+.1f}%", va='center', color=color, fontweight='bold', fontsize=9)
        
    plt.tight_layout()
    plt.savefig('gae_dumbbell.png', dpi=300, bbox_inches='tight')
    print("Plot saved to 'gae_dumbbell.png'")

    # --- PLOT 3: Catch & Shoot vs Proximity ---
    plt.figure(figsize=(12, 8))
    sns.set_style("whitegrid")
    
    # User wanted C&S 3s attempted added and the contested filters removed.
    sns.scatterplot(
        data=df_final, 
        x='AVG_DEF_DIST', 
        y='CATCH_SHOOT_FG3_PCT', 
        hue='CATCH_SHOOT_FG3A',
        size='CATCH_SHOOT_FG3A',
        sizes=(40, 250),
        palette='viridis',
        edgecolor='k',
        alpha=0.8
    )
    
    sns.regplot(
        data=df_final, 
        x='AVG_DEF_DIST', 
        y='CATCH_SHOOT_FG3_PCT', 
        scatter=False, 
        color='darkgreen', 
        line_kws={"linestyle": "--"}
    )
    
    for _, row in notable_proximity_players.iterrows():
        plt.annotate(
            row['PLAYER_NAME'], 
            (row['AVG_DEF_DIST'], row['CATCH_SHOOT_FG3_PCT']),
            textcoords="offset points", 
            xytext=(0, 10), 
            ha='center',
            fontsize=8,
            fontweight='bold',
            color='black'
        )
    
    plt.title("Catch & Shoot 3P% vs Average Defender Proximity", fontsize=16)
    plt.xlabel("Average Defender Distance (feet)", fontsize=14)
    plt.ylabel("Catch & Shoot 3P%", fontsize=14)
    
    # Extract just the size legend if we used size
    plt.legend(loc='lower right', bbox_to_anchor=(1.15, 0), title="C&S 3PA")
    plt.tight_layout()
    plt.savefig('catch_shoot_vs_proximity.png', dpi=300, bbox_inches='tight')
    print("Plot saved to 'catch_shoot_vs_proximity.png'")
    plt.close()

    # --- Export to JSON for Web App ---
    print("Fetching Player Index (for Team & Position)...")
    time.sleep(1)
    try:
        pi_data = playerindex.PlayerIndex(season='2025-26').get_data_frames()[0]
        df_final = pd.merge(df_final, pi_data[['PERSON_ID', 'POSITION']], left_on='PLAYER_ID', right_on='PERSON_ID', how='left')
    except Exception as e:
        print(f"Warning: Could not fetch player index: {e}")
        df_final['POSITION'] = "N/A"
        if 'TEAM_ABBREVIATION' not in df_final.columns:
            df_final['TEAM_ABBREVIATION'] = "N/A"

    export_cols = [
        'PLAYER_ID', 'PLAYER_NAME', 'TEAM_ABBREVIATION', 'POSITION', 'FG3A', 'FG3_PCT', 
        'CATCH_SHOOT_FG3A', 'CATCH_SHOOT_FG3_PCT', 
        'AVG_DEF_DIST', 'PROXIMITY_DELTA', 'Gravity_Index', 'GAE', 'GAE_DIFF'
    ]
    df_export = df_final[export_cols].copy()
    df_export['is_target'] = df_export['PLAYER_NAME'].str.contains('|'.join(target_substrings), case=False, na=False)
    
    # Identify top 5 and bottom 5 for special highlighting
    top_5_ids = df_final.head(5)['PLAYER_ID'].tolist()
    bottom_5_ids = df_final.tail(5)['PLAYER_ID'].tolist()
    
    def get_group(row):
        if row['PLAYER_ID'] in top_5_ids: return 'Top 5'
        if row['PLAYER_ID'] in bottom_5_ids: return 'Bottom 5'
        if row['is_target']: return 'Target Player'
        return 'Standard'
        
    df_export['Group'] = df_export.apply(get_group, axis=1)
    df_export.to_json('gae_data.json', orient='records')
    print("Data successfully exported to 'gae_data.json' for the web app!")

if __name__ == "__main__":
    main()
