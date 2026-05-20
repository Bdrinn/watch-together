import { useEffect, useRef, useState } from 'react'
import './YouTubePlayer.css'

const loadYouTubeIframeApi = (timeoutMs = 4000) => {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById('youtube-iframe-api')
    if (!existingScript) {
      const script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(script)
    }

    const previousReady = window.onYouTubeIframeAPIReady
    const timeoutId = setTimeout(() => {
      reject(new Error('YouTube API load timeout'))
    }, timeoutMs)

    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') {
        previousReady()
      }
      clearTimeout(timeoutId)
      resolve(window.YT)
    }
  })
}

export default function YouTubePlayer({ videoUrl, playerRef, onEnded, initialTime = 0 }) {
  const playerContainerRef = useRef(null)
  const [videoId, setVideoId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playerError, setPlayerError] = useState(false)
  const [showPlayPrompt, setShowPlayPrompt] = useState(false)
  const playerReadyRef = useRef(false)
  const autoplayCheckRef = useRef(null)
  const autoplayAttemptRef = useRef(false)
  const initialTimeRef = useRef(initialTime)
  const onEndedRef = useRef(onEnded)

  useEffect(() => {
    initialTimeRef.current = initialTime
  }, [initialTime])

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  const ensureIframePermissions = () => {
    const iframe = playerRef?.current?.getIframe?.()
    if (!iframe) return
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen')
    iframe.setAttribute('allowfullscreen', 'true')
  }

  const startPlayback = (startTime) => {
    ensureIframePermissions()
    setShowPlayPrompt(false)
    autoplayAttemptRef.current = true
    if (typeof startTime === 'number' && !Number.isNaN(startTime) && startTime > 0) {
      playerRef?.current?.seekTo?.(startTime, true)
    }
    playerRef?.current?.playVideo?.()

    if (autoplayCheckRef.current) {
      clearTimeout(autoplayCheckRef.current)
    }

    autoplayCheckRef.current = setTimeout(() => {
      const state = playerRef?.current?.getPlayerState?.()
      if (state === 2 || state === -1 || state === 5) {
        setShowPlayPrompt(true)
      }
    }, 1200)
  }

  const pausePlayback = () => {
    setIsPlaying(false)
    playerRef?.current?.pauseVideo?.()
  }

  // Extract YouTube video ID from URL
  useEffect(() => {
    const id = extractVideoId(videoUrl)
    setVideoId(id)
    setPlayerError(false)
    setShowPlayPrompt(false)
    playerReadyRef.current = false
  }, [videoUrl])

  useEffect(() => {
    if (!videoId || !playerContainerRef.current) return

    let isCancelled = false

    const setupPlayer = async () => {
      let YT

      try {
        YT = await loadYouTubeIframeApi()
      } catch (error) {
        setPlayerError(true)
        return
      }

      if (isCancelled) return

      playerContainerRef.current.innerHTML = ''
      playerRef.current = new YT.Player(playerContainerRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          enablejsapi: 1,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true
            ensureIframePermissions()
            startPlayback(initialTimeRef.current)
          },
          onError: () => {
            setPlayerError(true)
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              setIsPlaying(false)
              const handler = onEndedRef.current
              if (typeof handler === 'function') {
                handler()
              }
            }

            if (event.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true)
              autoplayAttemptRef.current = false
              setShowPlayPrompt(false)
            }

            if (event.data === YT.PlayerState.PAUSED) {
              setIsPlaying(false)
            }
          }
        }
      })
    }

    setupPlayer()

    return () => {
      isCancelled = true
      if (playerRef?.current?.destroy) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      if (autoplayCheckRef.current) {
        clearTimeout(autoplayCheckRef.current)
      }
    }
  }, [videoId, playerRef])

  const extractVideoId = (url) => {
    if (!url) return ''

    try {
      const parsedUrl = new URL(url)
      const host = parsedUrl.hostname.replace('www.', '')

      if (host === 'youtu.be') {
        return parsedUrl.pathname.slice(1).split('?')[0]
      }

      if (parsedUrl.pathname.startsWith('/shorts/')) {
        return parsedUrl.pathname.split('/shorts/')[1].split('/')[0]
      }

      if (parsedUrl.pathname.startsWith('/live/')) {
        return parsedUrl.pathname.split('/live/')[1].split('/')[0]
      }

      if (parsedUrl.pathname.startsWith('/embed/')) {
        return parsedUrl.pathname.split('/embed/')[1].split('/')[0]
      }

      const paramId = parsedUrl.searchParams.get('v')
      if (paramId) {
        return paramId
      }
    } catch (error) {
      // Ignore parse errors and fall back to raw input.
    }

    if (/^[a-zA-Z0-9_-]{6,}$/.test(url)) {
      return url
    }

    return ''
  }

  const handlePlay = () => {
    if (!isPlaying) {
      startPlayback()
    }
  }

  const handlePlayPrompt = () => {
    setShowPlayPrompt(false)
    handlePlay()
  }

  const handlePause = () => {
    if (isPlaying) {
      pausePlayback()
    }
  }

  return (
    <div className="youtube-player">
      <div className="video-container">
        {videoId ? (
          playerError ? (
            <iframe
              className="video-iframe"
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div ref={playerContainerRef} className="video-iframe" />
          )
        ) : (
          <div className="no-video-placeholder">
            No video selected
          </div>
        )}
        {showPlayPrompt && !playerError && (
          <button className="play-prompt" onClick={handlePlayPrompt}>
            Click to start playback
          </button>
        )}
      </div>

      <div className="player-controls">
        <div className="button-group">
          {isPlaying ? (
            <button onClick={handlePause} className="control-btn pause-btn" title="Pause">
              ⏸️
            </button>
          ) : (
            <button onClick={handlePlay} className="control-btn play-btn" title="Play">
              ▶️
            </button>
          )}
        </div>

        <div className="sync-status">
          {isPlaying ? '🎬 Playing' : '⏸️ Paused'}
        </div>

        <div className="info-text">
          📹 Local playback only
        </div>
      </div>
    </div>
  )
}
