import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dates = searchParams.getAll('dates');

  let allEvents: any[] = [];

  for (const dateStr of dates) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&groups=50&limit=500`,
        { next: { revalidate: 60 } }
      );
      if (res.ok) {
        const data = await res.json();
        allEvents = [...allEvents, ...(data.events || [])];
      }
    } catch {}
  }

  return NextResponse.json({ events: allEvents });
}