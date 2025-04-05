/**
 * Простая система событий для коммуникации между модулями
 */
export type EventListener = (...args: any[]) => void;

export class EventEmitter {
  private listeners: Record<string, EventListener[]> = {};

  /**
   * Подписаться на событие
   * @param event Имя события
   * @param listener Функция-обработчик
   */
  on(event: string, listener: EventListener): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  /**
   * Отписаться от события
   * @param event Имя события
   * @param listener Функция-обработчик для удаления
   */
  off(event: string, listener: EventListener): this {
    if (!this.listeners[event]) {
      return this;
    }
    
    const idx = this.listeners[event].indexOf(listener);
    if (idx !== -1) {
      this.listeners[event].splice(idx, 1);
    }
    return this;
  }

  /**
   * Вызвать событие
   * @param event Имя события
   * @param args Аргументы для передачи слушателям
   */
  emit(event: string, ...args: any[]): boolean {
    if (!this.listeners[event]) {
      return false;
    }
    
    this.listeners[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Ошибка в обработчике события ${event}:`, error);
      }
    });
    
    return true;
  }
}

// Создаем глобальный экземпляр системы событий
export const globalEvents = new EventEmitter();