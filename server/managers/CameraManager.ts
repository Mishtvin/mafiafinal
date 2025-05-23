import { globalEvents } from './EventEmitter';

/**
 * Менеджер камер - управляет состоянием камер пользователей
 */
export class CameraManager {
  // Хранилище состояний камер пользователей (userId -> состояние камеры)
  private cameraStates = new Map<string, boolean>();

  constructor() {
    console.log('CameraManager: Инициализирован');
  }

  /**
   * Получить все текущие состояния камер
   */
  getAllCameraStates(): Record<string, boolean> {
    const states: Record<string, boolean> = {};
    this.cameraStates.forEach((isEnabled, userId) => {
      states[userId] = isEnabled;
    });
    return states;
  }

  /**
   * Получить состояние камеры пользователя
   * @param userId Идентификатор пользователя
   * @returns Статус камеры или undefined, если статус не найден
   */
  getCameraState(userId: string): boolean | undefined {
    return this.cameraStates.get(userId);
  }

  // Оптимизация: добавляем защиту от слишком частых обновлений
  private lastCameraUpdates = new Map<string, number>();
  private readonly updateThreshold = 500; // ms
  
  /**
   * Установить состояние камеры пользователя с защитой от слишком частых обновлений
   * @param userId Идентификатор пользователя
   * @param isEnabled Новое состояние камеры
   */
  setCameraState(userId: string, isEnabled: boolean): void {
    const oldState = this.cameraStates.get(userId);
    
    // Если состояние не изменилось, ничего не делаем
    if (oldState === isEnabled) {
      return;
    }
    
    // Проверяем, не было ли недавно обновления для этого пользователя
    const now = Date.now();
    const lastUpdate = this.lastCameraUpdates.get(userId) || 0;
    
    if (now - lastUpdate < this.updateThreshold) {
      console.log(`Слишком частое обновление камеры для ${userId}, пропускаем (прошло ${now - lastUpdate}ms)`);
      return;
    }
    
    // Обновляем состояние и время последнего обновления
    this.cameraStates.set(userId, isEnabled);
    this.lastCameraUpdates.set(userId, now);
    
    console.log(`Камера пользователя ${userId} ${isEnabled ? 'включена' : 'выключена'}`);
    
    // Отправляем только изменение к самому пользователю и его подключениям,
    // но не к другим клиентам. Информацию о чужой камере пользователь получит только
    // при переподключении или специальных запросах состояния.
    // 
    // Это решает проблему мигания камер при подключении новых пользователей.
    globalEvents.emit("camera_state_changed_for_" + userId, userId, isEnabled);
    
    // Отправляем глобальное событие об изменении состояния всех камер
    globalEvents.emit("cameras_updated", this.getAllCameraStates());
    
    // Логируем состояние для отладки
    console.log('Текущие состояния камер:', JSON.stringify(this.getAllCameraStates()));
  }

  /**
   * Выключить камеру пользователя (используется при неактивности)
   * @param userId Идентификатор пользователя
   */
  disableCamera(userId: string): void {
    if (this.cameraStates.get(userId) === true) {
      this.setCameraState(userId, false);
      console.log(`Камера пользователя ${userId} автоматически выключена из-за неактивности`);
    }
  }

  /**
   * Удалить информацию о состоянии камеры пользователя
   * @param userId Идентификатор пользователя
   */
  removeCameraState(userId: string): void {
    if (this.cameraStates.has(userId)) {
      this.cameraStates.delete(userId);
      this.lastCameraUpdates.delete(userId); // Очищаем историю обновлений
      console.log(`Удалена информация о камере пользователя ${userId}`);
      
      // Отправляем событие только для специфичных подписчиков этого пользователя
      // Используем специфичный эвент, который не влияет на других пользователей
      setTimeout(() => {
        // Отправляем уведомление только для этого пользователя
        globalEvents.emit("camera_state_changed_for_" + userId, userId, false);
        
        // Отправляем глобальное событие об изменении состояния всех камер
        globalEvents.emit("cameras_updated", this.getAllCameraStates());
      }, 200);
      
      // Логируем состояние для отладки
      console.log('Текущие состояния камер после удаления:', JSON.stringify(this.getAllCameraStates()));
    }
  }

  /**
   * Инициализировать состояние камеры для нового пользователя
   * @param userId Идентификатор пользователя
   */
  initializeUserCamera(userId: string): void {
    if (!this.cameraStates.has(userId)) {
      // По умолчанию камера ВКЛЮЧЕНА при подключении нового пользователя
      this.cameraStates.set(userId, true);
      
      // Устанавливаем метку времени начальной инициализации
      this.lastCameraUpdates.set(userId, Date.now());
      
      console.log(`Инициализировано состояние камеры для нового пользователя ${userId} (включена)`);
      
      // При инициализации НЕ отправляем уведомление о состоянии камеры всем клиентам
      // Только сохраняем локальное значение. Обновления для других клиентов будут 
      // отправлены в registerConnection, когда всем клиентам отправляются текущие состояния
      
      // Отправляем глобальное событие об изменении состояния всех камер
      globalEvents.emit("cameras_updated", this.getAllCameraStates());
      
      // Логируем состояние для отладки
      console.log('Текущие состояния камер после инициализации:', JSON.stringify(this.getAllCameraStates()));
    }
  }
  
  /**
   * Получить количество активных камер (включенных)
   * @returns Количество активных камер
   */
  getActiveCamerasCount(): number {
    let count = 0;
    this.cameraStates.forEach((isEnabled) => {
      if (isEnabled) {
        count++;
      }
    });
    return count;
  }
}

// Создаем глобальный экземпляр менеджера камер
export const cameraManager = new CameraManager();