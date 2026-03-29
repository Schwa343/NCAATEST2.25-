'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore';

interface Game {
  gameId: string;
  homeTeam: { name: string; score: string; rank: string | number };
  awayTeam: { name: string; score: string; rank: string | number };
  status: string;
  clock: string;
  date: string;
  startTime?: string;
}

interface Pick {
  id?: string;
  name: string;
  team: string;
  round: string;
  timestamp?: any;
  createdAt?: string;
  status?: 'pending' | 'won' | 'eliminated';
  resultAt?: any;
}

const participantFullNames = [
  'Patrick G', 'Garret G', 'Mike S', 'Derrick D', 'Matt S',
  'Connor G', 'Nick D', 'Chris C', 'Brian B', 'Rich D',
  'Peter M', 'Spenser P', 'Nick M', 'James C', 'Tom S',
  'Zak B', 'Alex M', 'Sean F', 'Tyler D'
];

const TOURNAMENT_ROUNDS: { dateStr: string; label: string; shortLabel: string }[] = [
  { dateStr: '2026-03-19', label: 'Round of 64 Day 1 (3-19)', shortLabel: 'R64 D1' },
  { dateStr: '2026-03-20', label: 'Round of 64 Day 2 (3-20)', shortLabel: 'R64 D2' },
  { dateStr: '2026-03-21', label: 'Round of 32 Day 1 (3-21)', shortLabel: 'R32 D1' },
  { dateStr: '2026-03-22', label: 'Round of 32 Day 2 (3-22)', shortLabel: 'R32 D2' },
  { dateStr: '2026-03-26', label: 'Sweet 16 Day 1 (3-26)',    shortLabel: 'S16 D1' },
  { dateStr: '2026-03-27', label: 'Sweet 16 Day 2 (3-27)',    shortLabel: 'S16 D2' },
  { dateStr: '2026-03-28', label: 'Elite 8 Day 1 (3-28)',     shortLabel: 'E8 D1'  },
  { dateStr: '2026-03-29', label: 'Elite 8 Day 2 (3-29)',     shortLabel: 'E8 D2'  },
  { dateStr: '2026-04-04', label: 'Final Four (4-4)',          shortLabel: 'F4'     },
  { dateStr: '2026-04-06', label: 'Championship (4-6)',        shortLabel: 'Natty'  },
];

const TEST_DATES = TOURNAMENT_ROUNDS.map(r => r.dateStr);

const REVEAL_TIMES: Record<string, string> = Object.fromEntries(
  TOURNAMENT_ROUNDS.map(r => [r.dateStr, `${r.dateStr}T17:00:00Z`])
);

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '').replace(/state/gi, 'st');
}

function getShortName(full: string): string {
  const [first, ...rest] = full.trim().split(/\s+/);
  if (rest.length === 0) return full;
  return `${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()} ${rest[rest.length - 1][0].toUpperCase()}`;
}

function isRevealed(dateStr: string): boolean {
  const t = REVEAL_TIMES[dateStr];
  if (!t) return false;
  return new Date() >= new Date(t);
}

