import { useState } from 'react'
import SkinTab from './SkinTab'
import HabitTab from './HabitTab'
import DashboardTab from './DashboardTab'
import AnalystTab from './AnalystTab'

function App() {
  const [activeTab, setActiveTab] = useState<'skin' | 'habit' | 'dashboard' | 'analyst'>('skin')

  const NavButton = ({ icon, label, active, onClick }: { icon: string, label: string, active: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center flex-1 py-2 transition-all ${active ? 'text-apple-blue' : 'text-apple-gray'}`}>
      <span className="text-2xl mb-1">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-apple-bg pb-24">
      <div className="max-w-md mx-auto px-6">
        {activeTab === 'skin' && <SkinTab />}
        {activeTab === 'habit' && <HabitTab />}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'analyst' && <AnalystTab />}
      </div>

      {/* iOS 風格底部導航列 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 z-50">
        <div className="max-w-md mx-auto flex">
          <NavButton icon="💆🏻‍♀️" label="Skin" active={activeTab === 'skin'} onClick={() => setActiveTab('skin')} />
          <NavButton icon="🏃" label="Habit" active={activeTab === 'habit'} onClick={() => setActiveTab('habit')} />
          <NavButton icon="📅" label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon="💡" label="Analyst" active={activeTab === 'analyst'} onClick={() => setActiveTab('analyst')} />
        </div>
      </div>
    </div>
  )
}

export default App