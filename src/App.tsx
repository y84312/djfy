import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, X, Music, Play, Pause, GripVertical, Wand2, LogIn, Disc, Zap } from 'lucide-react';
import { searchArtists, getArtistTopTracks, getAudioFeatures } from './services/spotifyService';
import { composeMix } from './services/geminiService';
import { Artist, Track } from './types';
import { cn } from './lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Components ---

const TrackItem = ({ track, index, isPlaying, onPlay, transitionNote }: { 
  track: Track; 
  index: number; 
  isPlaying: boolean; 
  onPlay: () => void;
  transitionNote?: string;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative mb-4">
      {transitionNote && (
        <div className="absolute -top-3 left-12 z-10 px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-widest rounded-full">
          {transitionNote}
        </div>
      )}
      <div className={cn(
        "flex items-center gap-4 p-4 glass rounded-xl transition-all duration-300",
        isPlaying ? "border-emerald-500/50 bg-emerald-500/5" : "hover:bg-white/10"
      )}>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
          <GripVertical size={20} />
        </div>
        
        <div className="relative w-12 h-12 flex-shrink-0 group/img">
          <img 
            src={track.album.images[0]?.url} 
            alt={track.name} 
            className="w-full h-full object-cover rounded-lg"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg"
          >
            {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
          </button>
        </div>

        <div className="flex-grow min-w-0">
          <h4 className="font-medium truncate text-zinc-100">{track.name}</h4>
          <p className="text-xs text-zinc-500 truncate">{track.artists.map(a => a.name).join(', ')}</p>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div className="hidden md:block">
            <p className="text-[10px] uppercase tracking-tighter text-zinc-500 font-mono">BPM</p>
            <p className="text-sm font-mono text-emerald-400">{Math.round(track.tempo || 0)}</p>
          </div>
          <div className="hidden md:block">
            <p className="text-[10px] uppercase tracking-tighter text-zinc-500 font-mono">Key</p>
            <p className="text-sm font-mono text-zinc-300">{track.key}</p>
          </div>
          <div className="w-12 text-zinc-500 text-xs font-mono">
            {Math.floor(track.duration_ms / 60000)}:
            {String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [transitionNotes, setTransitionNotes] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const checkLogin = () => {
      const token = document.cookie.includes('spotify_access_token');
      setIsLoggedIn(token);
    };
    checkLogin();
    
    const handleAuthSuccess = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsLoggedIn(true);
      }
    };
    window.addEventListener('message', handleAuthSuccess);
    return () => window.removeEventListener('message', handleAuthSuccess);
  }, []);

  const handleLogin = async () => {
    const res = await fetch('/api/auth/url');
    const { url } = await res.json();
    window.open(url, 'spotify_auth', 'width=600,height=800');
  };

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length > 2) {
      const results = await searchArtists(q);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const addArtist = (artist: Artist) => {
    if (!selectedArtists.find(a => a.id === artist.id)) {
      setSelectedArtists([...selectedArtists, artist]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeArtist = (id: string) => {
    setSelectedArtists(selectedArtists.filter(a => a.id !== id));
  };

  const handleCompose = async () => {
    if (selectedArtists.length === 0) return;
    setIsComposing(true);
    try {
      // 1. Get top tracks for each artist
      const allTracksPromises = selectedArtists.map(a => getArtistTopTracks(a.id));
      const tracksResults = await Promise.all(allTracksPromises);
      
      // Take top 3 tracks from each artist
      const flattenedTracks: Track[] = tracksResults.flatMap(artistTracks => artistTracks.slice(0, 3));
      
      // 2. Get audio features (BPM, Key)
      const features = await getAudioFeatures(flattenedTracks.map(t => t.id));
      
      const enrichedTracks = flattenedTracks.map((t, i) => ({
        ...t,
        tempo: features[i]?.tempo,
        key: features[i]?.key,
        mode: features[i]?.mode,
        energy: features[i]?.energy,
      }));

      // 3. Use Gemini to order them
      const mixData = await composeMix(enrichedTracks);
      
      const orderedTracks = mixData.map((item: any) => 
        enrichedTracks.find(t => t.id === item.trackId)
      ).filter(Boolean) as Track[];

      const notes: Record<string, string> = {};
      mixData.forEach((item: any) => {
        notes[item.trackId] = item.transitionNote;
      });

      setTracks(orderedTracks);
      setTransitionNotes(notes);
    } catch (error) {
      console.error("Composition error", error);
    } finally {
      setIsComposing(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTracks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-zinc-950 overflow-hidden relative">
        {/* Background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center z-10"
        >
          <div className="flex items-center justify-center mb-8">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)]">
              <Disc className="text-black w-10 h-10 animate-spin-slow" />
            </div>
          </div>
          <h1 className="text-8xl font-display uppercase tracking-tighter mb-4 italic">djfy.</h1>
          <p className="text-zinc-400 max-w-md mx-auto mb-12 text-lg">
            The easiest way to compose professional DJ sets. Just enter your artists and let AI handle the rest.
          </p>
          <button 
            onClick={handleLogin}
            className="group flex items-center gap-3 px-8 py-4 bg-emerald-500 text-black font-bold rounded-full hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <LogIn size={20} />
            CONNECT SPOTIFY
          </button>
          <p className="mt-6 text-xs text-zinc-600 uppercase tracking-widest">Premium account recommended for full playback</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-black">
      {/* Sidebar / Header */}
      <header className="border-b border-white/5 p-6 flex items-center justify-between sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
            <Disc size={16} className="text-black" />
          </div>
          <span className="text-2xl font-display uppercase italic tracking-tighter">djfy.</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">AI Engine Online</span>
          </div>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <Zap size={20} className="text-zinc-400" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-8">
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-4 flex items-center gap-2">
              <Search size={14} /> 01. Add Artists
            </h2>
            <div className="relative">
              <input 
                type="text"
                value={searchQuery}
                onChange={handleSearch}
                placeholder="Search artists..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <AnimatePresence>
                {searchResults.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 right-0 mt-2 glass rounded-2xl overflow-hidden z-20 shadow-2xl"
                  >
                    {searchResults.map(artist => (
                      <button 
                        key={artist.id}
                        onClick={() => addArtist(artist)}
                        className="w-full flex items-center gap-4 p-4 hover:bg-white/10 transition-colors text-left border-b border-white/5 last:border-0"
                      >
                        <img src={artist.images[2]?.url} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                        <span className="font-medium">{artist.name}</span>
                        <Plus size={16} className="ml-auto text-zinc-500" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {selectedArtists.map(artist => (
                <motion.div 
                  layout
                  key={artist.id}
                  className="flex items-center gap-2 pl-1 pr-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full"
                >
                  <img src={artist.images[2]?.url} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  <span className="text-sm font-medium text-emerald-400">{artist.name}</span>
                  <button onClick={() => removeArtist(artist.id)} className="hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 mb-4 flex items-center gap-2">
              <Wand2 size={14} /> 02. Compose Set
            </h2>
            <button 
              onClick={handleCompose}
              disabled={selectedArtists.length === 0 || isComposing}
              className={cn(
                "w-full py-6 rounded-2xl font-display text-2xl uppercase tracking-widest transition-all relative overflow-hidden group",
                selectedArtists.length > 0 ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {isComposing ? (
                  <>
                    <Disc className="animate-spin" /> COMPOSING...
                  </>
                ) : (
                  <>COMPOSE MIX</>
                )}
              </span>
              {isComposing && (
                <motion.div 
                  className="absolute inset-0 bg-white/20"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                />
              )}
            </button>
            <p className="mt-4 text-xs text-zinc-500 leading-relaxed italic">
              AI will analyze BPM, Key, and Energy levels to create the perfect flow between your chosen artists.
            </p>
          </section>
        </div>

        {/* Right Column: Tracklist */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 flex items-center gap-2">
              <Music size={14} /> 03. Your Mix
            </h2>
            {tracks.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                {tracks.length} Tracks • {Math.floor(tracks.reduce((acc, t) => acc + t.duration_ms, 0) / 60000)} MIN
              </span>
            )}
          </div>

          <div className="space-y-4">
            {tracks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center glass rounded-3xl border-dashed border-2 border-white/5">
                <Disc size={48} className="text-zinc-800 mb-4" />
                <p className="text-zinc-600 font-medium">Add artists to start mixing</p>
              </div>
            ) : (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={tracks.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {tracks.map((track, index) => (
                    <TrackItem 
                      key={track.id} 
                      track={track} 
                      index={index}
                      isPlaying={currentTrackId === track.id}
                      onPlay={() => setCurrentTrackId(currentTrackId === track.id ? null : track.id)}
                      transitionNote={transitionNotes[track.id]}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </main>

      {/* Mini Player */}
      <AnimatePresence>
        {currentTrackId && (
          <motion.footer 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none"
          >
            <div className="max-w-4xl mx-auto glass rounded-2xl p-4 flex items-center gap-4 pointer-events-auto shadow-2xl border-emerald-500/20">
              {tracks.find(t => t.id === currentTrackId) && (
                <>
                  <img 
                    src={tracks.find(t => t.id === currentTrackId)?.album.images[0].url} 
                    className="w-12 h-12 rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-grow">
                    <h4 className="font-bold text-sm">{tracks.find(t => t.id === currentTrackId)?.name}</h4>
                    <p className="text-xs text-zinc-500">{tracks.find(t => t.id === currentTrackId)?.artists[0].name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button className="p-2 text-zinc-400 hover:text-white transition-colors">
                      <Play size={24} fill="currentColor" />
                    </button>
                    <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-emerald-500"
                        animate={{ width: ['0%', '100%'] }}
                        transition={{ duration: 30, repeat: Infinity }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}
