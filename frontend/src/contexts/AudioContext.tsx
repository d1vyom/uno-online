import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type SoundType = 'draw' | 'play' | 'uno' | 'victory' | 'join' | 'leave';

interface AudioContextType {
  volume: number;
  setVolume: (v: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (sound: SoundType) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('uno_volume');
    return saved !== null ? parseFloat(saved) : 0.5;
  });
  
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('uno_muted');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('uno_volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('uno_muted', isMuted.toString());
  }, [isMuted]);

  const playSound = useCallback((sound: SoundType) => {
    if (isMuted) return;
    
    // Expects files to be located in frontend/public/sounds/
    const audio = new Audio(`/sounds/${sound}.mp3`);
    audio.volume = volume;
    
    audio.play().catch(e => {
      console.warn(`Audio playback failed for ${sound}. Ensure the file exists in public/sounds/.`, e);
    });
  }, [isMuted, volume]);

  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <AudioContext.Provider value={{ volume, setVolume, isMuted, toggleMute, playSound }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
