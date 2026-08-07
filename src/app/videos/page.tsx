'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  getVideos, getUserVideoViews, upsertVideoView,
  getVideoReactions, setVideoReaction,
  getVideoComments, addVideoComment, deleteVideoComment,
  getVideoFolders,
} from '@/lib/firestore-service';
import type { Video, VideoView, VideoReaction, VideoComment, VideoFolder } from '@/lib/types-scalable';
import {
  LogOut, ShieldCheck, Play, Pause, Volume2, VolumeX,
  CheckCircle, Clapperboard, ChevronDown, ChevronUp,
  Share2, MessageCircle, Send, Trash2, X, Heart, Maximize, Minimize,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLETION_THRESHOLD = 1.0;   // 100% required
const SAVE_INTERVAL_MS = 8000;
const REACTIONS = ['❤️', '👏', '🔥', '💡'] as const;

// ─── Comment sheet ────────────────────────────────────────────────────────────

function CommentSheet({
  videoId,
  userId,
  trainerName,
  isAdmin,
  onClose,
}: {
  videoId: string;
  userId: string;
  trainerName: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVideoComments(videoId).then(c => { setComments(c); setLoading(false); });
  }, [videoId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    const id = await addVideoComment({ videoId, userId, trainerName, text: text.trim() });
    setComments(prev => [...prev, {
      id, videoId, userId, trainerName,
      text: text.trim(),
      createdAt: { seconds: Date.now() / 1000 } as any,
    }]);
    setText('');
    setSending(false);
  }

  async function handleDelete(commentId: string) {
    await deleteVideoComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-background rounded-t-2xl shadow-xl flex flex-col max-h-[70vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">
            Comentarios{comments.length > 0 && ` (${comments.length})`}
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              Sin comentarios aún. ¡Sé el primero!
            </p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2 items-start group">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                  {c.trainerName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{c.trainerName || 'Usuario'}</p>
                  <p className="text-sm text-foreground leading-snug break-words">{c.text}</p>
                </div>
                {(isAdmin || c.userId === userId) && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe un comentario…"
            rows={1}
            className="resize-none flex-1 min-h-[36px] max-h-24 text-sm"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            disabled={!text.trim() || sending}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Video card (TikTok style) ────────────────────────────────────────────────

function VideoCard({
  video,
  view,
  userId,
  resolvedName,
  resolvedKiosk,
  productId,
  isAdmin,
  onViewUpdate,
}: {
  video: Video;
  view?: VideoView;
  userId: string;
  resolvedName: string;
  resolvedKiosk: string;
  productId?: string;
  isAdmin: boolean;
  onViewUpdate: (videoId: string, partial: Partial<VideoView>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const highestRef = useRef<number>(view?.watchedSeconds ?? 0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(view?.watchedSeconds ?? 0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reactions
  const [reactions, setReactions] = useState<VideoReaction[]>([]);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);

  // Completion: 100%
  const completed = view?.completed || (duration > 0 && highestRef.current >= duration * 0.99);

  useEffect(() => {
    getVideoReactions(video.id).then(r => {
      setReactions(r);
      const mine = r.find(x => x.userId === userId);
      setMyReaction(mine?.emoji ?? null);
    });
    getVideoComments(video.id).then(c => setCommentCount(c.length));
  }, [video.id, userId]);

  // ── Progress tracking ────────────────────────────────────────────────────

  const saveProgress = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    const dur = el.duration || video.duration || 0;
    const highest = highestRef.current;
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

  function startTimer() {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setInterval(saveProgress, SAVE_INTERVAL_MS);
  }
  function stopTimer() {
    if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
  }
  useEffect(() => () => stopTimer(), []);

  function handlePlay() {
    const el = videoRef.current;
    if (el && el.currentTime < 3 && highestRef.current > 10) {
      // User is replaying from the start — reset session tracker
      highestRef.current = 0;
    }
    setPlaying(true);
    startTimer();
  }
  function handlePause() { setPlaying(false); stopTimer(); saveProgress(); }
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
    stopTimer();
    if (videoRef.current) highestRef.current = videoRef.current.duration || video.duration || highestRef.current;
    saveProgress();
    setPlaying(false);
  }
  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  }
  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  // ── Reactions ────────────────────────────────────────────────────────────

  async function handleReaction(emoji: string) {
    const next = myReaction === emoji ? null : emoji;
    setMyReaction(next);
    setReactions(prev => {
      const without = prev.filter(r => r.userId !== userId);
      if (!next) return without;
      return [...without, { id: `${userId}_${video.id}`, videoId: video.id, userId, trainerName: resolvedName, emoji: next, reactedAt: null as any }];
    });
    setShowPicker(false);
    await setVideoReaction(userId, video.id, next, resolvedName);
  }

  // ── Share ────────────────────────────────────────────────────────────────

  async function handleShare() {
    const url = `${window.location.origin}/videos?v=${video.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Enlace copiado al portapapeles');
    } catch {
      prompt('Copia este enlace:', url);
    }
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────

  function toggleFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  // Keep isFullscreen in sync when user presses Escape
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const totalReactions = reactions.length;

  return (
    <>
      <div id={`video-${video.id}`} className="relative rounded-2xl overflow-hidden bg-black shadow-lg">

        {/* ── Video element ─────────────────────────────────── */}
        <div className="relative aspect-[9/16] max-h-[78vh] w-full bg-black">
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

          {/* Play overlay (center) */}
          <button
            className="absolute inset-0 flex items-center justify-center z-10"
            onClick={togglePlay}
          >
            {!playing && (
              <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Play className="h-8 w-8 text-white fill-white ml-1" />
              </div>
            )}
          </button>

          {/* Completed badge (top-left) */}
          {completed && (
            <div className="absolute top-3 left-3 z-20">
              <div className="flex items-center gap-1 bg-emerald-500 text-white rounded-full px-2.5 py-1 text-xs font-semibold shadow">
                <CheckCircle className="h-3.5 w-3.5" />
                Visto
              </div>
            </div>
          )}

          {/* ── Right-side action buttons (TikTok style) ──── */}
          <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">

            {/* Reaction button + picker */}
            <div className="relative flex flex-col items-center">
              {/* Emoji picker (appears above) */}
              {showPicker && (
                <div className="absolute bottom-full mb-2 flex flex-col gap-1.5 items-center bg-black/70 rounded-2xl px-2 py-2 backdrop-blur-sm">
                  {REACTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => handleReaction(e)}
                      className={cn(
                        'text-2xl transition-transform hover:scale-125',
                        myReaction === e && 'scale-125'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowPicker(p => !p)}
                className="flex flex-col items-center gap-0.5"
              >
                <div className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-90',
                  myReaction ? 'bg-white/20 text-2xl' : 'bg-black/40 backdrop-blur-sm'
                )}>
                  {myReaction
                    ? myReaction
                    : <Heart className="h-6 w-6 text-white" />
                  }
                </div>
                <span className="text-white text-xs font-semibold drop-shadow">{totalReactions || ''}</span>
              </button>
            </div>

            {/* Comments */}
            <button
              onClick={() => setShowComments(true)}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <span className="text-white text-xs font-semibold drop-shadow">
                {commentCount !== null && commentCount > 0 ? commentCount : ''}
              </span>
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                <Share2 className="h-6 w-6 text-white" />
              </div>
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="flex flex-col items-center gap-0.5"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                {isFullscreen
                  ? <Minimize className="h-6 w-6 text-white" />
                  : <Maximize className="h-6 w-6 text-white" />
                }
              </div>
            </button>
          </div>

          {/* ── Bottom overlay: title + progress ─────────── */}
          <div className="absolute bottom-0 left-0 right-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-10 pb-3 z-10">
            <h3 className="text-white font-bold text-sm leading-snug drop-shadow">{video.title}</h3>

            {/* Mute button inline */}
            <button onClick={toggleMute} className="absolute bottom-3 right-3 text-white/70">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>

          {/* Progress bar */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20 cursor-pointer"
            onClick={e => {
              const el = videoRef.current;
              if (!el || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
            }}
          >
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* ── Description below video ───────────────────── */}
        {video.description && (
          <div className="bg-card px-4 py-3">
            <p className={cn('text-sm text-foreground leading-relaxed', !descExpanded && 'line-clamp-2')}>
              {video.description}
            </p>
            {video.description.length > 90 && (
              <button
                className="text-xs text-primary mt-0.5 flex items-center gap-0.5"
                onClick={() => setDescExpanded(e => !e)}
              >
                {descExpanded
                  ? <><ChevronUp className="h-3 w-3" />Ver menos</>
                  : <><ChevronDown className="h-3 w-3" />Ver más</>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Comment sheet */}
      {showComments && (
        <CommentSheet
          videoId={video.id}
          userId={userId}
          trainerName={resolvedName}
          isAdmin={isAdmin}
          onClose={() => {
            setShowComments(false);
            // Refresh comment count
            getVideoComments(video.id).then(c => setCommentCount(c.length));
          }}
        />
      )}
    </>
  );
}

// ─── Inner feed (needs Suspense for useSearchParams) ──────────────────────────

function VideoFeed() {
  const searchParams = useSearchParams();
  const { user, profile, logout } = useAuth();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));

  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [viewsMap, setViewsMap] = useState<Record<string, VideoView>>({});
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = todos

  const productId = profile?.producto;

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
      const [vids, views, flds] = await Promise.all([
        getVideos(productId),
        getUserVideoViews(user!.uid),
        getVideoFolders(),
      ]);
      setVideos(vids);
      // Una carpeta sin producto asignado es visible para todos; si tiene uno,
      // solo se muestra a vendedores con ese mismo producto asignado.
      setFolders(flds.filter(f => f.active && (!f.productId || f.productId === productId)));
      const map: Record<string, VideoView> = {};
      views.forEach(v => { map[v.videoId] = v; });
      setViewsMap(map);
      setLoading(false);

      // Deep-link: scroll to ?v= video
      const targetId = searchParams.get('v');
      if (targetId) {
        setTimeout(() => {
          document.getElementById(`video-${targetId}`)?.scrollIntoView({ behavior: 'smooth' });
        }, 600);
      }
    }
    load();
  }, [user?.uid, productId, searchParams]);

  const handleViewUpdate = useCallback((videoId: string, update: Partial<VideoView>) => {
    setViewsMap(prev => ({
      ...prev,
      [videoId]: { ...(prev[videoId] ?? {}), ...update } as VideoView,
    }));
  }, []);

  const watched = Object.values(viewsMap).filter(v => v.completed).length;
  const total = videos.length;

  // Videos filtrados según carpeta activa
  const filteredVideos = activeFolder === null
    ? videos
    : videos.filter(v => v.folderId === activeFolder);

  // Recientes no vistos (sin folderId o feed principal, sin completar), máx 5
  const unwatchedVideos = videos.filter(v => !viewsMap[v.id]?.completed).slice(0, 5);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="bg-accent text-accent-foreground border-b sticky top-0 z-30">
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

      <main className="flex-grow">
        <div className="max-w-md mx-auto px-4 py-4 pb-28 space-y-5">

          {/* Title + counter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">Videos</h1>
            </div>
            {total > 0 && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {watched}/{total}
              </span>
            )}
          </div>

          {/* Overall progress */}
          {total > 0 && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.round((watched / total) * 100)}%` }}
              />
            </div>
          )}

          {loading ? (
            <div className="space-y-5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden shadow-lg">
                  <Skeleton className="aspect-[9/16] max-h-[78vh] w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Clapperboard className="h-12 w-12 text-muted-foreground opacity-30 mb-3" />
              <p className="font-semibold text-lg">Sin videos disponibles</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                Vuelve pronto, tu equipo está preparando contenido.
              </p>
            </div>
          ) : (
            <>
              {/* Folder navigation tabs */}
              {folders.length > 0 && (
                <div className="overflow-x-auto -mx-4 px-4">
                  <div className="flex gap-2 w-max pb-1">
                    <button
                      onClick={() => setActiveFolder(null)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                        activeFolder === null
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      Todos
                    </button>
                    {folders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => setActiveFolder(f.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                          activeFolder === f.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section: Por ver (solo cuando se muestra "Todos") */}
              {activeFolder === null && unwatchedVideos.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">Por ver</span>
                    <span className="text-xs text-muted-foreground">{unwatchedVideos.length} pendiente{unwatchedVideos.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-5">
                    {unwatchedVideos.map(v => (
                      <VideoCard
                        key={v.id}
                        video={v}
                        view={viewsMap[v.id]}
                        userId={user!.uid}
                        resolvedName={resolvedName}
                        resolvedKiosk={resolvedKiosk}
                        productId={productId}
                        isAdmin={isAdmin}
                        onViewUpdate={handleViewUpdate}
                      />
                    ))}
                  </div>
                  {videos.length > unwatchedVideos.length && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-semibold text-muted-foreground mb-3">Todos los videos</p>
                    </div>
                  )}
                </div>
              )}

              {/* Feed filtrado */}
              <div className="space-y-5">
                {(activeFolder === null ? videos : filteredVideos).map(v => (
                  // Si activeFolder es null, saltamos los que ya aparecen en "Por ver"
                  (activeFolder === null && !viewsMap[v.id]?.completed && unwatchedVideos.find(u => u.id === v.id)) ? null : (
                    <VideoCard
                      key={v.id}
                      video={v}
                      view={viewsMap[v.id]}
                      userId={user!.uid}
                      resolvedName={resolvedName}
                      resolvedKiosk={resolvedKiosk}
                      productId={productId}
                      isAdmin={isAdmin}
                      onViewUpdate={handleViewUpdate}
                    />
                  )
                ))}
                {activeFolder !== null && filteredVideos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Clapperboard className="h-10 w-10 text-muted-foreground opacity-30 mb-2" />
                    <p className="text-muted-foreground text-sm">Esta carpeta no tiene videos todavía.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Always show bottom nav on the videos page — admins can use the header button to go back */}
      <BottomNav isAdmin={false} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideosPage() {
  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <Clapperboard className="h-10 w-10 animate-pulse text-muted-foreground" />
          </div>
        }>
          <VideoFeed />
        </Suspense>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
