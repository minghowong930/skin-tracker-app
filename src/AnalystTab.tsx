import { useState, type ReactNode } from 'react'
import { supabase } from './lib/supabaseClient'

export default function AnalystTab() {
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [analystReport, setAnalystReport] = useState<string | null>(null)

  const formatReport = (text: string) => {
    if (!text) return null;
    
    const lines = text.split('\n');
    const elements: ReactNode[] = [];
    let keyCounter = 0;

    lines.forEach((line) => {
      // Main section headers (###)
      if (line.startsWith('### ')) {
        const title = line.replace('### ', '').trim();
        
        elements.push(
          <div key={keyCounter++} className="flex items-center gap-2 mt-8 mb-4 pb-2 border-b-2 border-apple-blue/20">
            <h3 className="text-xl font-bold text-apple-blue">{title}</h3>
          </div>
        );
        return;
      }

      // Habit items (like "- **跑步 (Run)**:" or "• **充足飲水**")
      if ((line.trim().startsWith('- **') || line.trim().startsWith('• **')) && 
          (line.includes('**:') || line.match(/\*\*[:：]/))) {
        const cleanLine = line.trim().replace(/^- \*\*|• \*\*/g, '').replace(/\*\*/g, '');
        const match = cleanLine.match(/^(.+?)[:：]\s*(.*)$/);
        
        if (match) {
          const [_, habitName, description] = match;
          elements.push(
            <div key={keyCounter++} className="mb-4">
              <div className="flex items-start gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-apple-blue mt-2 flex-shrink-0"></div>
                <h4 className="font-bold text-apple-text text-base leading-tight">{habitName}</h4>
              </div>
              {description && (
                <p className="text-sm text-apple-gray leading-relaxed ml-4 mb-3">
                  {description.split('**').map((part, i) => 
                    i % 2 === 1 ? <strong key={i} className="text-apple-text">{part}</strong> : part
                  )}
                </p>
              )}
            </div>
          );
        }
        return;
      }

      // Sub-items: Evidence and Time-lag (like "- 證據：" or "- 時間延遲：")
      if (line.trim().startsWith('- ') && (line.includes('證據') || line.includes('時間延遲'))) {
        const cleanLine = line.trim().replace(/^- /, '');
        const [label, ...contentParts] = cleanLine.split('：');
        const content = contentParts.join('：');
        
        elements.push(
          <div key={keyCounter++} className="ml-4 mb-3 pl-4 border-l-2 border-gray-200">
            <p className="text-xs font-semibold text-apple-blue mb-1">{label}</p>
            <p className="text-sm text-apple-gray/80 leading-relaxed">
              {content.split('**').map((part, i) => 
                i % 2 === 1 ? <strong key={i} className="text-apple-text">{part}</strong> : part
              )}
            </p>
          </div>
        );
        return;
      }

      // Empty lines
      if (line.trim() === '') {
        elements.push(<div key={keyCounter++} className="h-2"></div>);
        return;
      }

      // Regular paragraphs (fallback)
      elements.push(
        <p key={keyCounter++} className="text-sm text-apple-gray leading-relaxed mb-2 ml-4">
          {line.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i} className="font-semibold text-apple-text">{part}</strong> : part
          )}
        </p>
      );
    });

    return <div className="px-2">{elements}</div>;
  };

  const generateReport = async () => {
    setIsGeneratingReport(true)
    setAnalystReport(null)
    try {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      // 1. 獲取原始數據 (加入睡眠數據以供 AI 交叉比對)
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('log_date, am_subjective_score, pm_subjective_score, sleep_hours, sleep_quality')
        .gte('log_date', twoWeeksAgo)
        .order('log_date', { ascending: true })

      const { data: habits } = await supabase
        .from('habit_events')
        .select('event_date, tag_name')
        .gte('event_date', twoWeeksAgo)

      if (!logs || logs.length === 0) {
        setAnalystReport('數據不足，請先記錄幾天的皮膚與習慣。')
        setIsGeneratingReport(false)
        return
      }

      // 2. 數學模型：計算時間滯後效應 (Time-Lag Impact)
      const uniqueTags = Array.from(new Set(habits?.map(h => h.tag_name) || []))
      const lagDays = [1, 2, 3]
      const insights: string[] = []

      uniqueTags.forEach(tag => {
        lagDays.forEach(lag => {
          let scoresWithTag: number[] = []
          let scoresWithoutTag: number[] = []

          logs.forEach(log => {
            const [year, month, day] = log.log_date.split('-').map(Number);
            const targetDate = new Date(year, month - 1, day - lag);
            const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

            const am = log.am_subjective_score || 0
            const pm = log.pm_subjective_score || 0
            const validScores = [am, pm].filter(s => s > 0)
            const actualAvg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0

            const hadTag = habits?.some(h => h.event_date === targetDateStr && h.tag_name === tag)

            if (actualAvg > 0) {
              if (hadTag) scoresWithTag.push(actualAvg)
              else scoresWithoutTag.push(actualAvg)
            }
          })

          if (scoresWithTag.length > 0 && scoresWithoutTag.length > 0) {
            const avgWith = scoresWithTag.reduce((a, b) => a + b, 0) / scoresWithTag.length
            const avgWithout = scoresWithoutTag.reduce((a, b) => a + b, 0) / scoresWithoutTag.length
            const impact = avgWith - avgWithout

            if (Math.abs(impact) > 0.8) {
              const direction = impact > 0 ? '改善因素' : '惡化因素'
              insights.push(`- **${tag} (T-${lag})**: ${direction}。當 ${lag} 天前有 "${tag}" 時，今日平均皮膚分數為 ${avgWith.toFixed(1)}；沒有時為 ${avgWithout.toFixed(1)}。數學影響值: ${impact > 0 ? '+' : ''}${impact.toFixed(1)} 分。`)
            }
          }
        })
      })

      const mathSummary = insights.length > 0 
        ? insights.join('\n') 
        : '目前數據中尚未發現顯著的數學滯後效應 (Impact > 0.8)。'

      // 3. 重構每日時間線 (讓 AI 更容易看懂組合與累積效應)
      const timeline = logs.map(log => {
        const date = log.log_date
        const dayHabits = habits?.filter(h => h.event_date === date).map(h => h.tag_name) || []
        const habitsStr = dayHabits.length > 0 ? dayHabits.join(', ') : '無'
        return `${date}: 習慣 [${habitsStr}] | 睡眠 ${log.sleep_hours}h (品質 ${log.sleep_quality}) | 分數: AM ${log.am_subjective_score || '-'}, PM ${log.pm_subjective_score || '-'}`
      }).join('\n')

      // 4. 頂級 System Prompt (雙軌融合：數學鐵證 + AI 洞察)
      const prompt = `你是一位頂尖的皮膚數據分析師。你的任務是基於提供的 14 天「每日時間線」與預先計算的「數學顯著差異」，提煉出最具價值的「證據信號」。

【分析原則】
1. 絕對不要解釋醫學理論（不要解釋什麼是糖化、發炎、組胺）。我們不需要科普，只需要數據證據。
2. 語氣必須極度簡潔、專業、客觀。
3. 區分「單一因素」與「複雜組合/累積因素」。
4. 警惕小樣本偏差，若某組合只出現 1 次，請標註為「初步觀察」。

【分析步驟】
1. 檢視提供的「數學鐵證」，確認單一習慣的延遲效應。
2. 掃描「每日時間線」，尋找「組合效應」（例如 A+B 同時發生時分數劇烈變化）與「累積效應」（連續多天出現同一習慣導致崩盤）。
3. 交叉比對睡眠數據，觀察睡眠是否放大了某個習慣的影響。

【輸出格式要求 (嚴格遵守)】
請使用繁體中文，並嚴格按照以下 Markdown 結構輸出，不要有任何前言或結語：

### 📊 14天數據總覽
(簡述平均分數與波動區間)

### ✅ 改善因素
- **[數學鐵證] [習慣名稱] (T-X)**：(簡述數據對比，例如：有該習慣的隔天平均分數為 Y，無則為 Z)
- **[AI 洞察] [組合/累積模式名稱]**：(描述你發現的複雜模式，並標註觀察天數)

### ❌ 惡化因素
- **[數學鐵證] [習慣名稱] (T-X)**：(簡述數據對比)
- **[AI 洞察] [組合/累積模式名稱]**：(描述你發現的複雜模式，並標註觀察天數)

### 💡 行動結論
1. **[行動標題]**：(基於證據的具體建議，不帶廢話)
2. **[行動標題]**：(基於證據的具體建議，不帶廢話)

---
【數學鐵證 (JS 預計算)】
${mathSummary}

【每日時間線 (Daily Timeline)】
${timeline}`

      // 5. 呼叫 DeepSeek (V4 Pro 自動路由)
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat', 
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      })

      if (response.ok) {
        const data = await response.json()
        const reportText = data.choices?.[0]?.message?.content || 'No insights generated.'
        setAnalystReport(reportText)
      } else {
        setAnalystReport('Failed to generate report. Please check your API key.')
      }
    } catch (error) {
      console.error('Report generation failed:', error)
      setAnalystReport('An error occurred while generating the report.')
    } finally {
      setIsGeneratingReport(false)
    }
  }

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Skin Analyst</h1>
      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <p className="text-apple-gray text-sm mb-4">Analyze your past 14 days of habits and skin scores to discover hidden triggers and time-lag effects.</p>
        <button 
          onClick={generateReport}
          disabled={isGeneratingReport}
          className="w-full bg-gray-800 text-white py-3 rounded-apple font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isGeneratingReport ? 'Analyzing Data...' : 'Generate 14-Day Insight Report'}
        </button>
      </div>

      {analystReport && (
        <div className="bg-white rounded-apple shadow-apple p-6">
          {formatReport(analystReport)}
        </div>
      )}
    </div>
  )
}