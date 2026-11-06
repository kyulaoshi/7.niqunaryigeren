// 기본 설정값. 선생님 관리자 화면에서 바꾼 내용은 데이터베이스에 저장되어 이 값을 덮어씁니다.

export const DEST_IDS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];

// building: 3D 건물 모양 (고정). zh/py/ko/mw 는 관리자 화면에서 수정 가능.
export const DEFAULT_DESTINATIONS = {
  d0: { building: 'school',   zh: '学校',   py: 'xuéxiào',    ko: '학교',     mw: '所', mwPy: 'yì suǒ', icon: '🏫' },
  d1: { building: 'hospital', zh: '医院',   py: 'yīyuàn',     ko: '병원',     mw: '家', mwPy: 'yì jiā', icon: '🏥' },
  d2: { building: 'bank',     zh: '银行',   py: 'yínháng',    ko: '은행',     mw: '家', mwPy: 'yì jiā', icon: '🏦' },
  d3: { building: 'market',   zh: '超市',   py: 'chāoshì',    ko: '슈퍼마켓', mw: '家', mwPy: 'yì jiā', icon: '🛒' },
  d4: { building: 'park',     zh: '公园',   py: 'gōngyuán',   ko: '공원',     mw: '个', mwPy: 'yí ge',  icon: '🌳' },
  d5: { building: 'restaurant', zh: '饭店', py: 'fàndiàn',    ko: '식당',     mw: '家', mwPy: 'yì jiā', icon: '🍜' },
  d6: { building: 'station',  zh: '火车站', py: 'huǒchēzhàn', ko: '기차역',   mw: '个', mwPy: 'yí ge',  icon: '🚄' },
  d7: { building: 'library',  zh: '图书馆', py: 'túshūguǎn',  ko: '도서관',   mw: '个', mwPy: 'yí ge',  icon: '📚' },
  d8: { building: 'shop',     zh: '商店',   py: 'shāngdiàn',  ko: '상점',     mw: '家', mwPy: 'yì jiā', icon: '🛍️' },
  d9: { building: 'post',     zh: '邮局',   py: 'yóujú',      ko: '우체국',   mw: '个', mwPy: 'yí ge',  icon: '📮' }
};

export const DEFAULT_SECRETS = {
  d0: '春', d1: '天', d2: '快', d3: '乐', d4: '我',
  d5: '爱', d6: '学', d7: '中', d8: '文', d9: '！'
};

// {dest} = 목적지 이름, {mw} = 양사(一家/一个…), 병음은 {destPy} {mwPy}
export const DEFAULT_PHRASES = {
  welcome:     { zh: '欢迎来到中国城市！',        py: 'Huānyíng láidào Zhōngguó chéngshì!',      ko: '중국 도시에 온 것을 환영합니다!' },
  ask:         { zh: '你去哪儿？',               py: 'Nǐ qù nǎr?',                             ko: '너는 어디에 가니?' },
  mission:     { zh: '我去{dest}。',             py: 'Wǒ qù {destPy}.',                        ko: '나는 {destKo}에 가요.' },
  start:       { zh: '请往前走。',               py: 'Qǐng wǎng qián zǒu.',                    ko: '앞으로 가세요.' },
  straight:    { zh: '请一直往前走。',            py: 'Qǐng yìzhí wǎng qián zǒu.',              ko: '계속 앞으로 가세요.' },
  crossroad:   { zh: '前面有一个路口。',          py: 'Qiánmiàn yǒu yí ge lùkǒu.',              ko: '앞에 교차로가 하나 있어요.' },
  turnLeftAt:  { zh: '到了路口，往左拐。',        py: 'Dàole lùkǒu, wǎng zuǒ guǎi.',            ko: '교차로에 도착하면 왼쪽으로 도세요.' },
  turnRightAt: { zh: '到了路口，往右拐。',        py: 'Dàole lùkǒu, wǎng yòu guǎi.',            ko: '교차로에 도착하면 오른쪽으로 도세요.' },
  left:        { zh: '请往左拐。',               py: 'Qǐng wǎng zuǒ guǎi.',                    ko: '왼쪽으로 도세요.' },
  right:       { zh: '请往右拐。',               py: 'Qǐng wǎng yòu guǎi.',                    ko: '오른쪽으로 도세요.' },
  back:        { zh: '请往回走。',               py: 'Qǐng wǎng huí zǒu.',                     ko: '뒤로 돌아가세요.' },
  wrong:       { zh: '你走错路了，请再试一次。',   py: 'Nǐ zǒucuò lù le, qǐng zài shì yí cì.',   ko: '길을 잘못 들었어요. 다시 해 보세요.' },
  ahead:       { zh: '前面有一{mw}{dest}。',      py: 'Qiánmiàn yǒu {mwPy} {destPy}.',          ko: '앞쪽에 {destKo}이(가) 있어요.' },
  near:        { zh: '目的地快到了！',            py: 'Mùdìdì kuài dào le!',                    ko: '목적지에 거의 다 왔어요!' },
  found:       { zh: '恭喜你，找到了！',          py: 'Gōngxǐ nǐ, zhǎodào le!',                 ko: '축하해요, 찾았어요!' },
  openChest:   { zh: '请按E键打开宝箱。',         py: 'Qǐng àn E jiàn dǎkāi bǎoxiāng.',         ko: 'E 키를 눌러 보물상자를 여세요.' },
  complete:    { zh: '恭喜你！任务完成！',         py: 'Gōngxǐ nǐ! Rènwù wánchéng!',             ko: '축하해요! 임무 완료!' },
  complete2:   { zh: '你成功找到了老师的全部秘密！', py: 'Nǐ chénggōng zhǎodàole lǎoshī de quánbù mìmì!', ko: '선생님의 비밀을 모두 찾았어요!' },
  timeUp:      { zh: '时间到了！',               py: 'Shíjiān dào le!',                        ko: '시간이 다 됐어요!' }
};

