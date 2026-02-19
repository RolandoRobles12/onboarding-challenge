'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getVideos, getUserVideoViews, upsertVideoView } from '@/lib/firestore-service';
import type { Video, VideoView } from '@/lib/types-scalable';
import {
  LogOut, ShieldCheck, Play, Pause, Volume2, VolumeX,
  CheckCircle, Eye, Clapperboard, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Video Player Card ─────────────────────────────────────────────────────────

const COMPLETION_THRESHOLD = 0.8; // 80% = completed
const SAVE_INTERVAL_MS = 8000;    // Save progress every 8s while playing

function VideoCard({
  video,
  view,
  userId,
  resolvedName,
  resolvedKiosk,
  productId,
  onViewUpdate,
}: {
  video: Video;
  view?: VideoView;
  userId: string;
  resolvedName: string;
  resolvedKiosk: string;
  productId?: string;
  onViewUpdate: (videoId: string, update: Partial<VideoView>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const highestRef = useRef<number>(view?.watchedSeconds ?? 0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(view?.watchedSeconds ?? 0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [expanded, setExpanded] = useState(false);
  const completed = (view?.completed) || (duration > 0 && highestRef.current / duration >= COMPLETION_THRESHOLD);

  const saveProgress = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    const highest = highestRef.current;
    const dur = el.duration || video.duration || 0;
    await upsertVideoView(userId, video.id, {
      watchedSeconds: highest,
      duration: dur,
      trainerName: resolvedName,
      assignedKiosko: resolvedKiosk,
      productId,
    });
    const pct = dur > 0 ? Math.min(100, Math.round((highest / dur) * 100)) : 0;
    const done = dur > 0 && highest / dur >= COMPLETION_THRESHOLD;
    onViewUpdate(video.id, { watchedSeconds: highest, percentWatched: pct, completed: done });
  }, [userId, video.id, video.duration, resolvedName, resolvedKiosk, productId, onViewUpdate]);

  function startSaveTimer() {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setInterval(saveProgress, SAVE_INTERVAL_MS);
  }

  function stopSaveTimer() {
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  useEffect(() => () => { stopSaveTimer(); }, []);

  function handlePlay() {
    setPlaying(true);
    startSaveTimer();
  }

  function handlePause() {
    setPlaying(false);
    stopSaveTimer();
    saveProgress();
  }

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el) return;
    const t = el.currentTime;
    setCurrentTime(t);
    if (t > highestRef.current) highestRef.current = t;
  }

  function handleLoadedMetadata() {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration);
  }

  function handleEnded() {
    stopSaveTimer();
    highestRef.current = duration;
    saveProgress();
    setPlaying(false);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) { el.play(); } else { el.pause(); }
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const viewedPct = view?.percentWatched ?? 0;

  return (
    <div className="rounded-2xl overflow-hidden border shadow-sm bg-card">
      {/* Video container */}
      <div className="relative bg-black aspect-[9/16] max-h-[65vh]">
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnailUrl}
          muted={muted}
          playsInline
          preload="metadata"
          className="w-full h-full object-contain"
          onPlay={handlePlay}
          onPause={handlePause}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />

        {/* Play/Pause overlay */}
        <button
          className="absolute inset-0 flex items-center justify-center"
          onClick={togglePlay}
        >
          {!playing && (
            <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-8 w-8 text-white fill-white ml-1" />
            </div>
          )}
        </button>

        {/* Completed badge */}
        {completed && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 bg-emerald-500 text-white rounded-full px-2.5 py-1 text-xs font-semibold shadow">
              <CheckCircle className="h-3.5 w-3.5" />
              Visto
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-3">
          {/* Progress bar */}
          <div
            className="h-1 bg-white/30 rounded-full overflow-hidden mb-3 cursor-pointer"
            onClick={e => {
              const el = videoRef.current;
              if (!el || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              el.currentTime = ratio * duration;
            }}
          >
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="text-white">
              {playing
                ? <Pause className="h-5 w-5" />
                : <Play className="h-5 w-5 fill-white" />}
            </button>
            <span className="text-white/70 text-xs font-mono flex-1">
              {Math.floor(currentTime / 60)}:{(Math.round(currentTime) % 60).toString().padStart(2, '0')}
              {duration > 0 && ` / ${Math.floor(duration / 60)}:${(Math.round(duration) % 60).toString().padStart(2, '0')}`}
            </span>
            <button onClick={toggleMute} className="text-white">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="font-bold text-sm leading-tight">{video.title}</h3>
            {video.description && (
              <div>
                <p className={cn('text-xs text-muted-foreground mt-1 leading-relaxed', !expanded && 'line-clamp-2')}>
                  {video.description}
                </p>
                {video.description.length > 80 && (
                  <button
                    className="text-xs text-primary mt-0.5 flex items-center gap-0.5"
                    onClick={() => setExpanded(e => !e)}
                  >
                    {expanded ? <><ChevronUp className="h-3 w-3" />Ver menos</> : <><ChevronDown className="h-3 w-3" />Ver más</>}
                  </button>
                )}
              </div>
            )}
          </div>
          {viewedPct > 0 && !completed && (
            <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              {viewedPct}%
            </div>
          )}
        </div>

        {/* Tags */}
        {video.tags && video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1.5">{t}</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideosPage() {
  const { user, profile, logout } = useAuth();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));

  const [videos, setVideos] = useState<Video[]>([]);
  const [viewsMap, setViewsMap] = useState<Record<string, VideoView>>({});
  const [loading, setLoading] = useState(true);

  const productId = profile?.producto;

  // Resolved identity for tracking
  const onboardingData = (profile as any)?.onboardingData as Record<string, string> | undefined;
  const nameFromOnboarding = onboardingData
    ? Object.entries(onboardingData).find(([k]) => /nombre|name|nombres/i.test(k))?.[1]
    : undefined;
  const resolvedName = (nameFromOnboarding || profile?.nombre || user?.displayName || '').trim();
  const kioskFromOnboarding = onboardingData
    ? Object.entries(onboardingData).find(([k]) => /kiosk|kiosco|kiosko/i.test(k))?.[1]
    : undefined;
  const resolvedKiosk = (kioskFromOnboarding || (profile as any)?.assignedKiosko || '').trim();

  useEffect(() => {
    if (!user?.uid) return;
    async function load() {
      setLoading(true);
      const [vids, views] = await Promise.all([
        getVideos(productId),
        getUserVideoViews(user!.uid),
      ]);
      setVideos(vids);
      const map: Record<string, VideoView> = {};
      views.forEach(v => { map[v.videoId] = v; });
      setViewsMap(map);
      setLoading(false);
    }
    load();
  }, [user?.uid, productId]);

  const handleViewUpdate = useCallback((videoId: string, update: Partial<VideoView>) => {
    setViewsMap(prev => ({
      ...prev,
      [videoId]: { ...(prev[videoId] ?? {}), ...update } as VideoView,
    }));
  }, []);

  const watched = Object.values(viewsMap).filter(v => v.completed).length;
  const total = videos.length;

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Link href="/admin/videos">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={logout} className="text-accent-foreground hover:bg-white/10 gap-1">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5 pb-24 space-y-4">

              {/* Title + progress */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clapperboard className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-bold">Videos</h1>
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>{watched}/{total} vistos</span>
                  </div>
                )}
              </div>

              {/* Overall progress bar */}
              {total > 0 && (
                <div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.round((watched / total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {watched === total && total > 0
                      ? '¡Completaste todos los videos disponibles! 🎉'
                      : `${total - watched} video${total - watched !== 1 ? 's' : ''} pendiente${total - watched !== 1 ? 's' : ''}`}
                  </p>
                </div>
              )}

              {/* Hint */}
              {total > 0 && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  💡 Toca el video para reproducirlo. Se marcará como <strong>Visto</strong> cuando hayas visto al menos el 80%.
                </p>
              )}

              {/* Video list */}
              {loading ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden border">
                      <Skeleton className="aspect-[9/16] max-h-[65vh] w-full" />
                      <div className="p-4 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Clapperboard className="h-12 w-12 text-muted-foreground opacity-30 mb-3" />
                  <p className="font-semibold text-lg">Sin videos disponibles</p>
                  <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                    Tu administrador aún no ha publicado videos. Vuelve pronto.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {videos.map(v => (
                    <VideoCard
                      key={v.id}
                      video={v}
                      view={viewsMap[v.id]}
                      userId={user!.uid}
                      resolvedName={resolvedName}
                      resolvedKiosk={resolvedKiosk}
                      productId={productId}
                      onViewUpdate={handleViewUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          <BottomNav isAdmin={isAdmin} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
