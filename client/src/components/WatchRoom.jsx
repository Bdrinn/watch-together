import { useEffect, useRef, useState } from 'react'
import YouTubePlayer from './YouTubePlayer'
import RoomInfo from './RoomInfo'
import WatchLaterList from './WatchLaterList'
import './WatchRoom.css'

const STORAGE_KEY = 'watchTogether.demoState'

const loadInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { playlist: [], currentVideoIndex: -1, currentTime: 0 }
    }

    const parsed = JSON.parse(raw)
    const playlist = Array.isArray(parsed.playlist) ? parsed.playlist : []
    let currentVideoIndex = typeof parsed.currentVideoIndex === 'number' ? parsed.currentVideoIndex : -1
    const currentTime = typeof parsed.currentTime === 'number' ? parsed.currentTime : 0

    if (currentVideoIndex < -1) {
      currentVideoIndex = -1
    }

    if (currentVideoIndex >= playlist.length) {
      currentVideoIndex = playlist.length ? playlist.length - 1 : -1
    }

    return { playlist, currentVideoIndex, currentTime }
  } catch (error) {
    return { playlist: [], currentVideoIndex: -1, currentTime: 0 }
  }
}

export default function WatchRoom({ roomId, onLeave }) {
  const initialState = loadInitialState()
  const [playlist, setPlaylist] = useState(() => initialState.playlist)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(() => initialState.currentVideoIndex)
  const [currentTime, setCurrentTime] = useState(() => initialState.currentTime)
  const [inputUrl, setInputUrl] = useState('')
  const playerRef = useRef(null)
  const previousVideoIndexRef = useRef(initialState.currentVideoIndex)

  const currentVideo = currentVideoIndex >= 0 && currentVideoIndex < playlist.length
    ? playlist[currentVideoIndex]
    : ''

  useEffect(() => {
    if (playlist.length === 0 && currentVideoIndex !== -1) {
      setCurrentVideoIndex(-1)
      return
    }

    if (currentVideoIndex >= playlist.length) {
      setCurrentVideoIndex(playlist.length - 1)
    }
  }, [playlist, currentVideoIndex])

  useEffect(() => {
    const previousIndex = previousVideoIndexRef.current
    if (previousIndex !== currentVideoIndex) {
      setCurrentTime(0)
      previousVideoIndexRef.current = currentVideoIndex
    }
  }, [currentVideoIndex])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      playlist,
      currentVideoIndex,
      currentTime
    }))
  }, [playlist, currentVideoIndex, currentTime])

  useEffect(() => {
    if (!currentVideo) return

    const updatePlaybackSnapshot = () => {
      const player = playerRef.current
      if (!player?.getCurrentTime) return

      const playbackTime = player.getCurrentTime()
      if (typeof playbackTime === 'number' && !Number.isNaN(playbackTime)) {
        setCurrentTime(playbackTime)
      }
    }

    const intervalId = setInterval(updatePlaybackSnapshot, 2000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updatePlaybackSnapshot()
      }
    }

    window.addEventListener('beforeunload', updatePlaybackSnapshot)
    window.addEventListener('pagehide', updatePlaybackSnapshot)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('beforeunload', updatePlaybackSnapshot)
      window.removeEventListener('pagehide', updatePlaybackSnapshot)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentVideo])

  const handleSetVideo = (e) => {
    e.preventDefault()
    if (!inputUrl.trim()) return

    const newUrl = inputUrl.trim()
    setInputUrl('')

    setPlaylist((prev) => [...prev, newUrl])
    setCurrentVideoIndex((prevIndex) => (prevIndex === -1 ? 0 : prevIndex))
    if (currentVideoIndex === -1) {
      setCurrentTime(0)
    }
  }

  const handlePlayFromQueue = (index) => {
    setCurrentVideoIndex(index)
  }

  const handleRemoveFromQueue = (index) => {
    setPlaylist((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index)

      setCurrentVideoIndex((prevIndex) => {
        if (prevIndex === -1) return -1
        if (index < prevIndex) return prevIndex - 1
        if (index === prevIndex) {
          if (next.length === 0) return -1
          return Math.min(prevIndex, next.length - 1)
        }
        return prevIndex
      })

      return next
    })
  }

  const handleVideoEnded = () => {
    setCurrentVideoIndex((prevIndex) => {
      if (prevIndex === -1) return -1
      if (prevIndex < playlist.length - 1) return prevIndex + 1
      return prevIndex
    })
  }

  const handleLeaveRoom = () => {
    onLeave()
  }

  return (
    <div className="watch-room">
      <div className="container">
        <div className="header">
          <h1>🎬 Watch Together</h1>
          <RoomInfo roomId={roomId} userCount={1} onLeave={handleLeaveRoom} />
        </div>

        <div className="main-content">
          <div className="video-section">
            {currentVideo ? (
              <YouTubePlayer
                videoUrl={currentVideo}
                playerRef={playerRef}
                onEnded={handleVideoEnded}
                initialTime={currentTime}
              />
            ) : (
              <div className="no-video">
                <p>📹 No video selected</p>
                <p>Enter a YouTube link to start watching!</p>
              </div>
            )}
          </div>

          <div className="sidebar">
            <div className="controls-section">
              <form onSubmit={handleSetVideo} className="video-form">
                <input
                  type="url"
                  placeholder="Paste YouTube URL..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="video-input"
                />
                <button type="submit" className="btn-set-video">
                  {currentVideo ? 'Add to Queue' : 'Play Now'}
                </button>
              </form>

              <div className="tips">
                <h3>💡 Tips:</h3>
                <ul>
                  <li>Paste any YouTube link</li>
                  <li>First video plays now</li>
                  <li>More videos go to queue</li>
                  <li>Click to play from queue</li>
                </ul>
              </div>
            </div>

            <WatchLaterList
              playlist={playlist}
              currentVideoIndex={currentVideoIndex}
              onPlayFromQueue={handlePlayFromQueue}
              onRemoveFromQueue={handleRemoveFromQueue}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
