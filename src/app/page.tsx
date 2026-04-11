import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import CalendarExportActions from "@/components/schedule/CalendarExportActions";
import TeamLogo from "@/components/TeamLogo";
import { getSystemConfig, type MatchStageCategory, type MatchStageOption } from "@/lib/config-service";
import { getCachedHomeRecentMatches, getCachedTeamsForCanonicalization } from "@/lib/data-cache";
import { formatBeijingTime } from "@/lib/date-utils";
import { getTeamShortDisplayName } from "@/lib/team-display";
import {
  buildCanonicalTeamIndex,
  getCanonicalTeam,
  getCanonicalTeamByIdentity,
  pickPreferredCanonicalTeam,
} from "@/lib/team-canonical";

export const dynamic = "force-dynamic";

type HomeMatch = Awaited<ReturnType<typeof getCachedHomeRecentMatches>>[number];
type HomeTeam = HomeMatch["teamA"];
type TeamRecord = NonNullable<Awaited<ReturnType<typeof getCachedTeamsForCanonicalization>>[number]>;

type StageMeta = {
  stageLabel: string;
  stageClassName: string;
};

const TEXT = {
  lckSplit1: "2026 LCK 第一赛段",
  lplSplit1: "2026 LPL 第一赛段",
  unnamedTournament: "未命名赛事",
  unknownStage: "未标注阶段",
  regularStage: "常规赛",
  playinStage: "入围赛",
  playoffStage: "淘汰赛",
  statusLive: "进行中",
  statusFinished: "已结束",
  statusTbd: "待定",
  statusNotStarted: "未开始",
  sectionTitle: "未来赛程(5个比赛日)",
  emptyTitle: "未来暂无赛程",
  emptyDesc: "当前数据库中没有从今天开始可展示的未来比赛日数据。",
  toEntry: "前往赛程后台",
};

const HOME_CALENDAR_PATH = "/api/calendar/ics?status=upcoming&regions=LPL,LCK";

function looksCorruptedDisplayText(value: string): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/\?{3,}/.test(text)) return true;
  return /馃|绗|鏆|寰风|鍏|璧|閫|鐐|鍒|璇|棰|鈥|锔|鉁|猬|柤|�/.test(text);
}

function getStageFallbackLabel(category: MatchStageCategory): string {
  if (category === "regular") return TEXT.regularStage;
  if (category === "playin") return TEXT.playinStage;
  if (category === "playoff") return TEXT.playoffStage;
  return TEXT.unknownStage;
}

function getTournamentLabel(match: HomeMatch): string {
  const tournament = (match.tournament || "").trim();
  if (tournament.includes("LCK") && tournament.includes("Split 1")) return TEXT.lckSplit1;
  if (tournament.includes("LPL") && tournament.includes("Split 1")) return TEXT.lplSplit1;
  const label = tournament || TEXT.unnamedTournament;
  return looksCorruptedDisplayText(label) ? TEXT.unnamedTournament : label;
}

function inferStageCategory(stageText: string): MatchStageCategory {
  const value = stageText.toLowerCase();

  if (
    value.includes("playoff") ||
    value.includes("knockout") ||
    stageText.includes("\u5b63\u540e\u8d5b") ||
    stageText.includes("\u6dd8\u6c70")
  ) {
    return "playoff";
  }

  if (value.includes("play-in") || value.includes("play in") || stageText.includes("\u5165\u56f4")) {
    return "playin";
  }

  if (
    value.includes("regular") ||
    value.includes("group") ||
    value.includes("swiss") ||
    value.includes("split") ||
    stageText.includes("\u5e38\u89c4") ||
    stageText.includes("\u5c0f\u7ec4") ||
    stageText.includes("\u745e\u58eb") ||
    stageText.includes("\u8d5b\u6bb5")
  ) {
    return "regular";
  }

  return "other";
}

