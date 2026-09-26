import type { Workout, DayOfWeek } from './types';
import { estimateSessionDuration } from './planning/sessionDuration';
import { saveFile } from './share/saveFile';

// Helper to get the starting date of a week given a weekId like "2026-W25"
export function getDateFromWeekId(weekId: string, dayOfWeek?: DayOfWeek): Date {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Jan 4th is always in week 1.
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7; // Monday = 0
  
  // Calculate the Monday of week 1
  const week1Monday = new Date(year, 0, 4 - jan4Day);
  
  // Add weeks to get to target week's Monday
  const targetWeekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);

  const daysMap: Record<DayOfWeek, number> = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
  };

  const dayOffset = dayOfWeek ? daysMap[dayOfWeek] : 0; // Default to Monday if no day specified
  
  const targetDate = new Date(targetWeekMonday.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  return targetDate;
}

function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

function formatDateToICS(date: Date, timeStr?: string): string {
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  
  let hh = '12';
  let mm = '00';
  let ss = '00';
  
  if (timeStr) {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      hh = pad(parseInt(parts[0], 10));
      mm = pad(parseInt(parts[1], 10));
    }
  }

  return `${yyyy}${MM}${dd}T${hh}${mm}${ss}`;
}

export function generateICS(workouts: Workout[]): string {
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BoulderTracker//EN',
    'CALSCALE:GREGORIAN'
  ];

  for (const w of workouts) {
    let dateObj: Date;
    
    if (w.date) {
      dateObj = new Date(w.date);
    } else if (w.weekId) {
      dateObj = getDateFromWeekId(w.weekId, w.dayOfWeek);
    } else {
      continue; // Skip if no date info
    }

    const startICS = formatDateToICS(dateObj, w.startTime);
    
    const durationMins = estimateSessionDuration(w);
    // Calculate end time
    const endObj = new Date(
      parseInt(startICS.substring(0, 4)),
      parseInt(startICS.substring(4, 6)) - 1,
      parseInt(startICS.substring(6, 8)),
      parseInt(startICS.substring(9, 11)),
      parseInt(startICS.substring(11, 13)) + durationMins
    );
    
    const endICS = formatDateToICS(endObj);

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${w.id}@bouldertracker`);
    ics.push(`DTSTAMP:${formatDateToICS(new Date())}Z`); // Keep simple local time for local calendar imports
    ics.push(`DTSTART:${startICS}`);
    ics.push(`DTEND:${endICS}`);
    ics.push(`SUMMARY:${w.notes || 'Workout Session'}`);
    
    if (w.description) {
      // Escape newlines for ICS
      const desc = w.description.replace(/\n/g, '\\n');
      ics.push(`DESCRIPTION:${desc}`);
    }
    
    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

export function exportWorkoutsToICS(workouts: Workout[]) {
  const icsData = generateICS(workouts);
  void saveFile({
    content: icsData,
    fileName: `boulder-tracker-workouts-${new Date().toISOString().split('T')[0]}.ics`,
    mimeType: 'text/calendar',
    title: 'Boulder Tracker calendar',
  });
}
