import { useState, useEffect, type ReactNode } from 'react'
import { supabase } from './lib/supabaseClient'
import imageCompression from 'browser-image-compression'

function App() {
  const [activeTab, setActiveTab] = useState<'record' | 'review' | 'analyst'>('record')  
  // --- Record Tab States ---
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM')
  
  const [skinScore, setSkinScore] = useState(5)
  const [sleepTime, setSleepTime] = useState('23:00')
  const [sleepHours, setSleepHours] = useState(7)
  const [sleepQuality, setSleepQuality] = useState(3)
  const [isPeriod, setIsPeriod] = useState(false)
  
  const baseTags = ['Drink Enough', 'Drink not enough', 'Run', 'Gym', 'Dessert', 'Mask', 'Supplement', 'Seafood', 'Eggs']
  const [allTags, setAllTags] = useState<string[]>(baseTags)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // --- Analyst Tab States ---
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [analystReport, setAnalystReport] = useState<string | null>(null)

  // --- Review Tab States ---
  const [pendingItems, setPendingItems] = useState<any[]>([])
  const [isLoadingPending, setIsLoadingPending] = useState(false)
  const [reviewSelectedTags, setReviewSelectedTags] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const fetchCustomTags = async () => {
      const { data } = await supabase.from('user_custom_tags').select('tag_name')
      if (data) {
        const tags = data.map(item => item.tag_name)
        setAllTags([...baseTags, ...tags])
      }
    }
    fetchCustomTags()
  }, [])

  useEffect(() => {
    if (activeTab === 'review') {
      fetchPendingItems()
    }
  }, [activeTab])

  const fetchPendingItems = async () => {
    setIsLoadingPending(true)
    const { data } = await supabase
      .from('pending_analysis')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (data) {
      setPendingItems(data)
      const initialSelected: Record<string, string[]> = {}
      data.forEach(item => {
        initialSelected[item.id] = [] // Start with empty selected tags for manual picking
      })
      setReviewSelectedTags(initialSelected)
    }
    setIsLoadingPending(false)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const toggleReviewTag = (itemId: string, tag: string) => {
    setReviewSelectedTags(prev => {
      const current = prev[itemId] || []
      const updated = current.includes(tag) 
        ? current.filter(t => t !== tag) 
        : [...current, tag]
      return { ...prev, [itemId]: updated }
    })
  }

  const addCustomTag = async (overrideText?: string) => {
    const tagText = (overrideText !== undefined ? overrideText : newTag).trim()
    if (!tagText) return null
    const { error } = await supabase.from('user_custom_tags').insert({ tag_name: tagText })
    if (!error) {
      setAllTags(prev => [...prev, tagText])
      setNewTag('')
      return tagText // 回傳新增的標籤，讓 Review 頁面可以自動勾選
    } else {
      alert('新增失敗（可能已存在相同標籤）')
      return null
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    
    if (file) {
      setIsProcessingPhoto(true)
      setPhotoPreview(URL.createObjectURL(file))
      
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          fileType: 'image/jpeg'
        }
        const compressedFile = await imageCompression(file, options)
        setPhotoFile(compressedFile)
      } catch (error) {
        console.log('壓縮失敗，使用原圖:', error)
        setPhotoFile(file)
      } finally {
        setIsProcessingPhoto(false)
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    const scoreColumn = period === 'AM' ? 'am_subjective_score' : 'pm_subjective_score'
    const photoColumn = period === 'AM' ? 'am_photo_url' : 'pm_photo_url'
    
    let photoUrl = null

    if (photoFile) {
      const fileName = `${selectedDate}_${period}_${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('skin-photos')
        .upload(fileName, photoFile, {
          contentType: 'image/jpeg',
          upsert: true 
        })

      if (uploadError) {
        alert('照片上傳失敗: ' + uploadError.message)
        setIsSaving(false)
        return
      }
      
      const { data: urlData } = supabase.storage.from('skin-photos').getPublicUrl(fileName)
      photoUrl = urlData.publicUrl

      // Save to pending_analysis for visual diary & later review
      await supabase.from('pending_analysis').insert({
        log_date: selectedDate,
        period: period,
        photo_url: photoUrl,
        ai_suggestions: [], // No AI, empty array
        status: 'pending'
      })
    }
    
    const { error } = await supabase
      .from('daily_logs')
      .upsert({
        log_date: selectedDate,
        [scoreColumn]: skinScore,
        [photoColumn]: photoUrl,
        sleep_hours: sleepHours,
        sleep_quality: sleepQuality,
        is_period_day: isPeriod
      })

    if (error) {
      alert('儲存失敗: ' + error.message)
      setIsSaving(false)
      return
    }

    if (selectedTags.length > 0) {
      const habitData = selectedTags.map(tag => ({
        event_date: selectedDate,
        tag_name: tag,
        category: 'lifestyle',
        source: 'manual'
      }))
      
      const { error: habitError } = await supabase.from('habit_events').insert(habitData)
      if (habitError) {
        alert('標籤儲存失敗: ' + habitError.message)
        setIsSaving(false)
        return
      }
    }

    setIsSaving(false)
    alert('儲存成功！')
    setSelectedTags([])
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const approvePendingItem = async (item: any) => {
    const tagsToSave = reviewSelectedTags[item.id] || []
    
    if (tagsToSave.length > 0) {
      const habitData = tagsToSave.map((tag: string) => ({
        event_date: item.log_date,
        tag_name: tag,
        category: 'lifestyle',
        source: 'manual_review'
      }))
      const { error } = await supabase.from('habit_events').insert(habitData)
      if (error) {
        alert('儲存標籤失敗: ' + error.message)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('pending_analysis')
      .update({ status: 'completed' })
      .eq('id', item.id)
      
    if (updateError) {
      alert('更新狀態失敗: ' + updateError.message)
      return
    }

    setPendingItems(prev => prev.filter(p => p.id !== item.id))
    alert('標籤已成功存入資料庫！')
  }

    // 告訴 TypeScript 這是 React JSX 元素
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
    <div className="min-h-screen bg-apple-bg pb-24">
      <div className="sticky top-0 bg-apple-bg/80 backdrop-blur-md z-10 px-6 pt-6 pb-4">
        <div className="max-w-md mx-auto flex bg-gray-200/50 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('record')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'record' ? 'bg-white shadow-sm text-apple-text' : 'text-apple-gray'}`}
          >
            Record
          </button>
          <button 
            onClick={() => setActiveTab('review')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all relative ${activeTab === 'review' ? 'bg-white shadow-sm text-apple-text' : 'text-apple-gray'}`}
          >
            Review
            {pendingItems.length > 0 && activeTab !== 'review' && (
              <span className="absolute top-1 right-4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('analyst')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'analyst' ? 'bg-white shadow-sm text-apple-text' : 'text-apple-gray'}`}
          >
            Analyst
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-4">
        {activeTab === 'record' ? (
          <>
            <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Skin Tracker</h1>
            
            <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
              <label className="block text-apple-gray text-sm font-medium mb-2">Date</label>
              <input 
                type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} max={today}
                className="w-full p-3 border border-gray-200 rounded-apple text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-blue transition-all text-lg"
              />
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
              <label className="block text-apple-gray text-sm font-medium mb-4">Session</label>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setPeriod('AM')} className={`py-4 rounded-apple font-medium transition-all ${period === 'AM' ? 'bg-apple-blue text-white shadow-md' : 'bg-gray-100 text-apple-gray hover:bg-gray-200'}`}>☀️ AM</button>
                <button onClick={() => setPeriod('PM')} className={`py-4 rounded-apple font-medium transition-all ${period === 'PM' ? 'bg-apple-blue text-white shadow-md' : 'bg-gray-100 text-apple-gray hover:bg-gray-200'}`}>🌙 PM</button>
              </div>
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <label className="text-apple-gray text-sm font-medium">Skin Score</label>
                <span className="text-2xl font-semibold text-apple-blue">{skinScore}</span>
              </div>
              <input type="range" min="1" max="10" value={skinScore} onChange={(e) => setSkinScore(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue" />
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6 space-y-4">
              <label className="block text-apple-gray text-sm font-medium">Sleep (Previous Night)</label>
              <div className="flex justify-between items-center">
                <span className="text-apple-text">Bedtime</span>
                <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="p-2 border border-gray-200 rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-blue" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-apple-text">Hours</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSleepHours(Math.max(0, sleepHours - 0.5))} className="w-8 h-8 rounded-full bg-gray-100 text-apple-gray font-bold">-</button>
                  <span className="text-xl font-semibold w-8 text-center">{sleepHours}</span>
                  <button onClick={() => setSleepHours(Math.min(12, sleepHours + 0.5))} className="w-8 h-8 rounded-full bg-gray-100 text-apple-gray font-bold">+</button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-apple-text">Quality</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setSleepQuality(star)} className={`text-2xl ${star <= sleepQuality ? 'text-yellow-400' : 'text-gray-300'}`}>★</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6 flex justify-between items-center">
              <span className="text-apple-text font-medium">On Period</span>
              <button onClick={() => setIsPeriod(!isPeriod)} className={`w-12 h-6 rounded-full transition-colors ${isPeriod ? 'bg-apple-blue' : 'bg-gray-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${isPeriod ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
              <label className="block text-apple-gray text-sm font-medium mb-4">Photo</label>
              <div className="flex flex-col items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" />
                ) : (
                  <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center text-apple-gray text-3xl">📷</div>
                )}
                <label className="px-4 py-2 bg-gray-100 text-apple-text rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200 transition-colors">
                  {photoFile ? 'Change Photo' : 'Take / Upload Photo'}
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                </label>
              </div>
            </div>

            <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
              <label className="block text-apple-gray text-sm font-medium mb-4">Habit Tags</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedTags.includes(tag) ? 'bg-apple-blue text-white' : 'bg-gray-100 text-apple-gray hover:bg-gray-200'}`}>
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add new habit..." className="flex-1 p-2 border border-gray-200 rounded-lg text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-blue text-sm" />
                <button onClick={() => addCustomTag()} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:opacity-90">+ Add</button>              </div>
            </div>

            <button 
              onClick={handleSave}
              disabled={isSaving || isProcessingPhoto}
              className="w-full bg-apple-blue text-white py-4 rounded-apple font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : (isProcessingPhoto ? 'Processing Photo...' : 'Save Record')}
            </button>
          </>
        ) : activeTab === 'review' ? (
          <>
            <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Visual Diary</h1>
            {isLoadingPending ? (
              <p className="text-center text-apple-gray">Loading...</p>
            ) : pendingItems.length === 0 ? (
              <div className="bg-white rounded-apple shadow-apple p-12 text-center">
                <p className="text-apple-gray text-lg">All caught up! 🎉</p>
                <p className="text-apple-gray text-sm mt-2">No pending photos to review.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingItems.map(item => (
                  <div key={item.id} className="bg-white rounded-apple shadow-apple p-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-apple-text font-semibold">{item.log_date}</span>
                      <span className="text-apple-gray text-sm">{item.period}</span>
                    </div>
                    <img src={item.photo_url} alt="Pending" className="w-full h-48 object-cover rounded-lg mb-4 border border-gray-100" />
                    
                    <label className="block text-apple-gray text-xs font-medium mb-2 uppercase tracking-wider">Quick Tags (Tap to select)</label>
                    <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto">
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleReviewTag(item.id, tag)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            (reviewSelectedTags[item.id] || []).includes(tag)
                              ? 'bg-apple-blue text-white'
                              : 'bg-gray-100 text-apple-gray hover:bg-gray-200'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    
                    <div className="flex gap-2 mb-4">
                      <input 
                        type="text" 
                        placeholder="Add new tag & apply..." 
                        className="flex-1 p-2 border border-gray-200 rounded-lg text-apple-text focus:outline-none focus:ring-1 focus:ring-apple-blue text-sm"
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            if (input.value.trim()) {
                              const addedTag = await addCustomTag(input.value.trim());
                              if (addedTag) {
                                toggleReviewTag(item.id, addedTag); // 自動勾選新標籤
                              }
                              input.value = '';
                            }
                          }
                        }}
                      />
                    </div>

                    <label className="block text-apple-gray text-xs font-medium mb-2 uppercase tracking-wider">Selected for this photo</label>
                    <div className="flex flex-wrap gap-2 mb-6 min-h-[32px] bg-gray-50 p-2 rounded-lg">
                       {(reviewSelectedTags[item.id] || []).length > 0 ? (
                          (reviewSelectedTags[item.id] || []).map(tag => (
                            <span key={tag} className="px-3 py-1 rounded-full text-sm font-medium bg-apple-blue text-white flex items-center gap-1">
                              {tag}
                              <button onClick={() => toggleReviewTag(item.id, tag)} className="text-white/80 hover:text-white font-bold ml-1">×</button>
                            </span>
                          ))
                       ) : (
                          <span className="text-apple-gray text-sm italic p-1">No tags selected yet.</span>
                       )}
                    </div>

                    <button 
                      onClick={() => approvePendingItem(item)}
                      className="w-full bg-gray-800 text-white py-3 rounded-apple font-medium hover:opacity-90 transition-opacity"
                    >
                      Approve & Save Tags
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

export default App