function LiveTicker() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const fetchScores = async () => {
    try {
      const today = new Date();
      const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${formatDate(today)}&groups=100&limit=500`
      );
      let allEvents: any[] = [];
      if (res.ok) {
        const data = await res.json();
        allEvents = data.events || [];
      }
      const formatted = allEvents.map((e: any) => {
        const comp = e.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return null;
        const hr = Number(home.curatedRank?.current);
        const ar = Number(away.curatedRank?.current);
        return {
          gameId: e.id,
          homeTeam: {
            name: home.team.shortDisplayName || home.team.displayName || '',
            score: home.score || '—',
            rank: !isNaN(hr) && hr >= 1 && hr <= 25 ? hr : '',
          },
          awayTeam: {
            name: away.team.shortDisplayName || away.team.displayName || '',
            score: away.score || '—',
            rank: !isNaN(ar) && ar >= 1 && ar <= 25 ? ar : '',
          },
          status: comp.status.type.description || 'Scheduled',
          clock: comp.status.displayClock || '',
          date: new Date(comp.date).toLocaleDateString('en-CA'),
          startTime: comp.date,
        };
      }).filter(Boolean) as Game[];
      const todayStr = new Date().toLocaleDateString('en-CA');
      setGames(formatted.filter(g => {
        const desc = g.status.toLowerCase();
        return g.date === todayStr && !desc.includes('final') && !desc.includes('end');
      }));
    } catch {
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (scrollRef.current?.offsetLeft || 0);
    scrollLeft.current = scrollRef.current?.scrollLeft || 0;
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const handleMouseUp = () => { isDragging.current = false; };

  if (error) return <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 px-4 text-center font-medium">{error}</div>;
  if (games.length === 0) return <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 px-4 text-center font-medium">No games live/upcoming today</div>;

  return (
    <div
      ref={scrollRef}
      className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 px-4 overflow-x-auto whitespace-nowrap shadow-lg cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 70s linear infinite; }
      `}</style>
      <div className="inline-flex animate-marquee gap-20">
        {[...games, ...games].map((g, i) => (
          <span key={i} className="font-medium">
            {g.awayTeam.rank ? `#${g.awayTeam.rank} ` : ''}{g.awayTeam.name} {g.awayTeam.score} @
            {g.homeTeam.rank ? ` #${g.homeTeam.rank} ` : ' '}{g.homeTeam.name} {g.homeTeam.score}
            <span className="text-yellow-300 ml-2 font-semibold">
              {g.status === 'Scheduled' && g.startTime
                ? new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
                : `${g.status}${g.clock && g.clock !== '0:00' ? ` (${g.clock})` : ''}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [usedTeams, setUsedTeams] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ name: string; round: string } | null>(null);
  const [hasSubmittedThisSession, setHasSubmittedThisSession] = useState(false);

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const idx = TEST_DATES.findIndex(d => d === todayStr);
    if (idx !== -1) {
      setCurrentDayIndex(idx);
    } else {
      const nextIdx = TEST_DATES.findIndex(d => d > todayStr);
      if (nextIdx !== -1) setCurrentDayIndex(nextIdx);
    }
  }, []);

  const currentDateStr = TEST_DATES[currentDayIndex];
  const round = `Day ${currentDayIndex + 1}`;
  const shortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    const fetchScores = async () => {
      let events: any[] = [];
      for (const dateStr of TEST_DATES) {
        try {
          const d = dateStr.replace(/-/g, '');
          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${d}&limit=500`
          );
          if (res.ok) {
            const data = await res.json();
            events = [...events, ...(data.events || [])];
          }
        } catch {}
      }
      const games = events.map((e: any) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return null;
        const hr = Number(home.curatedRank?.current);
        const ar = Number(away.curatedRank?.current);
        return {
          gameId: e.id,
          homeTeam: {
            name: home.team.shortDisplayName || '',
            score: home.score || '—',
            rank: !isNaN(hr) && hr >= 1 && hr <= 25 ? hr : '',
          },
          awayTeam: {
            name: away.team.shortDisplayName || '',
            score: away.score || '—',
            rank: !isNaN(ar) && ar >= 1 && ar <= 25 ? ar : '',
          },
          status: comp?.status?.type?.description || 'Scheduled',
          clock: comp?.status?.displayClock || '',
          date: new Date(comp.date).toLocaleDateString('en-CA'),
          startTime: comp.date,
        };
      }).filter(Boolean) as Game[];
      setScoreboard(games);
    };
    fetchScores();
    const interval = setInterval(fetchScores, 90000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as Pick));
      const grouped = new Map<string, Pick[]>();
      raw.forEach(p => {
        if (!p.name) return;
        if (!grouped.has(p.name)) grouped.set(p.name, []);
        grouped.get(p.name)!.push(p);
      });
      const users = participantFullNames.map(fullName => {
        const short = getShortName(fullName);
        const existing = grouped.get(short) || [];
        return {
          name: short,
          fullName,
          picks: existing.sort((a: Pick, b: Pick) => (a.createdAt || '0').localeCompare(b.createdAt || '0')),
          status: existing.some((p: Pick) => p.status === 'eliminated') ? 'eliminated' : 'alive',
        };
      });
      setAllUsers(users);
      setLoading(false);
      const me = users.find(u => u.name === shortName);
      if (me) setUsedTeams(me.picks.map((p: Pick) => p.team).filter(Boolean));
    });
    return unsub;
  }, [shortName]);

  useEffect(() => {
    if (!scoreboard.length || !allUsers.length) return;
    allUsers.forEach(user => {
      user.picks.forEach(async (pick: Pick) => {
        if (pick.status && pick.status !== 'pending') return;
        const dayIdx = TEST_DATES.findIndex((_, i) => `Day ${i + 1}` === pick.round);
        if (dayIdx === -1) return;
        const pickDateStr = TEST_DATES[dayIdx];
        const game = scoreboard.find(g =>
          g.date === pickDateStr &&
          (normalizeTeamName(g.homeTeam.name).includes(normalizeTeamName(pick.team)) ||
            normalizeTeamName(g.awayTeam.name).includes(normalizeTeamName(pick.team)))
        );
        if (!game) return;
        const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('end');
        if (!isFinal) return;
        const h = Number(game.homeTeam.score) || 0;
        const a = Number(game.awayTeam.score) || 0;
        if (h === 0 && a === 0) return;
        const isHome = normalizeTeamName(game.homeTeam.name).includes(normalizeTeamName(pick.team));
        const won = isHome ? h > a : a > h;
        const q = query(collection(db, 'picks'), where('name', '==', user.name), where('round', '==', pick.round));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'picks', snap.docs[0].id), {
            status: won ? 'won' : 'eliminated',
            resultAt: serverTimestamp(),
          });
        }
      });
    });
  }, [scoreboard, allUsers]);

  // ── NEW: Admin revive — resets all eliminated picks back to 'pending' for a user ──
  const handleAdminRevive = async (userName: string) => {
    const user = allUsers.find(u => u.name === userName);
    if (!user) return;
    const eliminatedPicks = user.picks.filter((p: Pick) => p.status === 'eliminated');
    if (eliminatedPicks.length === 0) return;
    try {
      for (const pick of eliminatedPicks) {
        const q = query(collection(db, 'picks'), where('name', '==', userName), where('round', '==', pick.round));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'picks', snap.docs[0].id), { status: 'pending' });
        }
      }
      setStatusMessage(`Revived ${userName} — all eliminations reset to pending`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setStatusMessage('Revive failed: ' + err.message);
    }
  };

  const dayGames = scoreboard.filter(g => g.date === currentDateStr);

  const teamRankMap = new Map<string, string | number>();
  scoreboard.forEach(g => {
    if (g.homeTeam.rank) teamRankMap.set(g.homeTeam.name, g.homeTeam.rank);
    if (g.awayTeam.rank) teamRankMap.set(g.awayTeam.name, g.awayTeam.rank);
  });

  const revealTimeForToday = REVEAL_TIMES[currentDateStr] ? new Date(REVEAL_TIMES[currentDateStr]) : null;
  const [y, m, d] = currentDateStr.split('-').map(Number);
  const fallbackNoon = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  const lockTime = revealTimeForToday ?? fallbackNoon;
  const dayLocked = new Date() >= lockTime;

  const myUser = allUsers.find(u => u.name === shortName);
  const isEliminated = myUser?.status === 'eliminated';

  const handleSubmit = async () => {
    if (!firstName.trim() || lastInitial.length !== 1) {
      setStatusMessage('First name + one initial required');
      return;
    }
    if (shortName.toLowerCase() === 'stanley s') {
      setIsAdmin(true);
      setHasSubmittedThisSession(true);
      setStatusMessage('Admin mode activated — click any pick cell to edit');
      setFirstName(''); setLastInitial('');
      return;
    }
    const allowed = participantFullNames.some(f => getShortName(f) === shortName);
    if (!allowed) {
      setStatusMessage('Name not recognized — check spelling');
      return;
    }
    const user = allUsers.find(u => u.name === shortName);
    if (user?.status === 'eliminated') {
      setStatusMessage('You are eliminated');
      return;
    }
    if (new Date() >= lockTime) {
      setStatusMessage('Picks locked — first game has tipped off');
      return;
    }
    try {
      const q = query(collection(db, 'picks'), where('name', '==', shortName), where('round', '==', round));
      const existing = await getDocs(q);
      if (!existing.empty) {
        await updateDoc(doc(db, 'picks', existing.docs[0].id), {
          team: selectedTeam,
          timestamp: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'picks'), {
          name: shortName,
          team: selectedTeam,
          round,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
      }
      setStatusMessage(`Saved: ${selectedTeam}`);
      setSelectedTeam('');
      setHasSubmittedThisSession(true);
    } catch (err: any) {
      setStatusMessage('Error: ' + err.message);
    }
  };

  const handleAdminEdit = async (userName: string, editRound: string, newTeam: string) => {
    if (!newTeam) { setEditingCell(null); return; }
    const user = allUsers.find(u => u.name === userName);
    if (!user) return;
    const alreadyUsed = user.picks.some((p: Pick) => p.team === newTeam && p.round !== editRound);
    if (alreadyUsed) {
      setStatusMessage(`Cannot assign ${newTeam} — already used by ${userName} on another day`);
      setEditingCell(null);
      return;
    }
    try {
      const q = query(collection(db, 'picks'), where('name', '==', userName), where('round', '==', editRound));
      const existing = await getDocs(q);
      if (!existing.empty) {
        await updateDoc(doc(db, 'picks', existing.docs[0].id), { team: newTeam, timestamp: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'picks'), {
          name: userName, team: newTeam, round: editRound,
          timestamp: serverTimestamp(), createdAt: new Date().toISOString(), status: 'pending',
        });
      }
      setStatusMessage(`Updated ${userName}'s ${editRound} to ${newTeam}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setStatusMessage('Save failed: ' + err.message);
    }
    setEditingCell(null);
  };

  const availableTeamsForAdmin = Array.from(new Set(
    dayGames.flatMap(g => [g.homeTeam.name, g.awayTeam.name].filter(Boolean))
  )).sort((a, b) => a.localeCompare(b));

  const NAME_W = 88;

  return (
    <>
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 70s linear infinite; }
        .heartbeat-alive { display: inline-block; width: 50px; height: 18px; vertical-align: middle; }
        .heartbeat-alive svg { width: 100%; height: 100%; }
        .heartbeat-alive .pulse { animation: heartbeat 1.4s infinite ease-in-out; stroke: #22c55e; stroke-width: 3; fill: none; }
        @keyframes heartbeat {
          0%, 100% { d: path("M0 10 L10 10 L15 2 L20 18 L25 10 L35 10"); }
          40%  { d: path("M0 10 L10 10 L13 4 L17 16 L21 10 L35 10"); }
          60%  { d: path("M0 10 L10 10 L14 6 L18 14 L22 10 L35 10"); }
        }
        .flatline-dead { display: inline-block; width: 50px; height: 3px; background-color: #ef4444; vertical-align: middle; }

        .col-name {
          position: sticky;
          left: 0;
          z-index: 10;
        }
        thead .col-name {
          z-index: 20;
        }

        tr.my-row td.col-name {
          background-color: #ffffff !important;
        }
        tr.my-row td {
          border-top: 3px solid #eab308 !important;
          border-bottom: 3px solid #eab308 !important;
        }
        tr.my-row td:first-child {
          border-left: 3px solid #eab308;
        }
        tr.my-row td:last-child {
          border-right: 3px solid #eab308;
        }

        tr.dead-row td.col-name {
          background-color: #fef2f2 !important;
        }

        tr:not(.my-row):not(.dead-row) td.col-name {
          background-color: #ffffff;
        }
        tr:not(.my-row):not(.dead-row):hover td.col-name {
          background-color: #f9fafb;
        }
      `}</style>

      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] pt-28 pb-12 px-4 md:px-8 flex flex-col items-center">
        <Image src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg" alt="March Madness" width={400} height={200} className="mb-6 rounded-lg" priority />

        <h1 className="text-4xl md:text-5xl font-bold text-[#2A6A5E] text-center mb-2">NCAA Survivor Pool</h1>
        <p className="text-xl text-gray-700 text-center mb-8 max-w-2xl">Pick one team per day — no repeats — last one standing wins</p>

        <div className="flex justify-center gap-4 mb-8">
          <input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} className="px-4 py-2 border rounded w-52 text-gray-900 bg-white" />
          <input placeholder="L" maxLength={1} value={lastInitial} onChange={e => setLastInitial(e.target.value.toUpperCase().slice(0, 1))} className="w-14 text-center px-2 py-2 border rounded text-gray-900 bg-white" />
        </div>

        {isAdmin && <p className="text-center text-purple-700 font-bold mb-6">ADMIN MODE ACTIVE — click any pick cell to edit • click Dead status to revive</p>}

        <div className="w-full max-w-3xl mb-8 overflow-x-auto">
          <div className="flex gap-2 pb-1 px-1" style={{ minWidth: 'max-content' }}>
            {TOURNAMENT_ROUNDS.map((r, i) => (
              <button
                key={r.dateStr}
                onClick={() => setCurrentDayIndex(i)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  currentDayIndex === i
                    ? 'bg-[#2A6A5E] text-white shadow'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 max-w-5xl w-full mb-10">
          {dayGames.length === 0 ? (
            <p className="text-gray-500 italic">No games found for this round yet...</p>
          ) : (
            dayGames.map((game) => {
              const awayDisabled = (hasSubmittedThisSession && usedTeams.includes(game.awayTeam.name)) || dayLocked || isEliminated;
              const homeDisabled = (hasSubmittedThisSession && usedTeams.includes(game.homeTeam.name)) || dayLocked || isEliminated;
              const awaySelected = selectedTeam === game.awayTeam.name;
              const homeSelected = selectedTeam === game.homeTeam.name;
              return (
                <div key={game.gameId} className="flex items-center justify-center gap-3 w-full max-w-xl">
                  <button
                    onClick={() => !awayDisabled && setSelectedTeam(game.awayTeam.name)}
                    disabled={awayDisabled}
                    className={`flex-1 px-4 py-3 border-2 border-[#2A6A5E] rounded-lg text-center font-semibold transition-all
                      ${awaySelected ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'}
                      ${awayDisabled ? 'opacity-60 line-through bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    {game.awayTeam.rank ? <span className="text-xs font-bold opacity-70 mr-1">#{game.awayTeam.rank}</span> : null}
                    {game.awayTeam.name}
                  </button>
                  <span className="text-gray-400 font-bold text-sm flex-shrink-0">vs</span>
                  <button
                    onClick={() => !homeDisabled && setSelectedTeam(game.homeTeam.name)}
                    disabled={homeDisabled}
                    className={`flex-1 px-4 py-3 border-2 border-[#2A6A5E] rounded-lg text-center font-semibold transition-all
                      ${homeSelected ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'}
                      ${homeDisabled ? 'opacity-60 line-through bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    {game.homeTeam.rank ? <span className="text-xs font-bold opacity-70 mr-1">#{game.homeTeam.rank}</span> : null}
                    {game.homeTeam.name}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedTeam || !shortName || dayLocked || isEliminated}
          className="w-full max-w-md bg-[#2A6A5E] text-white py-4 rounded-xl text-xl hover:bg-[#1e4c43] disabled:opacity-50 shadow"
        >
          {dayLocked ? 'Locked' : isEliminated ? 'Eliminated' : 'Submit Pick'}
        </button>

        {statusMessage && (
          <p className={`mt-6 text-center text-lg ${statusMessage.includes('Error') || statusMessage.includes('locked') ? 'text-red-600' : 'text-[#2A6A5E]'}`}>
            {statusMessage}
          </p>
        )}

        <div className="w-full max-w-6xl mt-16">
          <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">Standings & Picks</h2>
          {loading ? (
            <p className="text-center text-gray-600">Loading...</p>
          ) : (
            <div className="overflow-x-auto w-full rounded-lg shadow">
              <table className="bg-white w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead className="bg-[#2A6A5E] text-white">
                  <tr>
                    <th
                      className="col-name py-4 px-3 text-center text-sm font-semibold bg-[#2A6A5E]"
                      style={{ minWidth: NAME_W, width: NAME_W }}
                    >
                      Name
                    </th>
                    <th className="py-4 px-3 text-center text-sm font-semibold" style={{ minWidth: 86 }}>
                      Status
                    </th>
                    {TOURNAMENT_ROUNDS.map((r) => (
                      <th key={r.dateStr} className="py-4 px-2 text-center text-xs font-semibold" style={{ minWidth: 72 }}>
                        {r.shortLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(user => {
                    const isMe = user.name === shortName;
                    const isDead = user.status === 'eliminated';

                    const eliminatedAtRoundIndex = (() => {
                      for (let i = 0; i < TEST_DATES.length; i++) {
                        const roundKey = `Day ${i + 1}`;
                        const pick = user.picks.find((p: Pick) => p.round === roundKey);
                        if (pick?.status === 'eliminated') return i;
                      }
                      return -1;
                    })();

                    const rowClass = [
                      'border-b',
                      isDead ? 'dead-row' : '',
                      isMe && hasSubmittedThisSession ? 'my-row' : '',
                    ].filter(Boolean).join(' ');

                    return (
                      <tr key={user.name} className={rowClass}>
                        <td
                          className={`col-name py-3 px-3 font-medium text-center text-sm whitespace-nowrap ${isDead ? 'text-red-600 line-through' : 'text-gray-800'}`}
                          style={{ minWidth: NAME_W, width: NAME_W }}
                        >
                          {user.fullName}
                        </td>

                        {/* ── Status cell — clickable to revive in admin mode ── */}
                        <td
                          className={`py-3 px-2 ${isAdmin && isDead ? 'cursor-pointer hover:bg-yellow-50' : ''}`}
                          style={{ minWidth: 86 }}
                          title={isAdmin && isDead ? `Click to revive ${user.name}` : undefined}
                          onClick={() => { if (isAdmin && isDead) handleAdminRevive(user.name); }}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {isDead ? (
                              <>
                                <span className={`font-bold text-xs ${isAdmin ? 'text-red-600 underline decoration-dotted' : 'text-red-600'}`}>Dead</span>
                                <div className="flatline-dead" />
                              </>
                            ) : (
                              <>
                                <span className="text-green-600 font-bold text-xs">Alive</span>
                                <div className="heartbeat-alive">
                                  <svg viewBox="0 0 35 20">
                                    <path className="pulse" d="M0 10 L10 10 L15 2 L20 18 L25 10 L35 10" />
                                  </svg>
                                </div>
                              </>
                            )}
                          </div>
                        </td>

                        {TOURNAMENT_ROUNDS.map((r, i) => {
                          const roundKey = `Day ${i + 1}`;
                          const pickObj = user.picks.find((p: Pick) => p.round === roundKey);
                          const pickTeam = pickObj?.team || '';
                          const picksRevealed = isRevealed(r.dateStr);
                          const visible = (isMe && hasSubmittedThisSession) || picksRevealed || isAdmin;

                          const isPostElimination = eliminatedAtRoundIndex !== -1 && i > eliminatedAtRoundIndex;

                          const pickRank = pickTeam ? teamRankMap.get(pickTeam) : undefined;
                          const rankLabel = pickRank ? `#${pickRank} ` : '';

                          let cellClass = 'bg-gray-50 text-gray-400';
                          let display: any = pickTeam
                            ? <span><span className="text-xs font-bold opacity-60">{rankLabel}</span>{pickTeam}</span>
                            : '—';

                          if (isPostElimination) {
                            cellClass = 'bg-red-100 text-red-500 italic';
                            display = <span className="text-red-400 italic font-normal">-Dead-</span>;
                          } else if (pickTeam) {
                            if (pickObj?.status === 'won') {
                              cellClass = 'bg-green-100 text-green-800 font-bold';
                            } else if (pickObj?.status === 'eliminated') {
                              cellClass = 'bg-red-100 text-red-800 font-bold';
                            } else {
                              cellClass = isDead ? 'bg-red-100 text-red-800 font-bold' : 'bg-yellow-100 text-yellow-800';
                            }
                          } else if (picksRevealed) {
                            display = <span className="text-gray-400 italic font-normal">-No Pick-</span>;
                            cellClass = 'bg-gray-50 text-gray-400';
                          }

                          const isEditing = isAdmin && editingCell?.name === user.name && editingCell?.round === roundKey;

                          return (
                            <td
                              key={i}
                              className={`py-3 px-2 text-center text-xs font-semibold cursor-pointer ${visible ? cellClass : isDead ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-transparent blur-sm'}`}
                              onClick={() => { if (isAdmin && !isEditing) setEditingCell({ name: user.name, round: roundKey }); }}
                            >
                              {isEditing ? (
                                <select
                                  autoFocus
                                  defaultValue={pickTeam}
                                  onChange={(e) => handleAdminEdit(user.name, roundKey, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-full text-center border border-gray-300 rounded px-1 py-1 bg-white text-xs"
                                >
                                  <option value="">— Clear —</option>
                                  {availableTeamsForAdmin.map(t => {
                                    const rank = teamRankMap.get(t);
                                    return <option key={t} value={t}>{rank ? `#${rank} ` : ''}{t}</option>;
                                  })}
                                </select>
                              ) : visible ? display : '█████'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="mt-20 text-gray-600 text-sm text-center">Created by Mike Schwartz</footer>
      </main>
    </>
  );
}