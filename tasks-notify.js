const fs = require('fs');
const https = require('https');

const NTFY_TOPIC = process.env.NTFY_TOPIC;
if (!NTFY_TOPIC) { console.log('NTFY_TOPIC 없음'); process.exit(0); }
if (!fs.existsSync('tasks.json')) { console.log('tasks.json 없음'); process.exit(0); }

let tasks;
try { tasks = JSON.parse(fs.readFileSync('tasks.json', 'utf8')); } catch(e) { console.log('tasks.json 파싱 실패'); process.exit(0); }

// 현재 KST 시간
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
const pad = n => String(n).padStart(2, '0');
const todayKey = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const curHH = pad(now.getHours()), curMM = pad(now.getMinutes());
const curTotal = now.getHours() * 60 + now.getMinutes();

// 알람 시간이 현재 시간 ±5분 이내인지 체크
function matches(alarmTime) {
  if (!alarmTime) return false;
  const [h, m] = alarmTime.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  const alarmTotal = h * 60 + m;
  return curTotal >= alarmTotal && curTotal < alarmTotal + 5;
}

function post(title, body, tags) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ topic: NTFY_TOPIC, title, message: body, tags: tags.split(',') });
    const data = Buffer.from(payload, 'utf8');
    const req = https.request({
      hostname: 'ntfy.sh', port: 443, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => resolve(res.statusCode));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const todayTasks = tasks[todayKey];
  const sends = [];

  if (todayTasks) {
    // 일별 알람
    if (matches(todayTasks.dayAlarm)) {
      const pending = (todayTasks.items || []).filter(i => !i.done);
      const body = pending.length
        ? pending.map(i => `• ${i.text}`).join('\n')
        : '오늘 할 일 없음 😊';
      sends.push(post('📋 오늘의 할 일', body, 'clipboard,bell'));
    }

    // 개별 할 일 알람
    for (const item of (todayTasks.items || [])) {
      if (!item.done && matches(item.alarm)) {
        sends.push(post(`⏰ 알림`, item.text, 'bell'));
      }
    }

    // 직장 출근 알람 (직장 입력된 날 08:30 기준)
    if (todayTasks.workplace && matches('08:30')) {
      sends.push(post(`🏢 오늘 출근`, todayTasks.workplace, 'office'));
    }
  }

  if (sends.length === 0) {
    console.log(`${curHH}:${curMM} KST - 발송할 알람 없음`);
    return;
  }

  const results = await Promise.all(sends);
  console.log(`${curHH}:${curMM} KST - ${sends.length}개 알람 발송:`, results);
}

main().catch(e => { console.error(e); process.exit(1); });
