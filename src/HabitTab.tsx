import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'

export default function HabitTab() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  
  const [sleepHours, setSleepHours] = useState(7)
  const [sleepQuality, setSleepQuality] = useState(3)
  
  const baseTags = ['Drink Enough', 'Drink not enough', 'Run', 'Gym', 'Dessert', 'Mask', 'Supplement', 'Seafood', 'Eggs']
  const [allTags, setAllTags] = useState<string[]>(baseTags)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(false) // 防止回填時的誤觸

  // 載入自訂標籤
  useEffect(() => {
    const fetchCustomTags = async () => {
      const { data } = await supabase.from('user_custom_tags').select('tag_name')
      if (data) setAllTags([...baseTags, ...data.map(item => item.tag_name)])
    }
    fetchCustomTags()
  }, [])

  // CTO 核心防護：當日期改變時，自動回填 (Pre-fill) 該日的睡眠與標籤數據
  useEffect(() => {
    const fetchDateData = async () => {
      setIsLoadingData(true)
      
      // 1. 撈取該日已有的標籤
      const { data: habits } = await supabase
        .from('habit_events')
        .select('tag_name')
        .eq('event_date', selectedDate)
      
      if (habits && habits.length > 0) {
        setSelectedTags(habits.map(h => h.tag_name))
      } else {
        setSelectedTags([])
      }

      // 2. 撈取該日已有的睡眠數據
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('sleep_hours, sleep_quality')
        .eq('log_date', selectedDate)
        .single()
      
      if (logs) {
        if (logs.sleep_hours) setSleepHours(logs.sleep_hours)
        if (logs.sleep_quality) setSleepQuality(logs.sleep_quality)
      } else {
        // 如果該日還沒有任何紀錄，重置為預設值
        setSleepHours(7)
        setSleepQuality(3)
      }
      
      setIsLoadingData(false)
    }
    
    fetchDateData()
  }, [selectedDate])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  
  const addCustomTag = async () => {
    if (!newTag.trim()) return
    const tagText = newTag.trim()
    const { error } = await supabase.from('user_custom_tags').insert({ tag_name: tagText })
    if (!error) { 
      setAllTags(prev => [...prev, tagText])
      setNewTag('')
      // 新增後自動幫她勾選
      setSelectedTags(prev => [...prev, tagText])
    } else {
      alert('新增失敗（可能已存在）')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    
    // 1. 寫入/更新睡眠數據 (確保不覆蓋 Skin Tab 的分數)
    const { error: logError } = await supabase.from('daily_logs').upsert({
      log_date: selectedDate, 
      sleep_hours: sleepHours, 
      sleep_quality: sleepQuality
    }, { onConflict: 'log_date' }) // 補上衝突鍵，確保完美合併
    
    if (logError) { 
      alert('睡眠儲存失敗: ' + logError.message)
      setIsSaving(false)
      return 
    }

    // 2. CTO 冪等性寫入：先刪除該日所有舊標籤，再重新寫入當前勾選的標籤
    // 這徹底解決了「無法取消標籤」與「重複累加」的致命缺陷
    await supabase.from('habit_events').delete().eq('event_date', selectedDate)

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

    alert('Habit 紀錄已完美同步！')
    setIsSaving(false)
  }

  return (
    <div className="pt-4 pb-24">
      <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Daily Habits</h1>
      
      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <label className="block text-apple-gray text-sm font-medium mb-2">Date</label>
        <input 
          type="date" 
          value={selectedDate} 
          onChange={(e) => setSelectedDate(e.target.value)} 
          max={today} 
          className="w-full p-3 border border-gray-200 rounded-apple text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-blue" 
        />
      </div>

      <div className="bg-white rounded-apple shadow-apple p-6 mb-6 space-y-4">
        <label className="block text-apple-gray text-sm font-medium">Sleep (Previous Night)</label>
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

      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <label className="block text-apple-gray text-sm font-medium mb-4">Habit Tags</label>
        
        {isLoadingData ? (
          <div className="text-center py-4 text-apple-gray">Loading today's data...</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {allTags.map(tag => (
                <button 
                  key={tag} 
                  onClick={() => toggleTag(tag)} 
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedTags.includes(tag) ? 'bg-apple-blue text-white' : 'bg-gray-100 text-apple-gray hover:bg-gray-200'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newTag} 
                onChange={(e) => setNewTag(e.target.value)} 
                placeholder="Add new..." 
                className="flex-1 p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue" 
              />
              <button onClick={addCustomTag} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:opacity-90">+ Add</button>
            </div>
          </>
        )}
      </div>

      <button 
        onClick={handleSave} 
        disabled={isSaving || isLoadingData} 
        className="w-full bg-apple-blue text-white py-4 rounded-apple font-semibold text-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isSaving ? 'Syncing...' : (isLoadingData ? 'Loading...' : 'Save Habit Record')}
      </button>
    </div>
  )
}