function getStageMeta(stageValue: string | null | undefined, stageOptions: MatchStageOption[]): StageMeta {
  const raw = (stageValue || "").trim();
  const rawLower = raw.toLowerCase();

  const exact = stageOptions.find((s) => (s.id || "").trim() === raw);
  const fuzzy =
    exact ||
    stageOptions.find((s) => {
      const sid = (s.id || "").trim().toLowerCase();
      return sid.length > 0 && rawLower.length > 0 && (sid.includes(rawLower) || rawLower.includes(sid));
    });

  const category = fuzzy?.category || inferStageCategory(raw);
  const stageLabelRaw = fuzzy?.label || raw || TEXT.unknownStage;
  const stageLabel = looksCorruptedDisplayText(stageLabelRaw) ? getStageFallbackLabel(category) : stageLabelRaw;

  if (category === "regular") {
    return { stageLabel, stageClassName: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (category === "playin") {
    return { stageLabel, stageClassName: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (category === "playoff") {
    return { stageLabel, stageClassName: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  return { stageLabel, stageClassName: "bg-slate-100 text-slate-700 border-slate-200" };
}

function toChineseWeekday(date: Date): string {
  const dayIso = formatBeijingTime(date, "i");
  const map: Record<string, string> = {
    "1": "\u5468\u4e00",
    "2": "\u5468\u4e8c",
    "3": "\u5468\u4e09",
    "4": "\u5468\u56db",
    "5": "\u5468\u4e94",
    "6": "\u5468\u516d",
    "7": "\u5468\u65e5",
  };
  return map[dayIso] || "\u5468\u672a\u77e5";
}

function countWinsForTeam(match: HomeMatch, teamId?: string | null): number {
  if (!teamId || !match.games || match.games.length === 0) return 0;

  return match.games.filter((game) => {
    const winnerRaw = (game.winnerId || "").trim();
    if (!winnerRaw) return false;

    const winnerUpper = winnerRaw.toUpperCase();
    if (winnerRaw === teamId) return true;
    if (game.blueSideTeamId && winnerRaw === game.blueSideTeamId && game.blueSideTeamId === teamId) return true;
    if (game.redSideTeamId && winnerRaw === game.redSideTeamId && game.redSideTeamId === teamId) return true;
    if (winnerUpper === "BLUE" && game.blueSideTeamId === teamId) return true;
    if (winnerUpper === "RED" && game.redSideTeamId === teamId) return true;

    return false;
  }).length;
}

function isFinishedMatchStatus(status: string | null | undefined) {
  const upper = String(status || "").toUpperCase();
  return upper === "FINISHED" || upper === "COMPLETED";
}

function normalizeMatchStartTime(value: Date | string | number | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(value || "").trim();
  if (!text) return null;

  if (/^\d{12,14}$/.test(text)) {
    const parsed = new Date(Number(text));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOngoingMatch(match: HomeMatch, now: Date) {
  if (!match.startTime) return false;
  if (isFinishedMatchStatus(match.status)) return false;
  return new Date(match.startTime) <= now;
}

function getMatchStatusMeta(match: HomeMatch, now: Date) {
  const status = (match.status || "").toUpperCase();
  if (status === "LIVE") return { text: TEXT.statusLive, className: "bg-red-500 text-white animate-pulse" };
  if (isFinishedMatchStatus(status)) return { text: TEXT.statusFinished, className: "bg-slate-900 text-white" };
  if (!match.startTime) return { text: TEXT.statusTbd, className: "bg-slate-200 text-slate-600" };
  if (isOngoingMatch(match, now)) return { text: TEXT.statusLive, className: "bg-amber-500 text-white" };

  return { text: TEXT.statusNotStarted, className: "bg-blue-600 text-white" };
}

function resolveDisplayTeam(
  rawTeam: TeamRecord | null | undefined,
  rawTeamId: string | null | undefined,
  teamMap: Map<string, TeamRecord>,
  canonicalIndex: ReturnType<typeof buildCanonicalTeamIndex<TeamRecord>>,
) {
  const seedCandidates: Array<TeamRecord | null> = [
    rawTeamId ? teamMap.get(rawTeamId) || null : null,
    rawTeam?.id ? teamMap.get(rawTeam.id) || null : null,
    rawTeam || null,
  ];

  let preferred: TeamRecord | null = null;

  for (const candidate of seedCandidates) {
    if (!candidate) continue;
    preferred = pickPreferredCanonicalTeam(preferred, candidate);
    preferred = pickPreferredCanonicalTeam(
      preferred,
      candidate.id ? getCanonicalTeam(candidate.id, canonicalIndex) : null,
    );
    preferred = pickPreferredCanonicalTeam(
      preferred,
      getCanonicalTeamByIdentity(candidate, canonicalIndex, candidate.region),
    );
  }

  preferred = pickPreferredCanonicalTeam(
    preferred,
    rawTeamId ? getCanonicalTeam(rawTeamId, canonicalIndex) : null,
  );
  preferred = pickPreferredCanonicalTeam(
    preferred,
    getCanonicalTeamByIdentity(rawTeam || null, canonicalIndex, rawTeam?.region),
  );

  return preferred || rawTeam || (rawTeamId ? teamMap.get(rawTeamId) || null : null) || null;
}

function UpcomingMatchRow({ match, stageOptions }: { match: HomeMatch; stageOptions: MatchStageOption[] }) {
  const stageMeta = getStageMeta(match.stage, stageOptions);
  const tournamentLabel = getTournamentLabel(match);
  const teamADisplayName = getTeamShortDisplayName(match.teamA);
  const teamBDisplayName = getTeamShortDisplayName(match.teamB);

  const scoreA = countWinsForTeam(match, match.teamAId);
  const scoreB = countWinsForTeam(match, match.teamBId);

  const now = new Date();
  const statusMeta = getMatchStatusMeta(match, now);
  const statusUpper = (match.status || "").toUpperCase();
  const showScoreboard = scoreA + scoreB > 0 || statusUpper === "LIVE" || isFinishedMatchStatus(statusUpper);

  return (
    <Link href={`/match/${match.id}`} className="block group">
      <div className="bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-2.5 flex items-center">
        <div className="w-12 flex flex-col items-center justify-center border-r border-gray-100 pr-3 mr-3">
          {match.startTime ? (
            <>
              <span className="text-xs font-bold text-gray-500">{formatBeijingTime(match.startTime, "M")}{"\u6708"}</span>
              <span className="text-xl font-black text-gray-900 leading-none">{formatBeijingTime(match.startTime, "dd")}</span>
            </>
          ) : (
                                <span className="text-sm font-bold text-gray-400">待定</span>
          )}
        </div>

        <div className="w-36 flex flex-col justify-center border-r border-gray-100 pr-3 mr-3 gap-1">
          <span className="text-2xl font-black text-gray-900 leading-none tracking-tight">{match.startTime ? formatBeijingTime(match.startTime, "HH:mm") : "--:--"}</span>
          <span className="text-xs font-bold text-gray-400 uppercase">{match.format || "BO3"}</span>
          <span className="text-[11px] font-bold text-blue-600 truncate">{tournamentLabel}</span>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stageMeta.stageClassName}`}>{stageMeta.stageLabel}</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-end gap-2">
                                <span className="text-base font-medium text-gray-900 hidden md:block">{teamADisplayName}</span>
                                <TeamLogo src={match.teamA?.logo} name={match.teamA?.name || "待定"} size={26} className="w-[26px] h-[26px]" region={match.teamA?.region} />
          </div>

          <div className="w-14 text-center">
            {showScoreboard ? (
              <div className="bg-slate-900 text-white font-black px-2 py-0.5 rounded-lg text-xs tracking-wide leading-none">{scoreA} : {scoreB}</div>
            ) : (
              <span className="text-base font-black text-gray-300">VS</span>
            )}
          </div>

          <div className="flex items-center justify-start gap-2">
                                <TeamLogo src={match.teamB?.logo} name={match.teamB?.name || "待定"} size={26} className="w-[26px] h-[26px]" region={match.teamB?.region} />
                                <span className="text-base font-medium text-gray-900 hidden md:block">{teamBDisplayName}</span>
          </div>
        </div>

        <div className="w-[84px] flex justify-end pl-2.5 border-l border-gray-100 ml-3">
          <span className={`inline-flex items-center justify-center whitespace-nowrap min-w-[56px] px-2.5 py-1 rounded-lg text-[11px] leading-none font-black transition-colors shadow-sm ${statusMeta.className}`}>{statusMeta.text}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function Home() {
  noStore();
  const now = new Date();
  const ongoingWindow = new Date(now);
  ongoingWindow.setDate(ongoingWindow.getDate() - 1);
  const futureWindow = new Date(now);
  futureWindow.setDate(futureWindow.getDate() + 90);

  const [directMatches, allTeams, config] = await Promise.all([
    getCachedHomeRecentMatches(),
    getCachedTeamsForCanonicalization(),
    getSystemConfig(),
  ]);
  const canonicalIndex = buildCanonicalTeamIndex(allTeams as TeamRecord[]);
  const teamMap = new Map(allTeams.map((team) => [team.id, team as TeamRecord]));

  const allMatches = directMatches
    .map((match) => {
      const teamA = resolveDisplayTeam(match.teamA || null, match.teamAId || null, teamMap, canonicalIndex);
      const teamB = resolveDisplayTeam(match.teamB || null, match.teamBId || null, teamMap, canonicalIndex);

      return {
        ...match,
        startTime: normalizeMatchStartTime(match.startTime),
        teamAId: teamA?.id || match.teamAId || null,
        teamBId: teamB?.id || match.teamBId || null,
        teamA: teamA || match.teamA,
        teamB: teamB || match.teamB,
      };
    })
    .filter((match) => {
      if (!match.startTime) return false;
      return match.startTime >= ongoingWindow && match.startTime <= futureWindow;
    })
    .sort((left, right) => left.startTime!.getTime() - right.startTime!.getTime());
  const stageOptions = (config.matchStageOptions || []).filter((s) => s.enabled !== false);
  const visibleMatches = allMatches.filter((match) => !isFinishedMatchStatus(match.status));

  const groupedMatches: Record<string, HomeMatch[]> = {};
  visibleMatches
    .filter((m) => !!m.startTime)
    .forEach((match) => {
      const dateKey = formatBeijingTime(match.startTime as Date, "yyyy-MM-dd");
      if (!groupedMatches[dateKey]) groupedMatches[dateKey] = [];
      groupedMatches[dateKey].push(match);
    });

  const sortedDatesAsc = Object.keys(groupedMatches).sort();
  const todayKey = formatBeijingTime(new Date(), "yyyy-MM-dd");

  const futureDates = sortedDatesAsc.filter((dateKey) => {
    if (dateKey >= todayKey) return true;
    return groupedMatches[dateKey]?.some((match) => isOngoingMatch(match, now)) ?? false;
  });
  const nextFiveDates = futureDates.slice(0, 5);

  const upcomingMatchGroups = nextFiveDates.map((date) => ({ date, matches: groupedMatches[date] }));

  return (
    <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-8">
      <div className="space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
            {TEXT.sectionTitle}
          </h2>
        </div>

        <CalendarExportActions calendarPath={HOME_CALENDAR_PATH} />

        <div className="space-y-6">
          {upcomingMatchGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-gray-100 rounded-3xl shadow-sm min-h-[300px] text-center">
              <div className="text-6xl mb-6">\ud83d\udcc5</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{TEXT.emptyTitle}</h3>
              <p className="text-gray-500 max-w-xs mb-8">{TEXT.emptyDesc}</p>
              <Link href="/admin/schedule" className="inline-flex px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20">
                {TEXT.toEntry}
              </Link>
            </div>
          ) : (
            upcomingMatchGroups.map((group) => {
              const dateObj = new Date(`${group.date}T00:00:00+08:00`);

              return (
                <div key={group.date} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-gray-900 font-bold flex items-center gap-3">
                      <span className="text-blue-600 text-base">{formatBeijingTime(dateObj, "MM\u6708dd\u65e5")}</span>
                      <span className="text-gray-400 text-sm font-medium tracking-wide">{toChineseWeekday(dateObj)}</span>
                    </h3>
                  </div>
                  <div className="space-y-2 p-2 bg-slate-50">
                    {group.matches.map((match) => (
                      <UpcomingMatchRow key={match.id} match={match} stageOptions={stageOptions} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}









