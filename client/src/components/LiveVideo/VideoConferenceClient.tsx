import React, { useMemo, useState, useEffect } from 'react';
import {
  formatChatMessageLinks,
  LiveKitRoom,
  ControlBar,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  VideoPresets,
  type VideoCodec,
  createLocalVideoTrack,
  Track,
} from 'livekit-client';
import { decodePassphrase } from '../../lib/utils';
import { CustomVideoGrid } from './CustomVideoGrid';
import { useSlots } from '../../hooks/use-slots';

import { SlotsState } from '../../hooks/use-slots';

/**
 * Контроллер для выдвижной панели управления, размещенный ВНЕ LiveKitRoom
 * для предотвращения проблем с переподключением
 */ 
const ControlDrawer = ({ room, slotsState }: { room: Room; slotsState: ReturnType<typeof useSlots> }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Проверяем сохраненное состояние для инициализации
  const savedState = typeof window !== 'undefined' ? 
    window.sessionStorage.getItem('camera-state') : null;
    
  // Инициализируем камеру как выключенную по умолчанию
  // или используем сохраненное состояние, если оно есть
  const initialCameraState = savedState === 'true';
  
  console.log('Инициализация состояния камеры:', initialCameraState, 
              'на основе сохраненного значения:', savedState);
  
  const [cameraEnabled, setCameraEnabled] = useState(initialCameraState);
  
  // Состояние для выбора камеры
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  
  // Функция для получения списка доступных камер
  async function getCameras() {
    try {
      // Запрашиваем разрешение на использование камеры, если его еще нет
      await navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          // Закрываем потоки после получения разрешения
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
          console.error('Пользователь отклонил доступ к камере:', err);
        });
      
      // Теперь получаем список устройств
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Доступные камеры:', videoDevices);
      
      setCameras(videoDevices);
      
      // Проверяем, какая камера используется сейчас через медиа-треки
      if (room && room.localParticipant) {
        const videoTracks = room.localParticipant.getTrackPublications().filter(
          track => track.kind === 'video' && !track.isMuted && track.track
        );
        
        if (videoTracks.length > 0 && videoTracks[0].track) {
          try {
            const mediaStreamTrack = videoTracks[0].track.mediaStreamTrack;
            const trackSettings = mediaStreamTrack.getSettings();
            
            // Попробуем определить камеру сначала по deviceId
            if (trackSettings.deviceId) {
              const matchingCamera = videoDevices.find(d => d.deviceId === trackSettings.deviceId);
              if (matchingCamera) {
                console.log('Определена активная камера:', matchingCamera.label, 'deviceId:', matchingCamera.deviceId);
                setSelectedCamera(matchingCamera.deviceId);
                return videoDevices;
              }
            }
            
            // Если не удалось по deviceId, попробуем по label
            if (mediaStreamTrack.label) {
              // Сначала попробуем найти точное совпадение по названию
              const cameraLabel = mediaStreamTrack.label;
              console.log('Поиск камеры по label:', cameraLabel);
              
              // Поиск по полному названию
              const exactMatch = videoDevices.find(d => d.label === cameraLabel);
              if (exactMatch) {
                console.log('Найдено точное совпадение по названию:', exactMatch.label);
                setSelectedCamera(exactMatch.deviceId);
                return videoDevices;
              }
              
              // Поиск по частичному совпадению (первое слово названия)
              const firstWord = cameraLabel.split(' ')[0];
              const partialMatch = videoDevices.find(d => d.label && d.label.includes(firstWord));
              if (partialMatch) {
                console.log('Найдено частичное совпадение по названию:', partialMatch.label);
                setSelectedCamera(partialMatch.deviceId);
                return videoDevices;
              }
            }
            
            // Если по label не нашли, попробуем по groupId
            if (trackSettings.groupId) {
              const matchByGroup = videoDevices.find(d => d.groupId === trackSettings.groupId);
              if (matchByGroup) {
                console.log('Найдено совпадение по groupId:', matchByGroup.label);
                setSelectedCamera(matchByGroup.deviceId);
                return videoDevices;
              }
            }
            
            console.log('Не удалось определить активную камеру по параметрам:', 
                        'label:', mediaStreamTrack.label, 
                        'deviceId:', trackSettings.deviceId, 
                        'groupId:', trackSettings.groupId);
          } catch (err: unknown) {
            console.error('Ошибка при определении активной камеры через треки:', err);
          }
        }
      }
      
      // Если до сих пор не смогли определить активную камеру, используем первую доступную
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
        console.log('Выбрана камера по умолчанию:', videoDevices[0].deviceId);
      }
      
      return videoDevices;
    } catch (err: unknown) {
      console.error('Ошибка при получении списка камер:', err);
      return [];
    }
  }
  
  // Получаем список доступных камер при монтировании и когда обновляется разрешение на доступ
  useEffect(() => {
    // Первый запрос при загрузке
    getCameras();
    
    // Также делаем повторные запросы на определение активной камеры
    // с некоторыми интервалами, чтобы гарантированно определить текущую камеру
    const delayedRequest1 = setTimeout(() => {
      getCameras();
    }, 1000);
    
    const delayedRequest2 = setTimeout(() => {
      getCameras();
    }, 2000);
    
    const delayedRequest3 = setTimeout(() => {
      getCameras();
    }, 3000);
    
    return () => {
      clearTimeout(delayedRequest1);
      clearTimeout(delayedRequest2);
      clearTimeout(delayedRequest3);
    };
  }, []);
  
  // Обработчик отключения для сохранения состояния камеры
  useEffect(() => {
    if (room) {
      console.log('Настраиваем обработчик разъединения для комнаты LiveKit');
      
      const handleDisconnected = () => {
        console.log('Обнаружено отключение от комнаты LiveKit');
        // Сохраняем последнее состояние камеры
        const savedState = window.sessionStorage.getItem('camera-state');
        console.log('При отключении: сохраняем состояние камеры:', savedState);
      };
      
      // Добавляем слушатель события отключения
      room.on('disconnected', handleDisconnected);
      
      // Удаляем слушатель при размонтировании
      return () => {
        room.off('disconnected', handleDisconnected);
      };
    }
  }, [room]);
  
  // Обновляем статус камеры при изменении состояния локального участника
  useEffect(() => {
    const updateCameraState = () => {
      if (room && room.localParticipant) {
        // Защищаем от слишком частых вызовов
        const now = Date.now();
        const lastUpdateTime = parseInt(sessionStorage.getItem('last-camera-update') || '0', 10);
        
        // Если прошло менее 200 мс с последнего обновления, пропускаем
        if (now - lastUpdateTime < 200) {
          return;
        }
        sessionStorage.setItem('last-camera-update', String(now));
        
        // Проверка состояния камеры напрямую через видеотреки (более надежный способ)
        const hasActiveVideoTracks = room.localParticipant
          .getTrackPublications()
          .some(track => track.kind === 'video' && !track.isMuted && track.track);
        
        // По умолчанию используем API статус для синхронизации UI
        const apiCameraEnabled = room.localParticipant.isCameraEnabled;
        
        // Проверяем первое ли это подключение
        const isFirstConnection = !window.sessionStorage.getItem('camera-state-initialized');
        
        // Получаем сохраненное состояние камеры из sessionStorage
        const savedCameraState = window.sessionStorage.getItem('camera-state');
        const hasSavedState = savedCameraState !== null;
        
        // Определяем эффективное состояние камеры с учетом всех факторов
        let effectiveState: boolean;
        
        // Проверяем, было ли недавно ручное переключение камеры пользователем
        const lastManualToggleTime = parseInt(sessionStorage.getItem('last-camera-toggle') || '0', 10);
        const recentManualToggle = now - lastManualToggleTime < 5000; // Последние 5 секунд
        
        if (recentManualToggle && hasSavedState) {
          // Если было недавнее ручное переключение, приоритет у сохраненного состояния
          effectiveState = savedCameraState === 'true';
          console.log('Используется сохраненное состояние после ручного переключения:', effectiveState);
        } else if (hasSavedState && !isFirstConnection) {
          // В обычном режиме восстановления проверяем физическое состояние треков
          const physicalState = hasActiveVideoTracks;
          
          // Если физическое состояние противоречит сохраненному, доверяем физическому
          if (physicalState !== (savedCameraState === 'true')) {
            console.log('Физическое состояние камеры не соответствует сохраненному, используем физическое');
            effectiveState = physicalState;
            
            // Обновляем сохраненное состояние
            window.sessionStorage.setItem('camera-state', String(effectiveState));
          } else {
            // Если нет противоречий, используем сохраненное
            effectiveState = savedCameraState === 'true';
            console.log('Используется сохраненное состояние камеры:', effectiveState);
          }
        } else if (isFirstConnection) {
          // При первом подключении камера всегда выключена
          effectiveState = false;
        } else {
          // В других случаях используем физическое состояние
          effectiveState = hasActiveVideoTracks;
        }
        
        // Отмечаем, что инициализация прошла
        if (isFirstConnection) {
          window.sessionStorage.setItem('camera-state-initialized', 'true');
        }
        
        console.log('Состояние камеры обновлено:', 
                    'треки:', hasActiveVideoTracks, 
                    'API:', apiCameraEnabled,
                    'сохраненное:', hasSavedState ? savedCameraState : 'нет',
                    'итоговое:', effectiveState,
                    'первое подключение:', isFirstConnection);
        
        // Устанавливаем состояние в UI
        setCameraEnabled(effectiveState);
        
        // Если мы восстанавливаем состояние и камера должна быть включена, 
        // но физически выключена, включаем её через LiveKit API
        if (hasSavedState && effectiveState && !hasActiveVideoTracks && !apiCameraEnabled && !recentManualToggle) {
          console.log('Восстанавливаю сохраненное состояние камеры: включение');
          
          // Применяем более защищенный подход с проверкой таймаута
          const cameraTimeoutMs = 6000; // 6 секунд таймаут для включения
          
          setTimeout(() => {
            try {
              const cameraPromise = room.localParticipant.setCameraEnabled(true);
              Promise.race([
                cameraPromise.then(() => {
                  console.log('Камера успешно включена после переподключения');
                  // Синхронизируем с WebSocket
                  if (slotsState && typeof slotsState.setCameraState === 'function') {
                    slotsState.setCameraState(true);
                  }
                }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Camera enable timeout')), cameraTimeoutMs)
                )
              ]).catch((err: unknown) => {
                const errorMessage = err instanceof Error ? err.message : String(err);
                if (errorMessage === 'Camera enable timeout') {
                  console.warn('Превышено время ожидания включения камеры после переподключения');
                  // Обновляем состояние в UI и хранилище
                  setCameraEnabled(false);
                  window.sessionStorage.setItem('camera-state', 'false');
                } else {
                  console.error('Ошибка при восстановлении состояния камеры:', err);
                }
              });
            } catch (err: unknown) {
              console.error('Ошибка при попытке восстановить состояние камеры:', err);
            }
          }, 1000); // Задержка для стабильности
        }
        
        // Этот вызов только обновляет список доступных камер и определяет текущую активную
        // Вызываем только если камера включена, чтобы избежать сброса на другую камеру
        if (effectiveState || hasActiveVideoTracks) {
          getCameras();
        }
      }
    };
    
    // Слушаем изменения состояния камеры
    if (room && room.localParticipant) {
      room.localParticipant.on('trackMuted', updateCameraState);
      room.localParticipant.on('trackUnmuted', updateCameraState);
      room.localParticipant.on('trackPublished', updateCameraState);
      room.localParticipant.on('trackUnpublished', updateCameraState);
      
      // ПРИНУДИТЕЛЬНО устанавливаем камеру как выключенную при инициализации,
      // но только если нет сохраненного состояния
      const savedState = window.sessionStorage.getItem('camera-state');
      if (savedState !== 'true') {
        setCameraEnabled(false);
      }
      
      // Вызываем немедленно для обновления состояния
      updateCameraState();
      
      // Дополнительно проверяем состояние иконки после небольшой задержки
      setTimeout(() => {
        // Проверяем на рассогласование и если есть - исправляем
        const realCameraState = room.localParticipant.isCameraEnabled;
        
        // Для выключенной камеры всегда устанавливаем значение false,
        // даже если реально она ещё не отключилась полностью
        if (cameraEnabled !== realCameraState) {
          console.log('Обнаружено рассогласование - синхронизируем UI с реальным состоянием камеры');
          setCameraEnabled(realCameraState);
          // Обновляем сохраненное состояние
          window.sessionStorage.setItem('camera-state', String(realCameraState));
        }
      }, 1500);
    }
    
    return () => {
      if (room && room.localParticipant) {
        room.localParticipant.off('trackMuted', updateCameraState);
        room.localParticipant.off('trackUnmuted', updateCameraState);
        room.localParticipant.off('trackPublished', updateCameraState);
        room.localParticipant.off('trackUnpublished', updateCameraState);
      }
    }
  }, [room, slotsState]);
  
  // Функция переключения камеры с использованием прямого управления треками
  // (рекомендованный подход без использования setCameraEnabled)
  const toggleCamera = async () => {
    if (room && room.localParticipant) {
      // Получаем текущий идентификатор пользователя
      const currentUserId = window.currentUserIdentity || '';
      
      // Определяем текущее состояние камеры по наличию активных треков
      const hasActiveVideoTracks = room.localParticipant
        .getTrackPublications()
        .some(track => track.kind === 'video' && !track.isMuted && track.track);
      
      // Новое состояние - обратное текущему
      const newCameraState = !hasActiveVideoTracks;
      console.log('ПЕРЕКЛЮЧЕНИЕ КАМЕРЫ: текущее состояние:', hasActiveVideoTracks, 'новое:', newCameraState);
      
      // Проверяем, не слишком ли быстро переключаем камеру
      const lastToggleTime = parseInt(sessionStorage.getItem('last-camera-toggle') || '0', 10);
      const currentTime = Date.now();
      
      if (currentTime - lastToggleTime < 2000) { // 2 секунды защиты
        console.log('ЗАЩИТА: Слишком частое переключение камеры, игнорируем');
        return; // Игнорируем частые переключения
      }
      
      // Запоминаем время последнего переключения
      sessionStorage.setItem('last-camera-toggle', String(currentTime));
      
      // Обновляем UI немедленно для лучшего UX
      setCameraEnabled(newCameraState);
      
      // Сохраняем состояние для восстановления при перезагрузке
      window.sessionStorage.setItem('camera-state', String(newCameraState));
      console.log('Сохранено ЛОКАЛЬНОЕ состояние камеры:', newCameraState);
      
      try {
        // НОВЫЙ ПОДХОД: Используем прямое управление треками вместо setCameraEnabled
        
        if (newCameraState) {
          // ВКЛЮЧЕНИЕ КАМЕРЫ - создаем и публикуем новый трек
          
          try {
            // Проверяем разрешения камеры
            console.log('Проверяем разрешение на использование камеры...');
            await navigator.mediaDevices.getUserMedia({ video: true })
              .then(stream => {
                // Освобождаем ресурсы тестового стрима
                stream.getTracks().forEach(track => track.stop());
                console.log('Разрешение на использование камеры получено');
              })
              .catch(err => {
                console.error('Ошибка получения разрешения камеры:', err);
                // Сбрасываем UI в случае отказа в разрешении
                setCameraEnabled(false);
                window.sessionStorage.setItem('camera-state', 'false');
                throw new Error('Доступ к камере отклонен');
              });
            
            // Создаем новый видеотрек
            console.log('Создаем новый видеотрек...');
            
            // Если есть сохраненная камера, используем её
            const lastActiveCamera = localStorage.getItem('last-active-camera');
            const deviceId = selectedCamera || lastActiveCamera || undefined;
            
            // Создаем опции с выбранной камерой, если есть
            const trackOptions: any = {};
            if (deviceId) {
              trackOptions.deviceId = deviceId;
              console.log('Используем сохраненную камеру:', deviceId);
            }
            
            // Создаем видеотрек с помощью встроенной функции LiveKit
            console.log('Создаем видеотрек с помощью createLocalVideoTrack...');
            const videoTrack = await createLocalVideoTrack(trackOptions);
            
            // Публикуем трек
            console.log('Публикуем видеотрек...');
            await room.localParticipant.publishTrack(videoTrack);
            
            console.log('Видеотрек успешно опубликован');
            
            // Даем немного времени на обработку
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Обновляем список камер
            setTimeout(() => getCameras(), 200);
            
          } catch (err) {
            console.error('Ошибка при включении камеры:', err);
            // Сбрасываем UI обратно при ошибке
            setCameraEnabled(false);
            window.sessionStorage.setItem('camera-state', 'false');
            return;
          }
          
        } else {
          // ВЫКЛЮЧЕНИЕ КАМЕРЫ - отписываем все видеотреки
          
          console.log('Отключаем все видеотреки...');
          
          // Получаем все текущие видеотреки
          const videoTracks = room.localParticipant
            .getTrackPublications()
            .filter(track => track.kind === 'video');
          
          // Сохраняем текущую активную камеру перед отключением
          if (selectedCamera) {
            localStorage.setItem('last-active-camera', selectedCamera);
            console.log('Сохранили последнюю активную камеру:', selectedCamera);
          }
          
          // Отписываем каждый трек
          for (const trackPub of videoTracks) {
            try {
              if (trackPub.track) {
                console.log('Отписываем трек:', trackPub.trackSid);
                await room.localParticipant.unpublishTrack(trackPub.track);
                
                // Останавливаем трек для освобождения ресурсов
                if (trackPub.track && 'stop' in trackPub.track) {
                  trackPub.track.stop();
                }
              }
            } catch (err) {
              console.error('Ошибка при отписке трека:', err);
            }
          }
          
          console.log('Все видеотреки отключены');
        }
        
        // После успешного переключения синхронизируем состояние через WebSocket
        if (slotsState && typeof slotsState.setCameraState === 'function') {
          console.log('Синхронизируем состояние камеры через WebSocket:', newCameraState);
          
          // Отправляем состояние другим клиентам
          slotsState.setCameraState(newCameraState);
        }
        
        // Проверяем окончательное состояние после всех операций
        setTimeout(() => {
          const finalActiveState = room.localParticipant
            .getTrackPublications()
            .some(track => track.kind === 'video' && !track.isMuted && track.track);
          
          if (finalActiveState !== newCameraState) {
            console.log('Состояние камеры и UI рассинхронизированы, исправляем:', 
                        'реальное:', finalActiveState, 'ожидаемое:', newCameraState);
            setCameraEnabled(finalActiveState);
            window.sessionStorage.setItem('camera-state', String(finalActiveState));
          }
        }, 1000);
        
      } catch (err) {
        console.error('Критическая ошибка переключения камеры:', err);
        // Восстанавливаем состояние UI при ошибке
        setTimeout(() => {
          const realState = room.localParticipant
            .getTrackPublications()
            .some(track => track.kind === 'video' && !track.isMuted && track.track);
          
          setCameraEnabled(realState);
          window.sessionStorage.setItem('camera-state', String(realState));
        }, 500);
      }
    }
  };
  
  // Функция для смены используемой камеры
  const switchCamera = async (deviceId: string) => {
    if (room && room.localParticipant) {
      try {
        console.log('Переключаем на камеру с ID:', deviceId);
        
        // Находим камеру по deviceId для получения дополнительной информации
        const selectedCameraInfo = cameras.find(cam => cam.deviceId === deviceId);
        
        // Обновляем UI немедленно
        setSelectedCamera(deviceId);
        
        // Самый простой способ - использовать стандартный API LiveKit
        // для переключения камеры с новыми опциями
        await room.switchActiveDevice('videoinput', deviceId);
        
        console.log('Камера успешно переключена на:', selectedCameraInfo?.label || deviceId);
        
        // Повторно запрашиваем списки камер сразу после переключения
        // и снова через небольшой промежуток времени для гарантии синхронизации
        setTimeout(() => {
          getCameras();
          
          // Еще одна проверка через полсекунды для надежности
          setTimeout(getCameras, 500);
        }, 100);
      } catch (err: unknown) {
        console.error('Ошибка при переключении камеры:', err);
      }
    }
  };
  
  // Закрытие панели по Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Выдвижная панель управления */}
      <div 
        className={`control-drawer ${isOpen ? 'open' : ''}`}
      >
        <div className="controls-container">
          <div className="left-controls">
            <button 
              className="control-button" 
              aria-label="Toggle Camera"
              onClick={toggleCamera}
            >
              {cameraEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7 16 12 23 17z"></path>
                  <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <path d="M23 7 16 12 23 17z"></path>
                  <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2"></line>
                </svg>
              )}
            </button>
            
            {/* Селектор камеры */}
            {cameras.length > 1 && (
              <div className="camera-selector">
                <select
                  className="select-camera"
                  value={selectedCamera || ''}
                  onChange={(e) => switchCamera(e.target.value)}
                  key={selectedCamera || 'default-camera'}
                >
                  {cameras.map(camera => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Камера ${cameras.indexOf(camera) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="right-controls">
            <button 
              className="control-button danger" 
              aria-label="Leave Room"
              onClick={() => {
                if (room) {
                  // Создаем и диспатчим событие для оповещения о выходе из комнаты
                  const event = new Event('roomDisconnected');
                  window.dispatchEvent(event);
                  
                  // Отключаемся от комнаты
                  room.disconnect();
                  
                  // Редирект на главную (на случай, если слушатель событий не сработает)
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 300);
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" x2="9" y1="12" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Кнопка-триггер для открытия/закрытия панели */}
      <div className="drawer-trigger-container">
        <button 
          className="drawer-trigger"
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие
            setIsOpen(!isOpen);
          }}
          aria-label="Toggle Controls"
        >
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}
        </button>
      </div>
    </>
  );
};

/**
 * Компонент для видеоконференции LiveKit с поддержкой E2EE
 * Основан на оригинальном коде MafiaLive
 */
export function VideoConferenceClient(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  // Состояние для уникальной идентификации пользователя
  
  // Создаем Worker для E2EE
  const worker =
    typeof window !== 'undefined' &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const keyProvider = new ExternalE2EEKeyProvider();

  // Проверяем, есть ли passphrase в хеше URL
  const e2eePassphrase =
    typeof window !== 'undefined' ? decodePassphrase(window.location.hash.substring(1)) : undefined;
  const e2eeEnabled = !!(e2eePassphrase && worker);
  
  // Настраиваем параметры комнаты (с дополнительными параметрами для надежности)
  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec: props.codec,
      },
      // Добавляем параметры для стабильной работы с камерами
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      // Критически важные параметры для стабильности подключения
      stopLocalTrackOnUnpublish: true, // Предотвращает проблемы с переключением треков
      disconnectOnPageLeave: false, // Предотвращает автоматические дисконнекты
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, [e2eeEnabled, keyProvider, worker, props.codec]);

  // Создаем комнату с заданными параметрами
  const room = useMemo(() => new Room(roomOptions), [roomOptions]);
  
  // Применяем шифрование, если оно включено
  if (e2eeEnabled && e2eePassphrase) {
    keyProvider.setKey(e2eePassphrase);
    room.setE2EEEnabled(true);
  }
  
  // Генерируем и инициализируем идентификатор пользователя
  const userId = useMemo(() => {
    if (typeof window !== 'undefined') {
      // Проверка на существование глобальной переменной
      if (!window.currentUserIdentity) {
        // Проверяем, есть ли идентификатор в localStorage
        const storedId = window.localStorage.getItem('user-identity');
        
        if (storedId) {
          // Используем сохранённый ID
          console.log(`Используем сохранённый идентификатор: ${storedId}`);
          window.currentUserIdentity = storedId;
        } else {
          // Генерация нового уникального ID
          const newId = `User-${Math.floor(Math.random() * 10000)}-${Math.floor(Math.random() * 10000)}`;
          console.log(`Сгенерирован новый идентификатор: ${newId}`);
          window.localStorage.setItem('user-identity', newId);
          window.currentUserIdentity = newId;
        }
      }
      
      // Теперь у нас точно есть идентификатор в window.currentUserIdentity
      return window.currentUserIdentity;
    }
    return 'unknown-user';
  }, []);
  
  // Используем хук для слотов
  const slotsState = useSlots(userId);
  
  // Отслеживаем идентификатор LiveKit после подключения к комнате
  useEffect(() => {
    if (room && room.localParticipant) {
      const livekitId = room.localParticipant.identity;
      
      if (livekitId && livekitId !== 'undefined') {
        console.log(`Обнаружен идентификатор LiveKit: ${livekitId}`);
        
        // Если идентификаторы отличаются, обновляем глобальную переменную и localStorage
        if (livekitId !== window.currentUserIdentity) {
          console.log(`Синхронизирую идентификаторы: LiveKit=${livekitId}, текущий=${window.currentUserIdentity}`);
          window.localStorage.setItem('user-identity', livekitId);
          window.currentUserIdentity = livekitId;
          
          // Заново регистрируем пользователя с новым ID через WebSocket
          if (slotsState.connected && slotsState.registerUser) {
            console.log('Переопределяем регистрацию с новым идентификатором LiveKit');
            slotsState.registerUser();
          }
        }
      }
    }
  }, [room?.localParticipant, slotsState]);
  
  // Автоматически регистрируем пользователя при подключении
  useEffect(() => {
    if (slotsState.connected) {
      // При необходимости можно добавить дополнительную логику
    }
  }, [slotsState.connected]);
  
  // Параметры подключения к комнате
  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  return (
    <>
      <LiveKitRoom
        room={room}
        token={props.token}
        connectOptions={connectOptions}
        serverUrl={props.liveKitUrl}
        audio={false}
        video={false}
      >
        <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">        
          {/* Main content with custom grid */}
          <main className="flex-1 relative overflow-y-auto mobile-scroller">
            <CustomVideoGrid />
          </main>
        </div>
      </LiveKitRoom>
      
      {/* Рендерим элементы управления отдельно */}
      <ControlDrawer room={room} slotsState={slotsState} />
    </>
  );
}