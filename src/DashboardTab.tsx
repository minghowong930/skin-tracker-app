import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'

interface DailyData {
  log_date: string
  am_subjective_score?: number
  pm_subjective_score?: number
  am_photo_url?: string
  pm_photo_url?: string
  sleep_hours?: number
  sleep_quality?: number
  is_period_day?: boolean
  tags: string[]
}

export default function DashboardTab() {
  const [timeline, setTimeline] = useState<DailyData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(14) // 預設只渲染 14 天，保護手機記憶體

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true)
      
      // 拉取最近 60 天的數據 (文本數據極輕，一次拉取保證日期合併的準確性)
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('*')
        .gte('log_date', sixtyDaysAgo)
        .order('log_date', { ascending: false })

      const { data: habits } = await supabase
        .from('habit_events')
        .select('event_date, tag_name')
        .gte('event_date', sixtyDaysAgo)

      // CTO 解決方案 1：雙向 Map 合併，徹底解決「數據孤兒」問題
      const dateMap = new Map<string, DailyData>()

      logs?.forEach(log => {
        dateMap.set(log.log_date, { ...log, tags: [] })
      })

      habits?.forEach(habit => {
        if (!dateMap.has(habit.event_date)) {
          dateMap.set(habit.event_date, { log_date: habit.event_date, tags: [habit.tag_name] })
        } else {
          dateMap.get(habit.event_date)!.tags.push(habit.tag_name)
        }
      })

      // CTO 解決方案 2：安全的本地日期排序 (徹底避開 UTC 時區偏移陷阱)
      const sortedDates = Array.from(dateMap.keys()).sort((a, b) => {
        const [ay, am, ad] = a.split('-').map(Number)
        const [by, bm, bd] = b.split('-').map(Number)
        return new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()
      })

      const mergedTimeline = sortedDates.map(date => dateMap.get(date)!)
      setTimeline(mergedTimeline)
      setIsLoading(false)
    }

    fetchAllData()
  }, [])

  // 輔助函式：格式化日期 (強制本地時間)
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    return `${month}月${day}日 (週${weekdays[date.getDay()]})`
  }

  if (isLoading) {
    return (
      <div className="pt-4 pb-24 flex items-center justify-center h-64">
        <p className="text-apple-gray animate-pulse">Loading Timeline...</p>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-24">
      <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Dashboard</h1>
      
      {timeline.length === 0 ? (
        <div className="bg-white rounded-apple shadow-apple p-12 text-center">
          <p className="text-4xl mb-4">📅</p>
          <p className="text-apple-gray text-lg">目前還沒有紀錄</p>
          <p className="text-apple-gray text-sm mt-2">快去 Skin 或 Habit 頁面留下今天的足跡吧！</p>
        </div>
      ) : (
        <div className="space-y-6">
          {timeline.slice(0, displayCount).map((day) => (
            <div key={day.log_date} className="bg-white rounded-apple shadow-apple p-5 overflow-hidden">
              {/* Header: Date & Period */}
              <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                <h2 className="text-lg font-bold text-apple-text">{formatDate(day.log_date)}</h2>
                {day.is_period_day && (
                  <span className="px-2 py-1 bg-red-50 text-red-500 text-xs font-semibold rounded-full">🩸 生理期</span>
                )}
              </div>

              {/* Skin Status: AM / PM */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* AM */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-sm">☀️</span>
                    <span className="text-xs font-semibold text-apple-gray">AM</span>
                    {day.am_subjective_score ? (
                      <span className="ml-auto text-lg font-bold text-apple-blue">{day.am_subjective_score}</span>
                    ) : (
                      <span className="ml-auto text-xs text-apple-gray">--</span>
                    )}
                  </div>
                  {/* CTO 解決方案 3：加入 loading="lazy" 防止手機記憶體崩潰 */}
                  {day.am_photo_url ? (
                    <img src={day.am_photo_url} alt="AM" loading="lazy" className="w-full h-24 object-cover rounded-md border border-gray-200" />
                  ) : (
                    <div className="w-full h-24 bg-gray-100 rounded-md flex items-center justify-center text-gray-300 text-2xl">📷</div>
                  )}
                </div>
                
                {/* PM */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-sm">🌙</span>
                    <span className="text-xs font-semibold text-apple-gray">PM</span>
                    {day.pm_subjective_score ? (
                      <span className="ml-auto text-lg font-bold text-apple-blue">{day.pm_subjective_score}</span>
                    ) : (
                      <span className="ml-auto text-xs text-apple-gray">--</span>
                    )}
                  </div>
                  {day.pm_photo_url ? (
                    <img src={day.pm_photo_url} alt="PM" loading="lazy" className="w-full h-24 object-cover rounded-md border border-gray-200" />
                  ) : (
                    <div className="w-full h-24 bg-gray-100 rounded-md flex items-center justify-center text-gray-300 text-2xl">📷</div>
                  )}
                </div>
              </div>

              {/* Sleep Metrics */}
              {(day.sleep_hours || day.sleep_quality) && (
                <div className="flex items-center gap-4 mb-4 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-apple-gray text-xs font-medium">🛌 睡眠</span>
                    <span className="text-apple-text text-sm font-semibold">{day.sleep_hours || '-'}h</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className={`text-sm ${star <= (day.sleep_quality || 0) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Habit Tags */}
              {day.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                  {day.tags.map((tag, idx) => (
                    <span key={idx} className="px-3 py-1 bg-apple-blue/10 text-apple-blue text-xs font-medium rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Load More Button (分頁切片) */}
          {displayCount < timeline.length && (
            <button 
              onClick={() => setDisplayCount(prev => prev + 14)}
              className="w-full py-3 bg-gray-100 text-apple-gray font-medium rounded-apple hover:bg-gray-200 transition-colors"
            >
              Load More (載入更多)
            </button>
          )}
        </div>
      )}
    </div>
  )
}