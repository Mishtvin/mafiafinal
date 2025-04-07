import { VideoCodec } from 'livekit-client';

/**
 * Функция для определения доступности видеокодеков в браузере
 * @returns Promise, который резолвится с массивом поддерживаемых кодеков
 */
async function getSupportedCodecs(): Promise<VideoCodec[]> {
  const supported: VideoCodec[] = [];
  
  // Проверяем поддержку VP8 (поддерживается практически везде)
  supported.push('vp8');
  
  // Создаем тестовый RTCPeerConnection для проверки поддержки кодеков
  const pc = new RTCPeerConnection();
  
  try {
    // Проверяем VP9
    const vpTest = pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false
    });
    const offerVp9 = await vpTest;
    
    if (offerVp9.sdp && offerVp9.sdp.includes('VP9')) {
      supported.push('vp9');
    }
    
    // Проверяем AV1
    // AV1 обычно самый новый и имеет меньшую поддержку
    if (offerVp9.sdp && offerVp9.sdp.includes('AV1')) {
      supported.push('av1');
    }
    
    // Проверяем H.264
    if (offerVp9.sdp && (offerVp9.sdp.includes('H264') || offerVp9.sdp.includes('h264'))) {
      supported.push('h264');
    }
  } catch (e) {
    console.error('Ошибка при определении поддерживаемых кодеков:', e);
  } finally {
    // Закрываем соединение
    pc.close();
  }
  
  return supported;
}

/**
 * Определяет оптимальный кодек в зависимости от устройства и браузера
 * Приоритет: AV1 > VP9 > VP8 > H.264
 */
export async function getOptimalCodec(): Promise<VideoCodec> {
  try {
    const supported = await getSupportedCodecs();
    console.log('Поддерживаемые кодеки:', supported);
    
    // Проверяем наличие мобильного устройства
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Определяем производительность устройства (упрощенно)
    const isLowPower = isMobile || navigator.hardwareConcurrency <= 4;
    
    if (isLowPower) {
      // Для устройств с низкой производительностью используем VP8
      console.log('Выбран VP8 из-за ограниченной производительности устройства');
      return 'vp8';
    }
    
    // Для высокопроизводительных устройств выбираем наилучший доступный кодек
    if (supported.includes('av1')) {
      console.log('Выбран AV1 (максимальное качество)');
      return 'av1';
    }
    
    if (supported.includes('vp9')) {
      console.log('Выбран VP9 (хороший баланс качества и производительности)');
      return 'vp9';
    }
    
    if (supported.includes('vp8')) {
      console.log('Выбран VP8 (высокая совместимость)');
      return 'vp8';
    }
    
    // В крайнем случае выбираем H.264
    if (supported.includes('h264')) {
      console.log('Выбран H.264 (запасной вариант)');
      return 'h264';
    }
    
    // Если ничего не подошло, возвращаем VP8 как самый совместимый
    console.log('Выбран VP8 (по умолчанию)');
    return 'vp8';
  } catch (e) {
    console.error('Ошибка при определении оптимального кодека:', e);
    // По умолчанию используем VP8 в случае ошибки (наиболее совместимый)
    return 'vp8';
  }
}