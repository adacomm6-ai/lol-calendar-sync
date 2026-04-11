# Features Update: Player Profiles & Demacia Cup Data

## 1. Player Profile Page (`/players/[id]`)
A comprehensive individual stats page for players.

### Features
-   **Header**: Displays large avatar (Initials fallback), Team info, Role, and aggregate KDA/WinRate.
-   **Stats Grid**: Detailed breakdown of Games, Wins, Average K/D/A, DPM, GPM.
-   **Hero Pool**: Top 5 most played champions with unique Win Rate and KDA tracking.
-   **Match History**:
    -   List of recent matches (last 50).
    -   Includes Result (Win/Loss), Champion (with Auto-Image), KDA, Damage, and Date.
    -   **Context-Aware**: Links directly back to specific Match Details.

### Technical Details
-   **Robust Image Handling**: Implemented `ChampionImage` component to handle missing assets gracefully without crashing the UI.
-   **Data normalization**: Handles both legacy (`teamA.players`) and new (`damage_data`) JSON formats from analysis.

## 2. Demacia Cup 2026 Integration
Full support for the 2026 Demacia Cup tournament data structure.

### Features
-   **Player Linking**: Match detail pages now correctly identify and link players from "2026 Season Cup" rosters.
-   **Data Adaptation**:
    -   Detected that Demacia Cup source data (Damage Charts) often lacks KDA info.
    -   **Smart Fallbacks**: Player Profile displays `-/-/-` or `N/A` for missing KDA instead of misleading `0/0/0`, while preserving partially available stats (e.g., Damage).

## 3. Dual Scoreboard Image Upload
Enhanced the Scoreboard section to support two distinct image upload areas.

### Feature Details
-   **Split Layout**: 2-column grid.
-   **Left Column**: Primary post-game scoreboard.
-   **Right Column**: Supplementary images (Damage charts, etc.).
-   **Persistence**: Independent upload/delete/preview for each slot.
