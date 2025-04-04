import { useEffect, useState, useRef } from 'react';
import { useRoomContext } from './CustomLiveKitRoom';
import { LocalParticipant, Track, TrackPublication } from 'livekit-client';

/**
 * Компонент TrackHealthMonitor следит за состоянием видеотреков и их производительностью
 * Отображает данные о скорости передачи данных, ошибках, и помогает диагностировать
 * проблемы с зависанием видео
 */
export default function TrackHealthMonitor() {
  const room = useRoomContext();
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  
  // Отслеживаем состояние треков
  const [trackStats, setTrackStats] = useState<{
    trackId: string;
    kind: string;
    bytesSent: number;
    bytesReceived: number;
    packetsLost: number;
    lastActive: number;
    resolution: string;
    frameRate: number;
    frozen: boolean;
    lastBytesSent: number;
    lastBytesReceived: number;
    lastCheckTime: number;
    bitrateSent: number;
    bitrateReceived: number;
  }[]>([]);
  
  // Счетчик ошибок для отслеживания проблемных треков
  const errorCountRef = useRef<Record<string, number>>({});
  // Интервал обновления статистики
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Получаем локального участника
  useEffect(() => {
    if (room && room.localParticipant) {
      setLocalParticipant(room.localParticipant);
    }
  }, [room]);
  
  // Функция для получения статистики трека
  const getTrackStats = async (pub: TrackPublication) => {
    if (!pub.track) return null;
    
    try {
      let stats: any = null;
      
      // Так как getStats может не поддерживаться в некоторых версиях LiveKit,
      // пробуем использовать его с предосторожностями
      if ('getStats' in pub.track && typeof (pub.track as any).getStats === 'function') {
        stats = await (pub.track as any).getStats();
      }
      
      return stats;
    } catch (e) {
      // Если произошла ошибка при получении статистики, увеличиваем счетчик ошибок
      const trackId = pub.trackSid;
      errorCountRef.current[trackId] = (errorCountRef.current[trackId] || 0) + 1;
      console.warn(`Ошибка получения статистики для трека ${trackId}:`, e);
      return null;
    }
  };
  
  // Основной цикл мониторинга
  useEffect(() => {
    if (!localParticipant) return;
    
    const updateStats = async () => {
      try {
        const tracks = localParticipant.getTrackPublications();
        
        // Собираем статистику по всем трекам
        const newStats = await Promise.all(
          tracks.map(async (pub) => {
            const trackId = pub.trackSid;
            const kind = pub.kind;
            const rawStats = await getTrackStats(pub);
            
            // Находим текущую статистику для этого трека
            const currentTrackStats = trackStats.find(s => s.trackId === trackId) || {
              trackId,
              kind,
              bytesSent: 0,
              bytesReceived: 0,
              packetsLost: 0,
              lastActive: Date.now(),
              resolution: 'неизвестно',
              frameRate: 0,
              frozen: false,
              lastBytesSent: 0,
              lastBytesReceived: 0,
              lastCheckTime: Date.now(),
              bitrateSent: 0,
              bitrateReceived: 0
            };
            
            let bytesSent = currentTrackStats.bytesSent;
            let bytesReceived = currentTrackStats.bytesReceived;
            let packetsLost = currentTrackStats.packetsLost;
            let resolution = currentTrackStats.resolution;
            let frameRate = currentTrackStats.frameRate;
            
            // Обрабатываем новую статистику, если доступна
            if (rawStats && Array.isArray(rawStats)) {
              for (const stat of rawStats) {
                if (stat.type === 'outbound-rtp' || stat.type === 'outboundrtp') {
                  bytesSent = stat.bytesSent || bytesSent;
                  frameRate = stat.framesPerSecond || frameRate;
                }
                
                if (stat.type === 'inbound-rtp' || stat.type === 'inboundrtp') {
                  bytesReceived = stat.bytesReceived || bytesReceived;
                  packetsLost = stat.packetsLost || packetsLost;
                  frameRate = stat.framesPerSecond || frameRate;
                }
                
                if (stat.frameWidth && stat.frameHeight) {
                  resolution = `${stat.frameWidth}x${stat.frameHeight}`;
                }
              }
            }
            
            // Рассчитываем битрейт (биты в секунду)
            const now = Date.now();
            const timeElapsed = (now - currentTrackStats.lastCheckTime) / 1000; // в секундах
            
            const bitrateSent = timeElapsed > 0 
              ? Math.round((bytesSent - currentTrackStats.lastBytesSent) * 8 / timeElapsed) 
              : currentTrackStats.bitrateSent;
              
            const bitrateReceived = timeElapsed > 0 
              ? Math.round((bytesReceived - currentTrackStats.lastBytesReceived) * 8 / timeElapsed) 
              : currentTrackStats.bitrateReceived;
            
            // Проверяем, заморожен ли трек
            // Трек считается замороженным если битрейт равен 0 в течение времени
            const frozen = (kind === 'video' && bitrateSent === 0 && bytesSent > 0);
            
            // Если трек не замороженный, обновляем время последней активности
            const lastActive = frozen ? currentTrackStats.lastActive : now;
            
            return {
              trackId,
              kind,
              bytesSent,
              bytesReceived,
              packetsLost,
              lastActive,
              resolution,
              frameRate,
              frozen,
              lastBytesSent: bytesSent,
              lastBytesReceived: bytesReceived,
              lastCheckTime: now,
              bitrateSent,
              bitrateReceived
            };
          })
        );
        
        // Обновляем состояние
        setTrackStats(newStats.filter(Boolean) as any);
        
        // Логируем состояние проблемных треков
        for (const stat of newStats) {
          if (stat && stat.frozen && stat.kind === 'video') {
            const frozenTime = Math.round((Date.now() - stat.lastActive) / 1000);
            console.warn(`Видеотрек ${stat.trackId} заморожен в течение ${frozenTime} секунд.`);
          }
        }
      } catch (e) {
        console.error('Ошибка при обновлении статистики треков:', e);
      }
    };
    
    // Запускаем интервал для обновления статистики
    intervalRef.current = setInterval(updateStats, 1000);
    
    // Запускаем сразу первое обновление
    updateStats();
    
    // Очистка при размонтировании
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [localParticipant]);
  
  // Форматируем битрейт для отображения
  const formatBitrate = (bps: number) => {
    if (bps < 1000) return `${bps} бит/с`;
    if (bps < 1000000) return `${(bps / 1000).toFixed(1)} Кбит/с`;
    return `${(bps / 1000000).toFixed(1)} Мбит/с`;
  };
  
  // Изменение цвета в зависимости от состояния
  const getStatusColor = (stat: typeof trackStats[0]) => {
    if (stat.frozen) return 'text-red-500';
    if (stat.kind === 'video' && stat.bitrateSent < 100000) return 'text-yellow-500';
    return 'text-green-500';
  };
  
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 w-64 shadow-lg">
      <h3 className="font-semibold mb-2">Мониторинг треков</h3>
      
      {trackStats.length === 0 ? (
        <div className="text-slate-400">Нет активных треков</div>
      ) : (
        <div className="space-y-2">
          {trackStats.map(stat => (
            <div key={stat.trackId} className="border-t border-slate-700 pt-1">
              <div className={`font-semibold ${getStatusColor(stat)}`}>
                {stat.kind === 'video' ? '📹' : '🎤'} 
                {stat.trackId.substring(0, 10)}...
                {stat.frozen && ' (заморожен)'}
              </div>
              
              <div className="flex justify-between">
                <span>Отправка:</span>
                <span>{formatBitrate(stat.bitrateSent)}</span>
              </div>
              
              {stat.kind === 'video' && (
                <div className="flex justify-between">
                  <span>Разрешение:</span>
                  <span>{stat.resolution}</span>
                </div>
              )}
              
              {stat.kind === 'video' && (
                <div className="flex justify-between">
                  <span>Кадр/с:</span>
                  <span>{stat.frameRate.toFixed(1)}</span>
                </div>
              )}
              
              {stat.packetsLost > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Потери пакетов:</span>
                  <span>{stat.packetsLost}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}