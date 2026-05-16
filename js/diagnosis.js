/* diagnosis.js — 隐性诊断引擎

   三条信号线索：
   1. 回答深度 — 某领域回答明显短于其他领域
   2. 语言模式 — 不确定性词、回避句式、求助信号
   3. 行动完成率 — 连续跳过今日行动
*/

const Diagnosis = {

  /* 不确定性/回避关键词 */
  uncertainPatterns: [
    '不太懂', '说不好', '不知道', '可能吧', '没想过', '没遇到过',
    '一窍不通', '不了解', '说不上来', '想不出来', '很难说', '太复杂了',
    '没时间想', '以后再想', '这个问题奇怪', '和我没什么关系',
    '没必要学', '不会', '完全不懂', '一头雾水', '搞不清楚'
  ],

  avoidancePatterns: [
    '今天没什么', '没有特别', '还好吧', '就那样', '差不多',
    '没什么可说的', '跳过', '今天没心情', '不想写'
  ],

  /* ---- 入口：每次提交回答后调用 ---- */
  run(domainId, answerText, actionDone) {
    const answers = Storage.getAnswers();
    const insights = Storage.getInsights();
    const signals = [];

    // 信号1：回答深度
    const depthSignal = this.checkDepth(domainId, answerText, answers);
    if (depthSignal) signals.push(depthSignal);

    // 信号2：语言模式
    const langSignal = this.checkLanguage(domainId, answerText);
    if (langSignal) signals.push(langSignal);

    // 信号3：行动跳过
    const skipSignal = this.checkActionSkip(domainId, actionDone, answers);
    if (skipSignal) signals.push(skipSignal);

    // 只有同一领域累积 ≥3 个同类信号才生成一条洞察
    const aggregated = this.aggregate(domainId, signals, insights);
    if (aggregated) {
      insights.push(aggregated);
      Storage.saveInsights(insights);
    }

    return { signals, newInsight: aggregated };
  },

  /* ---- 信号1：回答深度 ---- */
  checkDepth(domainId, currentText, allAnswers) {
    const currentLen = currentText.length;

    // 对比：用户自己在其他领域的平均回答长度
    const otherDomainAnswers = allAnswers.filter(a => a.domainId !== domainId);
    if (otherDomainAnswers.length < 2) return null; // 需要足够的数据

    const otherAvg = otherDomainAnswers.reduce((s, a) => s + a.content.length, 0) / otherDomainAnswers.length;
    if (otherAvg < 30) return null; // 其他领域回答也太短，无法对比

    const ratio = currentLen / otherAvg;

    if (ratio < 0.4) {
      return { type: 'shallow', strength: Math.min(0.9, (1 - ratio)), detail: `回答长度仅为其他领域的${Math.round(ratio * 100)}%` };
    }
    return null;
  },

  /* ---- 信号2：语言模式 ---- */
  checkLanguage(domainId, text) {
    let uncertainCount = 0;
    let avoidanceCount = 0;

    for (const p of this.uncertainPatterns) {
      if (text.includes(p)) uncertainCount++;
    }
    for (const p of this.avoidancePatterns) {
      if (text.includes(p)) avoidanceCount++;
    }

    const totalHits = uncertainCount + avoidanceCount;
    if (totalHits === 0) return null;

    const strength = Math.min(0.9, totalHits * 0.25);
    const detailParts = [];
    if (uncertainCount > 0) detailParts.push(`${uncertainCount}次不确定表达`);
    if (avoidanceCount > 0) detailParts.push(`${avoidanceCount}次回避信号`);

    return { type: 'low_confidence', strength, detail: detailParts.join('，') };
  },

  /* ---- 信号3：行动跳过 ---- */
  checkActionSkip(domainId, actionDone, allAnswers) {
    if (actionDone) return null;

    const domainAnswers = allAnswers.filter(a => a.domainId === domainId);
    if (domainAnswers.length < 2) return null;

    // 统计最近5次中的跳过次数
    const recent = domainAnswers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    let skipCount = 0;
    for (const a of recent) {
      if (!a.actionDone) skipCount++;
    }

    if (skipCount >= 3) {
      return { type: 'avoidance', strength: Math.min(0.9, skipCount * 0.25), detail: `最近5天中有${skipCount}次未完成行动` };
    }
    return null;
  },

  /* ---- 信号聚合 ---- */
  aggregate(domainId, newSignals, existingInsights) {
    // 统计当前领域的所有未读信号（包括历史）
    const allForDomain = existingInsights.filter(i => i.domainId === domainId && !i.read);
    const totalStrength = allForDomain.reduce((s, i) => s + i.strength, 0) +
      newSignals.reduce((s, sig) => s + sig.strength, 0);

    // 阈值：总强度 > 0.8 才生成洞察（保守策略）
    if (totalStrength < 0.8) return null;

    // 避免短期内重复生成同一领域的洞察
    const recentExisting = existingInsights.filter(
      i => i.domainId === domainId && Date.now() - new Date(i.generatedAt).getTime() < 7 * 24 * 3600 * 1000
    );
    if (recentExisting.length >= 1) return null;

    // 生成洞察
    const domain = this.getDomainName(domainId);
    const signalTypes = new Set(newSignals.map(s => s.type));
    let suggestion = '';

    if (signalTypes.has('low_confidence') && signalTypes.has('shallow')) {
      suggestion = `在${domain}方面，你的回答中出现了较多不确定表达，且回答篇幅较短。这个领域可能需要更多关注和时间投入。`;
    } else if (signalTypes.has('avoidance')) {
      suggestion = `你最近在${domain}领域多次跳过了行动挑战。也许可以试试把行动拆得更小一点——一个微小的行动比一个完美的计划更有价值。`;
    } else if (signalTypes.has('shallow')) {
      suggestion = `你在${domain}领域的回答篇幅相对较短。不一定是你不懂，也许你需要更多时间或不同角度的问题来激发思考。`;
    } else if (signalTypes.has('low_confidence')) {
      suggestion = `你的回答中出现了一些不确定的表达。在${domain}方面，你可能需要更系统的知识来建立自信。`;
    }

    if (!suggestion) return null;

    return {
      id: 'insight_' + Date.now(),
      domainId,
      type: signalTypes.has('low_confidence') || signalTypes.has('shallow') ? 'weak_signal' : 'growth',
      signal: newSignals.map(s => s.detail).join('；'),
      confidence: Math.round(totalStrength * 100) / 100,
      suggestion,
      generatedAt: new Date().toISOString(),
      read: false
    };
  },

  /* ---- 工具 ---- */
  getDomainName(domainId) {
    const domains = Storage.getDomains();
    if (!domains) return '该领域';
    const found = domains.find(d => d.id === domainId);
    return found ? found.name : '该领域';
  }
};
