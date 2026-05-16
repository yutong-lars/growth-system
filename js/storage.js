/* storage.js — localStorage 操作 & 数据导入导出 */

const Storage = {

  /* ---- 通用读写 ---- */
  get(key) {
    try { return JSON.parse(localStorage.getItem('gs_' + key)); }
    catch { return null; }
  },

  set(key, val) {
    localStorage.setItem('gs_' + key, JSON.stringify(val));
  },

  remove(key) {
    localStorage.removeItem('gs_' + key);
  },

  /* ---- 用户数据 ---- */
  getAnswers() { return this.get('answers') || []; },
  saveAnswers(answers) { this.set('answers', answers); },

  getProgress() { return this.get('progress') || {}; },
  saveProgress(progress) { this.set('progress', progress); },

  getDomains() { return this.get('domains') || null; },
  saveDomains(domains) { this.set('domains', domains); },

  getInsights() { return this.get('insights') || []; },
  saveInsights(insights) { this.set('insights', insights); },

  getAssessments() { return this.get('assessments') || []; },
  saveAssessments(assessments) { this.set('assessments', assessments); },

  getUserProfile() { return this.get('profile') || { name: '', joinedAt: null }; },
  saveUserProfile(profile) { this.set('profile', profile); },

  /* ---- 问答统计 ---- */
  getQuizStats() { return this.get('quizStats') || {}; },
  saveQuizStats(stats) { this.set('quizStats', stats); },

  getQuizHistory() { return this.get('quizHistory') || []; },
  saveQuizHistory(history) { this.set('quizHistory', history); },

  getPsychologistSessions() { return this.get('psySessions') || []; },
  savePsychologistSessions(sessions) { this.set('psySessions', sessions); },

  recordQuizAnswer(quizId, domain, correct, chosenIndex) {
    // 更新统计
    const stats = this.getQuizStats();
    if (!stats[domain]) {
      stats[domain] = { totalAnswered: 0, correctCount: 0, currentDifficulty: 1 };
    }
    stats[domain].totalAnswered++;
    if (correct) stats[domain].correctCount++;
    Storage.saveQuizStats(stats);

    // 更新历史
    const history = this.getQuizHistory();
    history.push({ quizId, domain, correct, chosenIndex, answeredAt: new Date().toISOString() });
    Storage.saveQuizHistory(history);
  },

  getDomainQuizDifficulty(domain) {
    const stats = this.getQuizStats();
    if (!stats[domain]) return 1;

    const s = stats[domain];
    const accuracy = s.totalAnswered > 0 ? s.correctCount / s.totalAnswered : 0;
    const enoughAtCurrent = s.totalAnswered >= 3;

    // 正确率 > 70% 且当前难度答了 ≥ 3 题 → 解锁下一难度
    if (accuracy >= 0.7 && enoughAtCurrent && s.currentDifficulty < 3) {
      s.currentDifficulty++;
      this.saveQuizStats(stats);
    }
    return s.currentDifficulty;
  },

  /* ---- 初始化 ---- */
  init() {
    if (!this.getUserProfile().joinedAt) {
      this.saveUserProfile({ name: '', joinedAt: new Date().toISOString() });
    }
    if (!this.getDomains()) {
      this.saveDomains(ContentData.defaultDomains);
    }
    if (!Object.keys(this.getProgress()).length) {
      this.saveProgress(ContentData.defaultProgress);
    }
  },

  /* ---- 备份 ---- */
  exportAll() {
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      profile: this.getUserProfile(),
      domains: this.getDomains(),
      progress: this.getProgress(),
      answers: this.getAnswers(),
      insights: this.getInsights(),
      assessments: this.getAssessments(),
      quizStats: this.getQuizStats(),
      quizHistory: this.getQuizHistory(),
      psySessions: this.getPsychologistSessions(),
    };
  },

  importAll(data) {
    if (!data || ![1, 2, 3].includes(data.version)) throw new Error('无效的备份文件');
    this.saveUserProfile(data.profile);
    this.saveDomains(data.domains);
    this.saveProgress(data.progress);
    this.saveAnswers(data.answers);
    this.saveInsights(data.insights);
    this.saveAssessments(data.assessments);
    if (data.version >= 2) {
      this.saveQuizStats(data.quizStats || {});
      this.saveQuizHistory(data.quizHistory || []);
    }
    if (data.version >= 3) {
      this.savePsychologistSessions(data.psySessions || []);
    }
  },

  /* ---- 清除 ---- */
  clearAll() {
    const keys = ['profile', 'domains', 'progress', 'answers', 'insights', 'assessments', 'quizStats', 'quizHistory', 'psySessions'];
    keys.forEach(k => this.remove(k));
    this.init();
  }
};
