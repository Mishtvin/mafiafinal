/**
 * Утилиты для оптимизации производительности видеоконференции
 */

/**
 * Debounce функция - откладывает вызов функции до тех пор, пока не пройдет указанное время
 * после последнего вызова. Полезно для предотвращения частых обновлений при быстрых 
 * последовательных событиях (например, изменение размера окна).
 *
 * @param fn Функция для debounce
 * @param delay Задержка в миллисекундах
 * @returns Функция с debounce
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle функция - ограничивает количество вызовов функции в единицу времени.
 * Гарантирует, что функция вызывается не чаще, чем раз в указанный промежуток времени.
 * Полезно для обработки частых событий (например, событий мыши).
 *
 * @param fn Функция для throttle
 * @param limit Ограничение в миллисекундах
 * @returns Функция с throttle
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number = 300
): (...args: Parameters<T>) => void {
  let throttling = false;
  
  return function(...args: Parameters<T>): void {
    if (!throttling) {
      fn(...args);
      throttling = true;
      
      setTimeout(() => {
        throttling = false;
      }, limit);
    }
  };
}

/**
 * Класс "пульса" соединения - периодически вызывает функцию проверки
 * с адаптивными интервалами на основе состояния соединения.
 */
export class ConnectionPulse {
  private checkFn: () => void;
  private defaultInterval: number;
  private currentInterval: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning: boolean = false;
  private consecutiveFailures: number = 0;
  private maxFailures: number = 5;
  
  /**
   * @param checkFn Функция проверки соединения
   * @param defaultInterval Интервал проверки по умолчанию в мс
   */
  constructor(checkFn: () => void, defaultInterval: number = 10000) {
    this.checkFn = checkFn;
    this.defaultInterval = defaultInterval;
    this.currentInterval = defaultInterval;
  }
  
  /**
   * Запускает пульс
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.pulse();
  }
  
  /**
   * Останавливает пульс
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
  
  /**
   * Сообщает о проблеме соединения, что приводит к более частым проверкам
   */
  reportFailure(): void {
    this.consecutiveFailures++;
    
    // Уменьшаем интервал при проблемах (но не меньше 2 секунд)
    if (this.consecutiveFailures > 0 && this.consecutiveFailures <= this.maxFailures) {
      // Экспоненциальное уменьшение интервала с минимумом 2 секунды
      this.currentInterval = Math.max(
        2000,
        this.defaultInterval / Math.pow(2, this.consecutiveFailures)
      );
      
      console.log(`Проблема соединения #${this.consecutiveFailures}. Интервал проверки уменьшен до ${this.currentInterval}ms`);
    }
  }
  
  /**
   * Сообщает об успешном соединении, возвращает интервал к нормальному
   */
  reportSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
      this.currentInterval = this.defaultInterval;
      console.log(`Соединение восстановлено. Интервал проверки возвращен к ${this.defaultInterval}ms`);
    }
  }
  
  /**
   * Внутренний метод для выполнения пульса
   */
  private pulse(): void {
    if (!this.isRunning) return;
    
    try {
      // Выполняем функцию проверки
      this.checkFn();
    } catch (error) {
      console.error('Ошибка при проверке соединения:', error);
      this.reportFailure();
    }
    
    // Планируем следующую проверку
    this.timerId = setTimeout(() => this.pulse(), this.currentInterval);
  }
}

/**
 * Стратегия экспоненциального отката для повторных попыток
 */
export class ExponentialBackoffStrategy {
  private initialDelay: number;
  private maxDelay: number;
  private factor: number;
  private attempts: number = 0;
  
  /**
   * @param initialDelay Начальная задержка в мс
   * @param maxDelay Максимальная задержка в мс
   * @param factor Множитель для экспоненциального роста
   */
  constructor(
    initialDelay: number = 1000,
    maxDelay: number = 30000,
    factor: number = 2
  ) {
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.factor = factor;
  }
  
  /**
   * Сбрасывает счетчик попыток
   */
  reset(): void {
    this.attempts = 0;
  }
  
  /**
   * Получает задержку для текущей попытки и увеличивает счетчик
   * @returns Задержка в миллисекундах
   */
  getDelay(): number {
    // Вычисляем задержку с экспоненциальным ростом: initialDelay * (factor ^ attempts)
    const delay = Math.min(
      this.maxDelay,
      this.initialDelay * Math.pow(this.factor, this.attempts)
    );
    
    // Увеличиваем счетчик для следующей попытки
    this.attempts++;
    
    return delay;
  }
}