export const UI = {
  bestScoreKey: 'scotty-souq.best-score',
  scoreCatchup: 10,
  statsDuration: 1.1,
  bannerSeconds: 2.5,
  flashSeconds: 1.15,
  clearedSeconds: 1.8,
  bossIntroSeconds: 3.2,
  bannerSweepMs: 430,
  slashSweepMs: 700,
  popMs: 240,
  shakeMs: 320,
  comboColors: ['#fff3d6', '#ffd267', '#d7adff', '#ff7b9c'],
  strings: {
    scotty: 'SCOTTY', title: 'DEFEND SOUQ WAQIF', location: 'DOHA, QATAR',
    start: 'TAP TO START', startDesktop: 'CLICK OR PRESS ANY KEY',
    controlsTouch: 'Drag to move · Swipe to dash · Auto-slash',
    controlsDesktop: 'WASD / arrows: move · Space / right-click: dash · Esc / P: pause',
    controlsHint: 'Keep the combo. Defend the souq.',
    score: 'SCORE', best: 'PERSONAL BEST', combo: 'COMBO', wave: 'WAVE', enemies: 'MASCOTS LEFT',
    bossWave: 'BOSS FIGHT', dash: 'DASH', dashReady: 'READY', dashCharging: 'CHARGING',
    boss: 'DEAN TRICK', bossSubtitle: 'Final Exam', phaseTwo: 'PHASE 2',
    finalCut: 'SWIPE FOR THE FINAL CUT!', finalCutDesktop: 'PRESS SPACE', finalCutDetail: 'FOR THE FINAL CUT!',
    cleared: 'CLEARED!', clearedDetail: 'A little breathing room. Stay sharp, Scotty.',
    finisher: 'FINISHER!', finisherDetail: 'One dash. All style.',
    bossIntro: 'DEAN TRICK', bossIntroDetail: 'FINAL EXAM',
    paused: 'TAKE A BREATHER', pausedDetail: 'The souq can wait a moment.',
    resume: 'RESUME', restart: 'RESTART',
    over: 'DOWN, BUT NOT OUT!', overDetail: 'Every good Scottie gets another shot.',
    victory: 'THE SOUQ IS SAFE!', victoryDetail: 'Final exam? Passed with flying petals.',
    playAgain: 'PLAY AGAIN', newBest: 'NEW PERSONAL BEST!', bestCombo: 'BEST COMBO',
    wavesCleared: 'WAVES CLEARED', time: 'TIME', pauseLabel: 'Pause game',
    muteLabel: 'Mute audio', unmuteLabel: 'Unmute audio',
  },
  waves: [
    ['THE BEAVERS ARE BACK', 'MIT brought the teeth. You brought the sword.'],
    ['HERE COMES THE PACK', 'Beavers and collies. Absolutely no fetch.'],
    ['A STING IN THE SHADE', 'Trees and yellow jackets join the class rivalry.'],
    ['BEAR WITH US', 'Berkeley is charging in. Keep moving!'],
    ['MASCOT MAYHEM', 'Tigers, tails and trouble. Give them a final lesson.'],
  ],
} as const;

export function readBestScore(): number {
  try {
    const score = Number(localStorage.getItem(UI.bestScoreKey));
    return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  } catch { return 0; }
}

export function saveBestScore(score: number): void {
  try { localStorage.setItem(UI.bestScoreKey, String(score)); } catch { /* Private browsing is fine. */ }
}