export const PHRASE_LABELS = {
  welcome: '게임 시작', ask: '미션 질문', mission: '미션 답(목적지)', start: '출발',
  straight: '직진', crossroad: '교차로 접근', turnLeftAt: '교차로에서 좌회전', turnRightAt: '교차로에서 우회전',
  left: '왼쪽으로', right: '오른쪽으로', back: '뒤로 돌아가기', wrong: '잘못된 길',
  ahead: '목적지가 앞에 보임', near: '목적지 접근', found: '목적지 도착', openChest: '보물상자 열기 안내',
  complete: '완주 1', complete2: '완주 2', timeUp: '시간 종료'
};

export const DEFAULT_SETTINGS = {
  title: '寻找老师的秘密！',
  subtitle: '선생님의 비밀을 찾아라!',
  durationMin: 20,         // 0 = 시간 제한 없음
  allowJoin: true,
  showKorean: true,        // 학생 화면에서 한국어 뜻 보기 허용
  showPinyin: true,
  voiceRate: 0.85
};

export function fillTemplate(str, dest) {
  if (!str) return '';
  if (!dest) return str.replace(/\{[a-zA-Z]+\}/g, '');
  return str
    .replaceAll('{dest}', dest.zh || '')
    .replaceAll('{destPy}', dest.py || '')
    .replaceAll('{destKo}', dest.ko || '')
    .replaceAll('{mwPy}', dest.mwPy || '')
    .replaceAll('{mw}', dest.mw || '');
}

export function mergeConfig(cfg) {
  cfg = cfg || {};
  const dests = {};
  for (const id of DEST_IDS) dests[id] = { ...DEFAULT_DESTINATIONS[id], ...((cfg.destinations || {})[id] || {}), building: DEFAULT_DESTINATIONS[id].building };
  const phrases = {};
  for (const k of Object.keys(DEFAULT_PHRASES)) phrases[k] = { ...DEFAULT_PHRASES[k], ...((cfg.phrases || {})[k] || {}) };
  return { settings: { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) }, destinations: dests, phrases };
}

export function nameKey(name) {
  return encodeURIComponent(String(name).trim().toLowerCase().replace(/\s+/g, ' ')).replace(/\./g, '%2E').slice(0, 120);
}

// 경과 시간 (ms) 계산 — 서버 시각 기준
export function gameElapsed(game, now) {
  if (!game || !game.startedAt) return 0;
  const paused = game.pausedTotal || 0;
  if (game.status === 'running') return Math.max(0, now - game.startedAt - paused);
  if (game.status === 'paused') return Math.max(0, (game.pausedAt || now) - game.startedAt - paused);
  if (game.status === 'ended') return Math.max(0, (game.endedAt || now) - game.startedAt - paused);
  return 0;
}

export function gameRemaining(game, now) {
  if (!game || !game.durationSec) return null;
  return Math.max(0, game.durationSec * 1000 - gameElapsed(game, now));
}

export function fmtTime(ms) {
  if (ms == null || isNaN(ms)) return '--:--';
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
