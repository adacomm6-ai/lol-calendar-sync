# Match Detail Page Redesign

## Goal
1.  **Layout**: Reorder columns to [Odds Comparison] -> [Match Analysis] -> [Analyst Comments].
2.  **Odds Component**:
    -   Remove separate "Match Result" UI card.
    -   Display "Match Result" as a highlighted row within the market list.
    -   Enable direct editing of result values in this row.

## Proposed Changes

#### [MODIFY] [prisma/schema.prisma](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/prisma/schema.prisma)
- Add `screenshot2` String? to `Game` model.

#### [MODIFY] [src/app/entry/upload/actions.ts](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/app/entry/upload/actions.ts)
- Update `updateGameScreenshot` and `deleteGameScreenshot` to accept `type` param ('main' | 'supplementary').

#### [MODIFY] [AnalysisCharts.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/components/analysis/AnalysisCharts.tsx)
- Split Scoreboard area into two columns.
- Left: Main Screenshot (Scoreboard).
- Right: Supplementary Screenshot.
- Update upload handlers to pass correct type.

#### [MODIFY] [MatchGameView.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/components/analysis/MatchGameView.tsx)
- Pass `screenshot2` data to `AnalysisCharts`.

### [Match Detail Layout]
#### [MODIFY] [MatchDetailClient.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/components/MatchDetailClient.tsx)
- Remove `OddsManager` from Left Col/Row 2.
- Allow Header (Row 1) to expand and fill Left Col.
- Pass `odds` to `MatchAnalysisClient` for downstream rendering.

#### [MODIFY] [MatchAnalysisClient.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/components/analysis/MatchAnalysisClient.tsx)
- Accept `odds` prop.
- Pass `odds` to `MatchGameView`.

#### [MODIFY] [MatchGameView.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/components/analysis/MatchGameView.tsx)
- Import `OddsManager`.
- Render `OddsManager` inside the main container, positioned below `GameSummaryPanel` and above `AnalysisCharts` (Scoreboard).

### [Odds Component]
#### [MODIFY] [src/components/analysis/OddsManager.tsx](file:///d:/Antigravity/网站/lol-data-system/src/components/analysis/OddsManager.tsx)
-   **Refactor `renderResultCard`**:
    -   Change return JSX to match the structure of `renderOddsRow` (Height 14 (h-14), flex layout).
    -   **Style**: Use a distinct border or text color (e.g., Pink/Purple/Emerald) to indicate it's the "Result".
    -   **Content Mapping**:
        -   **Winner**: Left/Right buttons show Team Names. Highlight the winner. Click to toggle winner (or select).
        -   **Handicap**: Left/Right buttons show Kills/Score. Click to edit numbers.
        -   **Time**: Center displays Duration. Click to edit.
        -   **Kills**: Center displays Total Kills. Click to edit.
    -   **Editing**:
        -   Remove the "Edit Result" button from header.
        -   Add "Edit" pencil icon to the Result Row (similar to Odds Row).
        -   When editing, show input fields inline.

## Verification Plan
1.  **Layout**: Visually check the column order.
2.  **Odds**:
    -   Verify "Result" appears as a row in the list.
    -   Verify "Result" row is highlighted.
    -   Click "Edit" on Result row -> Inputs appear -> Save -> Updates DB.

### [Player Profile Page]
#### [NEW] [src/app/players/[id]/page.tsx](file:///d:/Antigravity/网站/lol-data-system/src/app/players/[id]/page.tsx)
-   **Dynamic Route**: `/players/[id]`
-   **Data Fetching**:
    -   Fetch `Player` by ID.
    -   Fetch `PlayerGameStats` (or filter `Game` data) to calculate statistics.
-   **UI Layout**:
    -   **Header**: Large Avatar, IGN (Name), Real Name (if available), Team Logo/Name, Role Icon.
    -   **Stats Grid**: Annual/Seasonal Stats (KDA, GPM, DPM, KP%, etc.).
    -   **Hero Pool**: Top 5 played champions with Win Rate and KDA.
    -   **Recent Matches**: List of recent games with performance quick-view.

#### [MODIFY] [src/app/analysis/page.tsx](file:///d:/Antigravity/%E7%BD%91%E7%AB%99/lol-data-system/src/app/analysis/page.tsx)
-   Wrap player cards in `<Link href={'/players/' + player.id}>`.
