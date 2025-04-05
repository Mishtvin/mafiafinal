'use client';

import { useEffect } from 'react';

export default function MediaOverride() {
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const originalGetUserMedia =
        navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (constraints) {
          // Если аудио запрашивается, отключаем его.
          if (constraints.audio) {
            constraints.audio = false;
          }
          // Если ни аудио, ни видео не запрашиваются, задаем video: true.
          if (
            (constraints.audio === false || constraints.audio == null) &&
            (constraints.video === false || constraints.video == null)
          ) {
            constraints.video = true;
          }
        }
        return originalGetUserMedia(constraints);
      };
    }
  }, []);

  return null;
}
