import { useEffect, useState } from 'react'
import WatchRoom from './components/WatchRoom'
import RoomSelector from './components/RoomSelector'
import './App.css'

function App() {
  const getInitialTheme = () => {
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      return storedTheme
    }

    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }

    return 'light'
  }

  const [roomId, setRoomId] = useState(() => localStorage.getItem('roomId'))
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    if (roomId) {
      localStorage.setItem('roomId', roomId)
    } else {
      localStorage.removeItem('roomId')
    }
  }, [roomId])

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('theme-dark')
    } else {
      document.body.classList.remove('theme-dark')
    }

    localStorage.setItem('theme', theme)
  }, [theme])

  const handleToggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  const handleJoinRoom = (id) => {
    setRoomId(id)
  }

  const handleLeaveRoom = () => {
    setRoomId(null)
  }

  return (
    <div className="app">
      <div className="theme-toggle">
        <button onClick={handleToggleTheme} className="theme-toggle-btn">
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
      </div>
      {!roomId ? (
        <RoomSelector onJoinRoom={handleJoinRoom} />
      ) : (
        <WatchRoom roomId={roomId} onLeave={handleLeaveRoom} />
      )}
    </div>
  )
}

export default App
