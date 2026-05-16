/* app.js — 主应用逻辑 */

const App = {

  /* ---- 当前状态 ---- */
  state: {
    currentPage: 'home',
    currentCard: null,       // { domain, module, card }
    currentAnswer: '',       // 暂存的回答文本
    assessmentIndex: 0,
    assessmentAnswers: [],
    selectedDomainTag: null,
  },

  /* ==================== 初始化 ==================== */
  init() {
    Storage.init();
    this.setGreeting();
    this.renderHome();
    this.setTodayTitle();

    // 检查是否有今日回答
    const today = new Date().toISOString().split('T')[0];
    const todayAnswers = Storage.getAnswers().filter(a => a.createdAt.startsWith(today));
    if (todayAnswers.length > 0) {
      this.state.currentAnswer = todayAnswers[0].content;
    }
  },

  setGreeting() {
    const hour = new Date().getHours();
    let greet;
    if (hour < 6) greet = '夜深了';
    else if (hour < 9) greet = '早安';
    else if (hour < 12) greet = '上午好';
    else if (hour < 14) greet = '中午好';
    else if (hour < 18) greet = '下午好';
    else greet = '晚上好';

    const profile = Storage.getUserProfile();
    const name = profile.name || '';
    document.getElementById('greeting').textContent = name ? `${greet}，${name}` : greet;
  },

  setTodayTitle() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('top-bar-title').textContent =
      `${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekdays[now.getDay()]}`;
  },

  /* ==================== 导航 ==================== */
  navigate(page) {
    this.state.currentPage = page;

    // 切换页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    // 切换底部导航
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    // 顶部栏
    const titles = { home: '每日成长', map: '成长推荐', domains: '领域管理', profile: '我的档案' };
    document.getElementById('top-bar-title').textContent = titles[page] || '';

    // 渲染各页
    if (page === 'home') this.renderHome();
    if (page === 'map') this.renderGrowth();
    if (page === 'domains') this.renderDomains();
    if (page === 'profile') this.renderProfile();

    // 回到顶部
    window.scrollTo(0, 0);

    // 隐藏弹窗
    this.hideAllModals();
  },

  /* ==================== 首页 ==================== */
  renderHome() {
    const today = new Date().toISOString().split('T')[0];
    const todayAnswers = Storage.getAnswers().filter(a => a.createdAt.startsWith(today));

    this.updateStreak();
    this.renderTodayCard(); // 始终调用以设置 currentCard

    if (todayAnswers.length > 0) {
      document.getElementById('today-card').classList.add('hidden');
      document.getElementById('btn-start').classList.add('hidden');
      document.getElementById('streak-bar').classList.add('hidden');
      document.getElementById('hint-completed').classList.remove('hidden');
    } else {
      document.getElementById('today-card').classList.remove('hidden');
      document.getElementById('btn-start').classList.remove('hidden');
      document.getElementById('streak-bar').classList.remove('hidden');
      document.getElementById('hint-completed').classList.add('hidden');
    }

    this.renderQuizzes();
  },

  renderTodayCard() {
    const card = this.getTodayCard();
    if (!card) {
      document.getElementById('card-domain').textContent = '欢迎';
      document.getElementById('card-module').textContent = '开始';
      document.getElementById('card-day').textContent = '';
      document.getElementById('card-knowledge-text').textContent =
        '你还未添加任何成长领域。请先到"领域"页面选择你感兴趣的方向。';
      document.getElementById('card-question-text').textContent = '你想在哪些方面提升自己？';
      document.getElementById('card-action-text').textContent = '去添加第一个领域开始成长之旅';
      document.getElementById('btn-start').textContent = '去添加领域';
      document.getElementById('btn-start').onclick = () => this.navigate('domains');
      return;
    }

    this.state.currentCard = card;

    document.getElementById('card-domain').textContent = card.domain.name;
    document.getElementById('card-module').textContent = card.module.name;
    document.getElementById('card-day').textContent = `Day ${card.card.dayNumber}`;
    document.getElementById('card-knowledge-text').textContent = card.card.knowledge;
    document.getElementById('card-question-text').textContent = card.card.question;
    document.getElementById('card-action-text').textContent = '今日行动：' + card.card.action;
    document.getElementById('btn-start').textContent = '开始今日反思';
    document.getElementById('btn-start').onclick = () => this.openCard();
  },

  getTodayCard() {
    const domains = Storage.getDomains();
    if (!domains || !domains.length) return null;

    const progress = Storage.getProgress();

    // 找到当前活跃的模块（第一个有未完成卡片的模块）
    for (const domain of domains) {
      for (const mod of domain.modules) {
        if (!mod.cards || !mod.cards.length) continue;
        const key = domain.id + '__' + mod.id;
        const prog = progress[key] || { currentDay: 0, completedAt: [] };
        const nextDay = prog.currentDay + 1;
        if (nextDay <= mod.totalDays) {
          const card = mod.cards.find(c => c.dayNumber === nextDay);
          if (card) {
            return { domain, module: mod, card, progressKey: key };
          }
        }
      }
    }

    // 所有模块都完成了 —— 循环到第一个模块
    const first = domains[0];
    if (!first) return null;
    const firstMod = first.modules[0];
    if (!firstMod || !firstMod.cards || !firstMod.cards.length) return null;
    return { domain: first, module: firstMod, card: firstMod.cards[0], progressKey: first.id + '__' + firstMod.id, restart: true };
  },

  updateStreak() {
    const answers = Storage.getAnswers();
    if (!answers.length) {
      document.getElementById('streak-count').textContent = '0';
      return;
    }

    // 计算连续天数（从今天往回数）
    const dates = new Set(answers.map(a => a.createdAt.split('T')[0]));
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (dates.has(ds)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    document.getElementById('streak-count').textContent = streak;
  },

  /* ==================== 问答系统 ==================== */
  renderQuizzes() {
    const allQuizzes = ContentData.quizzes;
    if (!allQuizzes || !allQuizzes.length) return;

    // 用日期做种子，保证同一天看到同样的题
    const today = new Date().toISOString().split('T')[0];
    const seed = today.split('-').reduce((s, n) => s + parseInt(n), 0);

    // 获取已答记录（今天）
    const todayHistory = Storage.getQuizHistory().filter(h => h.answeredAt.startsWith(today));
    const answeredIds = new Set(todayHistory.map(h => h.quizId));

    // 统计各领域正确率，找薄弱领域
    const stats = Storage.getQuizStats();
    const domains = [...new Set(allQuizzes.map(q => q.domain))];
    let weakDomain = null;
    let lowestAccuracy = 1;
    for (const d of domains) {
      const s = stats[d];
      if (!s || s.totalAnswered === 0) { weakDomain = d; break; }
      const acc = s.correctCount / s.totalAnswered;
      if (acc < lowestAccuracy) { lowestAccuracy = acc; weakDomain = d; }
    }

    const selected = [];
    const usedIds = new Set();

    // 每题：从对应领域选，取当前难度，排除已答
    const pickQuiz = (domain, seedOffset) => {
      const difficulty = Storage.getDomainQuizDifficulty(domain);
      const candidates = allQuizzes.filter(q =>
        q.domain === domain && q.difficulty === difficulty && !usedIds.has(q.id) && !answeredIds.has(q.id)
      );
      if (candidates.length === 0) {
        // 降级：同领域任意难度
        const fallback = allQuizzes.filter(q =>
          q.domain === domain && !usedIds.has(q.id) && !answeredIds.has(q.id)
        );
        if (fallback.length === 0) {
          // 跨领域随机
          const any = allQuizzes.filter(q => !usedIds.has(q.id) && !answeredIds.has(q.id));
          if (any.length === 0) return null;
          return any[(seed + seedOffset) % any.length];
        }
        return fallback[(seed + seedOffset) % fallback.length];
      }
      return candidates[(seed + seedOffset) % candidates.length];
    };

    // 选3题：薄弱领域1题 + 随机领域1题 + 跨领域1题
    const pick1 = pickQuiz(weakDomain || domains[0], 0);
    if (pick1) { selected.push(pick1); usedIds.add(pick1.id); }

    const randomDomain = domains[(seed * 3) % domains.length];
    const pick2 = pickQuiz(randomDomain, 1);
    if (pick2) { selected.push(pick2); usedIds.add(pick2.id); }

    const crossDomain = domains[(seed * 7 + 2) % domains.length];
    const pick3 = pickQuiz(crossDomain, 2);
    if (pick3) { selected.push(pick3); usedIds.add(pick3.id); }

    const container = document.getElementById('quiz-list');
    const section = document.getElementById('quiz-section');
    if (!selected.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');

    container.innerHTML = selected.map((q, qi) => {
      const prevAnswer = todayHistory.find(h => h.quizId === q.id);
      const answered = !!prevAnswer;
      const chosen = prevAnswer ? prevAnswer.chosenIndex : -1;
      return `<div class="quiz-card" id="quiz-${qi}" data-quiz-id="${q.id}">
        <div class="quiz-card-header">
          <span class="quiz-domain-name">${q.icon || '📝'} ${q.domain}</span>
          <span class="quiz-difficulty">Lv.${q.difficulty}</span>
        </div>
        <div class="quiz-question">${q.question}</div>
        <div class="quiz-options" id="quiz-opts-${qi}">
          ${q.options.map((opt, oi) => {
            let cls = 'quiz-option';
            if (answered && oi === q.correctIndex) cls += ' chosen-correct';
            else if (answered && oi === chosen && oi !== q.correctIndex) cls += ' chosen-wrong';
            const disabled = answered ? 'disabled' : '';
            return `<div class="${cls}" ${disabled} onclick="App.selectQuizAnswer(${qi}, ${oi})">${opt}</div>`;
          }).join('')}
        </div>
        <div class="quiz-result ${answered ? (prevAnswer.correct ? 'correct' : 'wrong') : 'hidden'}" id="quiz-result-${qi}">
          ${answered ? (prevAnswer.correct ? '✅ 回答正确！' : '❌ 回答错误') : ''}
          <div class="quiz-explanation">${q.explanation}</div>
        </div>
      </div>`;
    }).join('');

    this.renderQuizStatsBar();
  },

  selectQuizAnswer(qi, chosenIndex) {
    const container = document.getElementById('quiz-list');
    const quizCards = container.querySelectorAll('.quiz-card');
    if (qi >= quizCards.length) return;
    const quizCard = quizCards[qi];

    // 检查是否已答
    if (quizCard.querySelector('.quiz-option.chosen-correct, .quiz-option.chosen-wrong')) return;

    // 从 DOM 数据属性获取 quiz ID，查找题目
    const quizId = quizCard.dataset.quizId;
    const quiz = ContentData.quizzes.find(q => q.id === quizId);
    if (!quiz) return;

    const correct = chosenIndex === quiz.correctIndex;

    // 记录答题
    Storage.recordQuizAnswer(quiz.id, quiz.domain, correct, chosenIndex);

    // 显示结果
    const options = quizCard.querySelectorAll('.quiz-option');
    options.forEach((opt, oi) => {
      opt.classList.add('disabled');
      if (oi === quiz.correctIndex) opt.classList.add('chosen-correct');
      else if (oi === chosenIndex && !correct) opt.classList.add('chosen-wrong');
    });

    const resultDiv = quizCard.querySelector('.quiz-result');
    resultDiv.classList.remove('hidden');
    resultDiv.classList.add(correct ? 'correct' : 'wrong');
    resultDiv.innerHTML = `
      ${correct ? '✅ 回答正确！' : '❌ 回答错误'}
      <div class="quiz-explanation">${quiz.explanation}</div>
    `;

    this.renderQuizStatsBar();
  },

  renderQuizStatsBar() {
    const stats = Storage.getQuizStats();
    const domains = Object.keys(stats);
    const container = document.getElementById('quiz-stats-bar');
    if (!domains.length) {
      container.innerHTML = '';
      return;
    }
    const entries = domains.map(d => {
      const s = stats[d];
      const pct = s.totalAnswered > 0 ? Math.round((s.correctCount / s.totalAnswered) * 100) : 0;
      return `<span title="${d}: ${pct}% 正确率 (${s.correctCount || 0}/${s.totalAnswered || 0})">${d.slice(0,2)} Lv.${s.currentDifficulty || 1} ${pct}%</span>`;
    }).join(' · ');
    container.innerHTML = entries;
  },

  /* ==================== 打开卡片 → 回答页 ==================== */
  openCard() {
    const card = this.state.currentCard;
    if (!card) { this.navigate('domains'); return; }

    // 检查今天是否已提交
    const today = new Date().toISOString().split('T')[0];
    const todayAnswers = Storage.getAnswers().filter(a => a.createdAt.startsWith(today));
    const existingAnswer = todayAnswers.find(
      a => a.domainId === card.domain.id && a.moduleId === card.module.id && a.cardDay === card.card.dayNumber
    );

    document.getElementById('answer-domain').textContent = card.domain.name;
    document.getElementById('answer-module').textContent = card.module.name;
    document.getElementById('answer-day').textContent = 'Day ' + card.card.dayNumber;
    document.getElementById('answer-knowledge').textContent = card.card.knowledge;
    document.getElementById('answer-question').textContent = card.card.question;
    document.getElementById('answer-action-text').textContent = card.card.action;

    if (existingAnswer) {
      document.getElementById('answer-textarea').value = existingAnswer.content;
      document.getElementById('action-done').checked = existingAnswer.actionDone;
      document.getElementById('btn-submit').textContent = '更新今日反思';
    } else {
      document.getElementById('answer-textarea').value = this.state.currentAnswer || '';
      document.getElementById('action-done').checked = false;
      document.getElementById('btn-submit').textContent = '提交今日反思';
    }

    this.navigatePageOnly('answer');
  },

  /* ==================== 提交回答 ==================== */
  submitAnswer() {
    const content = document.getElementById('answer-textarea').value.trim();
    if (!content) {
      alert('请写下你的反思再提交');
      return;
    }

    const actionDone = document.getElementById('action-done').checked;
    const card = this.state.currentCard;
    const today = new Date().toISOString().split('T')[0];

    const answer = {
      id: 'ans_' + Date.now(),
      domainId: card.domain.id,
      moduleId: card.module.id,
      cardDay: card.card.dayNumber,
      content,
      actionDone,
      createdAt: new Date().toISOString(),
    };

    // 保存回答
    const answers = Storage.getAnswers();

    // 重复提交同一卡片 → 更新
    const existingIdx = answers.findIndex(
      a => a.domainId === card.domain.id && a.moduleId === card.module.id && a.cardDay === card.card.dayNumber
    );
    if (existingIdx >= 0) {
      answers[existingIdx] = answer;
    } else {
      answers.push(answer);
    }
    Storage.saveAnswers(answers);

    // 更新进度
    const progress = Storage.getProgress();
    if (!progress[card.progressKey]) {
      progress[card.progressKey] = { currentDay: 0, completedAt: [] };
    }
    if (progress[card.progressKey].currentDay < card.card.dayNumber) {
      progress[card.progressKey].currentDay = card.card.dayNumber;
    }
    if (!progress[card.progressKey].completedAt.includes(today)) {
      progress[card.progressKey].completedAt.push(today);
    }
    Storage.saveProgress(progress);

    // 运行诊断
    Diagnosis.run(card.domain.id, content, actionDone);

    // 清空暂存
    this.state.currentAnswer = '';

    // 显示反馈页
    this.renderFeedback(answer);
  },

  /* ==================== 反馈页 ==================== */
  renderFeedback(answer) {
    const card = this.state.currentCard;
    const progress = Storage.getProgress();
    const prog = progress[card.progressKey] || { currentDay: 0, completedAt: [] };

    // 进度
    document.getElementById('fb-domain').textContent = card.domain.name;
    document.getElementById('fb-module').textContent = card.module.name;
    const pct = Math.round((prog.currentDay / card.module.totalDays) * 100);
    document.getElementById('fb-bar').style.width = pct + '%';
    document.getElementById('fb-progress-text').textContent = `${prog.currentDay}/${card.module.totalDays} 天`;

    // 下一阶段
    const currentModIdx = card.domain.modules.findIndex(m => m.id === card.module.id);
    if (currentModIdx >= 0 && currentModIdx < card.domain.modules.length - 1) {
      document.getElementById('fb-next').textContent = '下一阶段：' + card.domain.modules[currentModIdx + 1].name;
    } else {
      document.getElementById('fb-next').textContent = '本模块即将完成！';
    }

    // 扩展知识
    document.getElementById('fb-extend-title').textContent = card.card.extendTitle || '';
    document.getElementById('fb-extend-body').textContent = card.card.extendBody || '';

    // 历史回答
    const domainAnswers = Storage.getAnswers()
      .filter(a => a.domainId === card.domain.id && a.id !== answer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);

    const historyContainer = document.getElementById('feedback-history');
    if (domainAnswers.length === 0) {
      historyContainer.innerHTML = '<p style="color: var(--text-light); font-size: 14px;">这是你在这个领域的第一天</p>';
    } else {
      historyContainer.innerHTML = domainAnswers.map(a => {
        const d = new Date(a.createdAt);
        const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
        return `<div class="history-item">
          <div class="history-item-meta">${dateStr} · ${this.getModuleName(a.domainId, a.moduleId)} · Day ${a.cardDay}</div>
          <div class="history-item-preview">${this.escapeHtml(a.content)}</div>
        </div>`;
      }).join('');
    }

    this.navigatePageOnly('feedback');
  },

  goHome() {
    this.navigate('home');
  },

  /* ==================== 成长推荐 ==================== */
  renderGrowth() {
    const stats = Storage.getQuizStats();
    const domains = [...new Set(ContentData.quizzes.map(q => q.domain))];
    const knowledgeCards = ContentData.knowledgeCards || [];

    // 1. 知识掌握度仪表盘
    const masteryContainer = document.getElementById('mastery-list');
    if (!Object.keys(stats).length) {
      masteryContainer.innerHTML = '<p class="insight-empty">完成今日挑战的问答后，这里会显示你的知识掌握情况</p>';
    } else {
      masteryContainer.innerHTML = domains.map(d => {
        const s = stats[d];
        if (!s) return '';
        const pct = s.totalAnswered > 0 ? Math.round((s.correctCount / s.totalAnswered) * 100) : 0;
        let level = 'weak';
        if (pct >= 70) level = 'strong';
        else if (pct >= 40) level = 'medium';
        return `<div class="mastery-row">
          <span class="mastery-name">${d}</span>
          <span class="mastery-stats">${s.correctCount || 0}/${s.totalAnswered || 0} 正确</span>
          <div class="mastery-bar-wrap"><div class="mastery-bar-fill ${level}" style="width:${pct}%"></div></div>
        </div>`;
      }).filter(Boolean).join('');
    }

    // 2. 薄弱环节分析
    const weaknessContainer = document.getElementById('weakness-card');
    const weakDomains = [];
    for (const d of domains) {
      const s = stats[d];
      if (!s || s.totalAnswered === 0) {
        weakDomains.push({ domain: d, reason: '尚未答题' });
        continue;
      }
      const pct = s.correctCount / s.totalAnswered;
      if (pct < 0.5) weakDomains.push({ domain: d, reason: `正确率仅 ${Math.round(pct * 100)}%` });
    }

    // 从评估中获取弱项
    const assessments = Storage.getAssessments();
    if (assessments.length > 0) {
      const latest = assessments[assessments.length - 1];
      const topWeak = Object.entries(latest.weakAreas || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
      for (const [area, score] of topWeak) {
        if (!weakDomains.find(w => w.domain === area) && score >= 1) {
          weakDomains.push({ domain: area, reason: `评估弱项 (得分${score})` });
        }
      }
    }

    // 从诊断洞察中获取
    const insights = Storage.getInsights().filter(i => i.type === 'weak_signal' && !i.read);
    for (const ins of insights.slice(0, 2)) {
      const domainName = ins.suggestion.split('的')[0] || ins.suggestion.slice(0, 8);
      if (!weakDomains.find(w => w.domain === domainName)) {
        weakDomains.push({ domain: domainName, reason: '诊断发现' });
      }
    }

    if (!weakDomains.length) {
      weaknessContainer.innerHTML = '<p class="insight-empty">系统会根据问答、评估和反思数据，分析你需要加强的领域</p>';
    } else {
      weaknessContainer.innerHTML = '<div class="weakness-tags">' + weakDomains.slice(0, 5).map(w =>
        `<span class="weakness-tag">${w.domain}<small>（${w.reason}）</small></span>`
      ).join('') + '</div>';
    }

    // 3. 推荐学习内容
    const recommendContainer = document.getElementById('recommend-list');
    const weakDomainNames = new Set(weakDomains.map(w => w.domain));
    let recommended = knowledgeCards.filter(c => weakDomainNames.has(c.domain));
    if (recommended.length === 0) {
      // 无薄弱数据时随机推荐
      const shuffled = [...knowledgeCards].sort(() => Math.random() - 0.5);
      recommended = shuffled.slice(0, 3);
    }
    if (!recommended.length) {
      recommendContainer.innerHTML = '<p class="insight-empty">确定薄弱环节后，这里会推荐匹配的知识卡片</p>';
    } else {
      recommendContainer.innerHTML = recommended.slice(0, 5).map(c =>
        `<div class="recommend-card">
          <div class="recommend-card-header">
            <span class="recommend-domain">${c.domain}</span>
            <span class="recommend-difficulty">Lv.${c.difficulty}</span>
          </div>
          <div class="recommend-topic">${c.topic}</div>
          <div class="recommend-body">${c.body}</div>
        </div>`
      ).join('');
    }
  },

  jumpToModule(domainId, moduleId) {
    const domains = Storage.getDomains();
    const domain = domains.find(d => d.id === domainId);
    if (!domain) return;
    const mod = domain.modules.find(m => m.id === moduleId);
    if (!mod) return;
    const progress = Storage.getProgress();
    const prog = progress[domainId + '__' + moduleId] || { currentDay: 0 };
    const nextDay = prog.currentDay + 1;
    const card = mod.cards ? mod.cards.find(c => c.dayNumber === nextDay) : null;
    if (!card) return;

    this.state.currentCard = { domain, module: mod, card, progressKey: domainId + '__' + moduleId };
    this.openCard();
  },

  /* ==================== 领域管理 ==================== */
  renderDomains() {
    const domains = Storage.getDomains() || [];
    const progress = Storage.getProgress();
    const container = document.getElementById('domain-progress-list');

    if (!domains.length) {
      container.innerHTML = '<p class="insight-empty">暂未添加领域，点击下方按钮开始</p>';
    } else {
      container.innerHTML = domains.map(domain => {
        const modulesHtml = domain.modules.map(mod => {
          const key = domain.id + '__' + mod.id;
          const prog = progress[key] || { currentDay: 0, completedAt: [] };
          const hasCards = mod.cards && mod.cards.length > 0;
          const pct = hasCards && mod.totalDays > 0 ? Math.round((prog.currentDay / mod.totalDays) * 100) : 0;

          let actionHtml = '';
          if (hasCards) {
            const nextDay = prog.currentDay + 1;
            if (nextDay <= mod.totalDays) {
              actionHtml = `<span class="dp-module-action" onclick="App.jumpToModule('${domain.id}', '${mod.id}')">${prog.currentDay > 0 ? '继续' : '开始'}</span>`;
            } else {
              actionHtml = '<span class="dp-module-action done">已完成</span>';
            }
          }

          return `<div class="dp-module">
            <span class="dp-module-status">${hasCards ? (prog.currentDay >= mod.totalDays ? '✅' : '📖') : '—'}</span>
            <span class="dp-module-name">${mod.name} · ${hasCards ? prog.currentDay + '/' + mod.totalDays : '暂未开放'}</span>
            <div class="dp-module-bar-wrap"><div class="dp-module-bar-fill" style="width:${pct}%"></div></div>
            ${actionHtml}
          </div>`;
        }).join('');

        return `<div class="domain-progress-card">
          <div class="domain-progress-header">
            <span class="dp-icon">${domain.icon}</span>
            <span class="dp-name">${domain.name}</span>
            <span class="dp-module-remove" onclick="App.removeDomain('${domain.id}')" title="移除">×</span>
          </div>
          <div class="domain-progress-modules">${modulesHtml}</div>
        </div>`;
      }).join('');
    }

    // 诊断洞察
    this.renderInsights();

    // 评估状态
    this.renderAssessmentStatus();
  },

  renderInsights() {
    const insights = Storage.getInsights().filter(i => !i.read).sort((a, b) => b.confidence - a.confidence);
    const container = document.getElementById('insight-list');

    if (!insights.length) {
      container.innerHTML = '<p class="insight-empty">完成更多反思后，系统会在这里给出洞察</p>';
      return;
    }

    container.innerHTML = insights.slice(0, 3).map(i => {
      const typeClass = i.type === 'weak_signal' ? 'weak' : 'growth';
      const dotClass = i.type === 'weak_signal' ? 'weak' : 'growth';
      const emoji = i.type === 'weak_signal' ? '🟡' : '🟢';
      return `<div class="insight-card ${typeClass}">
        <div class="insight-domain"><span class="insight-dot ${dotClass}"></span>${emoji} ${i.suggestion.split('的')[0] || i.suggestion.slice(0, 12)}</div>
        <div class="insight-body">${i.suggestion}</div>
        <span class="insight-action" onclick="App.dismissInsight('${i.id}')">知道了</span>
      </div>`;
    }).join('');
  },

  dismissInsight(id) {
    const insights = Storage.getInsights();
    const found = insights.find(i => i.id === id);
    if (found) { found.read = true; }
    Storage.saveInsights(insights);
    this.renderInsights();
  },

  renderAssessmentStatus() {
    const assessments = Storage.getAssessments();
    const latest = assessments.length ? assessments[assessments.length - 1] : null;
    const container = document.getElementById('assessment-status');

    if (latest && new Date(latest.createdAt) > new Date(Date.now() - 7 * 24 * 3600 * 1000)) {
      container.textContent = '本周评估已完成。下次评估将在7天后自动提示。';
    } else {
      const daysToFriday = (5 - new Date().getDay() + 7) % 7;
      container.innerHTML = `下次评估将在 ${daysToFriday === 0 ? '今天' : daysToFriday + '天后'} 提示。<br>
        <button class="btn-ghost small" style="margin-top:8px" onclick="App.startAssessment()">立即进行评估</button>`;
    }
  },

  /* ==================== 添加/移除领域 ==================== */
  showAddDomain() {
    const presets = ContentData.presetDomains;
    const currentDomains = Storage.getDomains() || [];
    const currentIds = new Set(currentDomains.map(d => d.id));
    const available = presets.filter(p => !currentIds.has(p.id));

    const container = document.getElementById('preset-domain-list');
    if (available.length === 0) {
      container.innerHTML = '<p style="font-size:14px;color:var(--text-light)">所有预设领域已添加</p>';
    } else {
      container.innerHTML = available.map(p => `
        <span class="modal-preset-tag" onclick="App.selectPresetDomain('${p.id}')" data-domain-id="${p.id}">
          ${p.icon} ${p.name}
        </span>
      `).join('');
    }

    this.state.selectedDomainTag = null;
    document.getElementById('input-custom-domain').value = '';
    document.getElementById('modal-add-domain').classList.remove('hidden');
  },

  hideAddDomain() {
    document.getElementById('modal-add-domain').classList.add('hidden');
  },

  selectPresetDomain(id) {
    this.state.selectedDomainTag = id;
    document.querySelectorAll('#preset-domain-list .modal-preset-tag').forEach(t => {
      t.style.borderColor = t.dataset.domainId === id ? 'var(--primary)' : 'transparent';
    });
  },

  addDomain() {
    const customInput = document.getElementById('input-custom-domain').value.trim();
    const presets = ContentData.presetDomains;
    const currentDomains = Storage.getDomains() || [];

    let addedDomain = null;

    if (this.state.selectedDomainTag) {
      const preset = presets.find(p => p.id === this.state.selectedDomainTag);
      if (!preset) return;
      const defaultData = ContentData.defaultDomains.find(d => d.id === preset.id);
      if (!defaultData) {
        // 没有默认内容的领域，创建空壳
        addedDomain = {
          id: preset.id,
          name: preset.name,
          icon: preset.icon,
          color: '#999',
          modules: [{
            id: 'basics',
            name: '基础知识',
            totalDays: 0,
            order: 1,
            cards: []
          }]
        };
      } else {
        // 直接用默认数据（有完整的卡片内容）
        // 检查是否已存在
        if (currentDomains.find(d => d.id === preset.id)) return;
        addedDomain = JSON.parse(JSON.stringify(defaultData));
      }
    } else if (customInput) {
      const id = 'custom_' + Date.now();
      addedDomain = {
        id,
        name: customInput,
        icon: '📌',
        color: '#999',
        modules: [{
          id: 'basics',
          name: '基础知识',
          totalDays: 0,
          order: 1,
          cards: []
        }]
      };
    }

    if (!addedDomain) return;

    currentDomains.push(addedDomain);
    Storage.saveDomains(currentDomains);

    // 初始化进度
    const progress = Storage.getProgress();
    for (const mod of addedDomain.modules) {
      const key = addedDomain.id + '__' + mod.id;
      if (!progress[key]) {
        progress[key] = { currentDay: 0, completedAt: [] };
      }
    }
    Storage.saveProgress(progress);

    this.hideAddDomain();
    this.renderDomains();
    this.renderGrowth();

    // 如果从首页来，刷新首页卡片
    if (this.state.currentPage === 'domains') {
      // already on domains, stay here
    }
  },

  removeDomain(id) {
    const domains = Storage.getDomains() || [];
    const filtered = domains.filter(d => d.id !== id);
    Storage.saveDomains(filtered);

    // 清除相关进度
    const progress = Storage.getProgress();
    for (const key of Object.keys(progress)) {
      if (key.startsWith(id + '__')) delete progress[key];
    }
    Storage.saveProgress(progress);

    this.renderDomains();
    this.renderGrowth();
  },

  /* ==================== 评估 ==================== */
  startAssessment() {
    this.state.assessmentIndex = 0;
    this.state.assessmentAnswers = [];
    this.navigatePageOnly('assessment');
    this.renderAssessmentQuestion();
  },

  renderAssessmentQuestion() {
    const qs = ContentData.assessmentQuestions;
    const i = this.state.assessmentIndex;
    if (i >= qs.length) return;

    const q = qs[i];
    document.getElementById('assess-domain').textContent = q.domain === '综合' ? '自我认知' : q.domain;
    document.getElementById('assess-question').textContent = q.question;
    document.getElementById('assess-progress').textContent = `${i + 1}/${qs.length}`;

    const selected = this.state.assessmentAnswers[i];
    document.getElementById('assess-options').innerHTML = q.options.map((opt, oi) => `
      <div class="assessment-option ${selected === oi ? 'selected' : ''}" onclick="App.selectAssessmentOption(${oi})">
        ${opt.text}
      </div>
    `).join('');

    document.getElementById('btn-assess-prev').style.visibility = i === 0 ? 'hidden' : '';
    document.getElementById('btn-assess-next').style.visibility = i === qs.length - 1 ? 'hidden' : '';
    document.getElementById('btn-assess-submit').classList.toggle('hidden', i !== qs.length - 1);
    document.getElementById('assess-progress').textContent = `${i + 1}/${qs.length}`;
  },

  selectAssessmentOption(optionIndex) {
    this.state.assessmentAnswers[this.state.assessmentIndex] = optionIndex;
    this.renderAssessmentQuestion();
  },

  assessPrev() {
    if (this.state.assessmentIndex > 0) {
      this.state.assessmentIndex--;
      this.renderAssessmentQuestion();
    }
  },

  assessNext() {
    const qs = ContentData.assessmentQuestions;
    if (this.state.assessmentAnswers[this.state.assessmentIndex] === undefined) return; // 需要选择
    if (this.state.assessmentIndex < qs.length - 1) {
      this.state.assessmentIndex++;
      this.renderAssessmentQuestion();
    }
  },

  assessSubmit() {
    const qs = ContentData.assessmentQuestions;
    const answers = this.state.assessmentAnswers;

    // 计算诊断结果
    const weakAreas = {};
    for (let i = 0; i < answers.length; i++) {
      const opt = qs[i].options[answers[i]];
      for (const area of (opt.weakAreas || [])) {
        weakAreas[area] = (weakAreas[area] || 0) + 1;
      }
    }

    // 生成洞察
    const topWeak = Object.entries(weakAreas).sort((a, b) => b[1] - a[1])[0];
    if (topWeak) {
      const insights = Storage.getInsights();
      insights.push({
        id: 'assess_' + Date.now(),
        domainId: '综合',
        type: 'weak_signal',
        signal: '评估显性指标',
        confidence: 0.85,
        suggestion: `根据评估结果，"${topWeak[0]}"是你目前最需要关注的成长方向。建议在领域管理中添加相关领域，每日通过卡片逐步练习。`,
        generatedAt: new Date().toISOString(),
        read: false,
      });
      Storage.saveInsights(insights);
    }

    const assessment = {
      id: 'assmt_' + Date.now(),
      answers,
      weakAreas,
      createdAt: new Date().toISOString(),
    };
    const allAssessments = Storage.getAssessments();
    allAssessments.push(assessment);
    Storage.saveAssessments(allAssessments);

    alert('评估完成！系统已根据你的回答更新了成长建议，前往"领域"页面查看。');
    this.navigate('domains');
  },

  /* ==================== 档案页 ==================== */
  renderProfile() {
    const answers = Storage.getAnswers();
    const domains = Storage.getDomains() || [];

    // 统计
    document.getElementById('stat-total').textContent = answers.length;

    const uniqueDomains = new Set(answers.map(a => a.domainId));
    document.getElementById('stat-domains').textContent = uniqueDomains.size;

    // 连续天数
    const dates = new Set(answers.map(a => a.createdAt.split('T')[0]));
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (dates.has(d.toISOString().split('T')[0])) streak++;
      else if (i > 0) break;
    }
    document.getElementById('stat-streak').textContent = streak;

    // 领域筛选
    const filterSelect = document.getElementById('filter-domain');
    filterSelect.innerHTML = '<option value="all">全部领域</option>' +
      domains.map(d => `<option value="${d.id}">${d.icon} ${d.name}</option>`).join('');

    this.renderAnswers();
    this.renderAssessments();
  },

  renderAssessments() {
    const assessments = Storage.getAssessments().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const container = document.getElementById('assess-history-list');
    if (!assessments.length) {
      container.innerHTML = '<p class="insight-empty">暂无评估记录</p>';
      return;
    }
    container.innerHTML = assessments.slice(0, 10).map(a => {
      const d = new Date(a.createdAt);
      const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      const weakEntries = Object.entries(a.weakAreas || {}).sort((x, y) => y[1] - x[1]).slice(0, 3);
      const tagsHtml = weakEntries.length > 0
        ? weakEntries.map(([area, score]) => `<span class="assess-history-tag ${score >= 2 ? 'weak' : ''}">${area}(${score})</span>`).join('')
        : '<span class="assess-history-tag">无明显短板</span>';
      return `<div class="assess-history-item" onclick="App.viewAssessmentDetail('${a.id}')">
        <div class="assess-history-date">📊 ${dateStr} · 共${a.answers ? a.answers.length : '?'}题</div>
        <div class="assess-history-tags">${tagsHtml}</div>
      </div>`;
    }).join('');
  },

  viewAssessmentDetail(id) {
    const assessments = Storage.getAssessments();
    const a = assessments.find(x => x.id === id);
    if (!a) return;
    const d = new Date(a.createdAt);
    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const weakEntries = Object.entries(a.weakAreas || {}).sort((x, y) => y[1] - x[1]);
    const bodyHtml = weakEntries.length > 0
      ? weakEntries.map(([area, score]) => `<p style="margin-bottom:6px"><strong>${area}</strong>：得分 ${score}（越高越需关注）</p>`).join('')
      : '<p>本次评估未发现明显短板。</p>';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-card" style="max-height:70vh;overflow-y:auto;border-radius:var(--radius);">
      <h3>📊 评估详情</h3>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:14px">${dateStr} · 共${a.answers ? a.answers.length : '?'}题</p>
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px;font-size:14px;line-height:1.8">${bodyHtml}</div>
      <div class="modal-actions"><button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">关闭</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  renderAnswers() {
    const filterDomain = document.getElementById('filter-domain').value;
    let answers = Storage.getAnswers().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filterDomain !== 'all') {
      answers = answers.filter(a => a.domainId === filterDomain);
    }

    const container = document.getElementById('answer-list');
    if (!answers.length) {
      container.innerHTML = '<p style="color:var(--text-light);font-size:14px;text-align:center;padding:20px">暂无记录</p>';
      return;
    }

    container.innerHTML = answers.map(a => {
      const d = new Date(a.createdAt);
      const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      return `<div class="answer-item" onclick="App.viewAnswerDetail('${a.id}')">
        <div class="answer-item-meta">
          <span>${dateStr} · ${this.getDomainName(a.domainId)} · ${this.getModuleName(a.domainId, a.moduleId)} · Day ${a.cardDay}</span>
          <span>${a.actionDone ? '✅' : '○'}</span>
        </div>
        <div class="answer-item-preview">${this.escapeHtml(a.content)}</div>
      </div>`;
    }).join('');
  },

  viewAnswerDetail(answerId) {
    const answers = Storage.getAnswers();
    const a = answers.find(ans => ans.id === answerId);
    if (!a) return;

    const d = new Date(a.createdAt);
    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

    // 用弹窗展示
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-card" style="max-height:70vh;overflow-y:auto;border-radius:var(--radius);">
      <h3>📝 历史反思</h3>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">
        ${dateStr} · ${this.getDomainName(a.domainId)} · Day ${a.cardDay}
      </p>
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:16px;font-size:14px;line-height:1.9;white-space:pre-wrap;margin-bottom:12px">${this.escapeHtml(a.content)}</div>
      <p style="font-size:13px;color:var(--text-secondary)">今日行动：${a.actionDone ? '✅ 已完成' : '○ 未完成'}</p>
      <div class="modal-actions"><button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">关闭</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  /* ==================== 数据管理 ==================== */
  exportData() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'growth-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Storage.importAll(data);
        alert('备份已导入！');
        this.init();
        this.navigate('home');
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  },

  confirmReset() {
    document.getElementById('modal-reset').classList.remove('hidden');
  },

  hideReset() {
    document.getElementById('modal-reset').classList.add('hidden');
  },

  resetData() {
    Storage.clearAll();
    this.hideReset();
    this.init();
    this.navigate('home');
    alert('所有数据已清除');
  },

  /* ==================== 工具 ==================== */
  navigatePageOnly(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
    this.state.currentPage = page;
  },

  hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  },

  getDomainName(domainId) {
    const domains = Storage.getDomains() || [];
    const found = domains.find(d => d.id === domainId);
    return found ? found.name : domainId;
  },

  getModuleName(domainId, moduleId) {
    const domains = Storage.getDomains() || [];
    const domain = domains.find(d => d.id === domainId);
    if (!domain) return moduleId;
    const mod = domain.modules.find(m => m.id === moduleId);
    return mod ? mod.name : moduleId;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

/* ---- 启动 ---- */
document.addEventListener('DOMContentLoaded', () => App.init());
