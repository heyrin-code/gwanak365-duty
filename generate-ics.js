const fs = require('fs');

const TARGET_NAME = process.env.TARGET_NAME || '장혜린';

if (!fs.existsSync('schedule.json')) { console.log('schedule.json 없음, 종료'); process.exit(0); }

const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

function findStatus(record) {
  for (const [role, names] of Object.entries(record.roles || {})) {
    if (names.some(n => n.includes(TARGET_NAME) || TARGET_NAME.includes(n))) {
      if (role === '연차') return { status: 'vacation', role };
      return { status: 'working', role };
    }
  }
  return { status: 'off', role: '' };
}

function pad(n) { return String(n).padStart(2, '0'); }

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

const now = new Date();
const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

const events = [];

for (const record of schedule) {
  const { status, role } = findStatus(record);
  if (status === 'off') continue;

  const dateKey = record.date.replace(/-/g, '');
  const summary = status === 'working' ? `출근 (${role})` : '연차';
  const uid = `${record.date}-${TARGET_NAME}@gwanak365-duty`;

  events.push([
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dateKey}`,
    `DTEND;VALUE=DATE:${nextDay(record.date)}`,
    `SUMMARY:${escapeText(summary)}`,
    'END:VEVENT'
  ].join('\r\n'));
}

const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//gwanak365-duty//KR',
  'CALSCALE:GREGORIAN',
  `X-WR-CALNAME:${escapeText(TARGET_NAME + ' 근무표')}`,
  'X-WR-TIMEZONE:Asia/Seoul',
  ...events,
  'END:VCALENDAR'
].join('\r\n') + '\r\n';

fs.writeFileSync('calendar.ics', ics);
console.log(`calendar.ics 생성 완료: 이벤트 ${events.length}개`);
