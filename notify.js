const fs = require('fs');
const https = require('https');

const TARGET_NAME = process.env.TARGET_NAME || '장혜린';
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const HANAM = { lat: 37.5394, lon: 127.2147, name: '하남' };
const GWANAK = { lat: 37.4784, lon: 126.9516, name: '관악구' };

if (!NTFY_TOPIC) { console.error('NTFY_TOPIC secret 없음'); process.exit(1); }
if (!fs.existsSync('schedule.json')) { console.log('schedule.json 없음, 종료'); process.exit(0); }

const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

const tomorrow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
tomorrow.setDate(tomorrow.getDate() + 1);
const pad = n => String(n).padStart(2, '0');
const tKey = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;
const days = ['일', '월', '화', '수', '목', '금', '토'];
const dateStr = `${tomorrow.getMonth()+1}월 ${tomorrow.getDate()}일(${days[tomorrow.getDay()]})`;

const record = schedule.find(x => x.date === tKey);

let status = 'off'; // 'working' | 'off' | 'vacation'
let workRole = '';
if (record) {
  for (const [role, names] of Object.entries(record.roles || {})) {
    if (names.some(n => n.includes(TARGET_NAME) || TARGET_NAME.includes(n))) {
      if (role === '연차') { status = 'vacation'; }
      else { status = 'working'; workRole = role; }
      break;
    }
  }
}

function weatherDesc(code) {
  if (code === 0) return '맑음 ☀️';
  if (code <= 2) return '구름 조금 ⛅';
  if (code === 3) return '흐림 ☁️';
  if (code <= 49) return '안개 🌫️';
  if (code <= 59) return '이슬비 🌦️';
  if (code <= 69) return '비 🌧️';
  if (code <= 79) return '눈 ❄️';
  if (code <= 82) return '소나기 🌧️';
  if (code <= 86) return '눈 소나기 🌨️';
  return '뇌우 ⛈️';
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function post(topic, title, body, tags) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ topic, title, message: body, tags: tags.split(',') });
    const data = Buffer.from(payload, 'utf8');
    const req = https.request({
      hostname: 'ntfy.sh', port: 443, path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, res => resolve(res.statusCode));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetchWeather(loc) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=2`;
  const res = await get(url);
  const i = 1; // index 1 = tomorrow
  return {
    name: loc.name,
    desc: weatherDesc(res.daily.weathercode[i]),
    max: Math.round(res.daily.temperature_2m_max[i]),
    min: Math.round(res.daily.temperature_2m_min[i]),
    rain: res.daily.precipitation_probability_max[i]
  };
}

async function main() {
  const locs = status === 'working' ? [HANAM, GWANAK] : [HANAM];
  const weathers = await Promise.all(locs.map(fetchWeather));

  const weatherLines = weathers.map(w =>
    `📍 ${w.name}: ${w.desc} ${w.min}°~${w.max}° 강수 ${w.rain}%`
  ).join('\n');

  let title, body, tags;

  if (status === 'working') {
    title = `내일 출근이에요 💼 (${dateStr})`;
    body = `${dateStr} 출근\n\n${weatherLines}`;
    tags = 'office,calendar';
  } else if (status === 'vacation') {
    title = `내일 연차예요 🌸 (${dateStr})`;
    body = `${dateStr} 연차\n\n${weatherLines}`;
    tags = 'palm_tree,calendar';
  } else {
    title = `내일은 쉬는 날이에요 🌸 (${dateStr})`;
    body = `${dateStr} 휴무\n\n${weatherLines}`;
    tags = 'palm_tree,calendar';
  }

  // ntfy.sh는 Title 헤더를 ASCII만 받아서 body에 포함
  const fullBody = `${title}\n\n${body}`;
  const code = await post(NTFY_TOPIC, title, fullBody, tags);
  console.log(`전송 완료: ${code} | 상태: ${status} | 날짜: ${tKey}`);
}

main().catch(e => { console.error(e); process.exit(1); });
