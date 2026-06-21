import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import imageCompression from 'browser-image-compression'

export default function SkinTab() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM')
  const [skinScore, setSkinScore] = useState(5)
  const [isPeriod, setIsPeriod] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      setIsProcessingPhoto(true)
      setPhotoPreview(URL.createObjectURL(file))
      try {
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true })
        setPhotoFile(compressedFile)
      } catch { setPhotoFile(file) } 
      finally { setIsProcessingPhoto(false) }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    const scoreCol = period === 'AM' ? 'am_subjective_score' : 'pm_subjective_score'
    const photoCol = period === 'AM' ? 'am_photo_url' : 'pm_photo_url'
    let photoUrl = null

    if (photoFile) {
      const fileName = `${selectedDate}_${period}_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('skin-photos').upload(fileName, photoFile, { contentType: 'image/jpeg', upsert: true })
      if (error) { alert('照片上傳失敗'); setIsSaving(false); return }
      const { data } = supabase.storage.from('skin-photos').getPublicUrl(fileName)
      photoUrl = data.publicUrl
    }

    const { error } = await supabase.from('daily_logs').upsert({
      log_date: selectedDate,
      [scoreCol]: skinScore,
      [photoCol]: photoUrl,
      is_period_day: isPeriod
    })

    if (error) { alert('儲存失敗: ' + error.message) } 
    else { 
      alert('Skin 紀錄已儲存！')
      setPhotoFile(null); setPhotoPreview(null)
    }
    setIsSaving(false)
  }

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-semibold text-apple-text mb-8 text-center">Skin Tracker</h1>
      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <label className="block text-apple-gray text-sm font-medium mb-2">Date</label>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} max={today} className="w-full p-3 border border-gray-200 rounded-apple text-apple-text focus:outline-none focus:ring-2 focus:ring-apple-blue" />
      </div>
      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <label className="block text-apple-gray text-sm font-medium mb-4">Session</label>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setPeriod('AM')} className={`py-4 rounded-apple font-medium ${period === 'AM' ? 'bg-apple-blue text-white shadow-md' : 'bg-gray-100 text-apple-gray'}`}>☀️ AM</button>
          <button onClick={() => setPeriod('PM')} className={`py-4 rounded-apple font-medium ${period === 'PM' ? 'bg-apple-blue text-white shadow-md' : 'bg-gray-100 text-apple-gray'}`}>🌙 PM</button>
        </div>
      </div>
      <div className="bg-white rounded-apple shadow-apple p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="text-apple-gray text-sm font-medium">Skin Score</label>
          <span className="text-2xl font-semibold text-apple-blue">{skinScore}</span>
        </div>
        <input type="range" min="1" max="10" value={skinScore} onChange={(e) => setSkinScore(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue" />
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
          {photoPreview ? <img src={photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" /> : <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center text-3xl">📷</div>}
          <label className="px-4 py-2 bg-gray-100 text-apple-text rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200">
            {photoFile ? 'Change Photo' : 'Take / Upload Photo'}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </label>
        </div>
      </div>
      <button onClick={handleSave} disabled={isSaving || isProcessingPhoto} className="w-full bg-apple-blue text-white py-4 rounded-apple font-semibold text-lg hover:opacity-90 disabled:opacity-50">
        {isSaving ? 'Saving...' : (isProcessingPhoto ? 'Processing...' : 'Save Skin Record')}
      </button>
    </div>
  )
}