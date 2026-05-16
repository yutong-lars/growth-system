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
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: this.getUserProfile(),
      domains: this.getDomains(),
      progress: this.getProgress(),
      answers: this.getAnswers(),
      insights: this.getInsights(),
      assessments: this.getAssessments(),
    };
  },

  importAll(data) {
    if (!data || data.version !== 1) throw new Error('无效的备份文件');
    this.saveUserProfile(data.profile);
    this.saveDomains(data.domains);
    this.saveProgress(data.progress);
    this.saveAnswers(data.answers);
    this.saveInsights(data.insights);
    this.saveAssessments(data.assessments);
  },

  /* ---- 清除 ---- */
  clearAll() {
    const keys = ['profile', 'domains', 'progress', 'answers', 'insights', 'assessments'];
    keys.forEach(k => this.remove(k));
    this.init();
  }
};
