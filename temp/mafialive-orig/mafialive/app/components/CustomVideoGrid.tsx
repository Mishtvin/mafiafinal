

'use client';

import React from 'react';
import { useParticipants } from '@livekit/components-react';

export default function CustomVideoGrid() {
  const participants = useParticipants();
  const totalSlots = 12;

  return (
    <div
      className="video-grid-custom"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        padding: '8px',
        height: '100%',
        backgroundColor: '#111',
      }}
    >
      {/* 🔧 Отладочная информация */}
      <div
        style={{
          gridColumn: 'span 4',
          backgroundColor: '#333',
          color: '#0f0',
          padding: '6px',
          fontSize: '14px',
          textAlign: 'center',
        }}
      >
        [DEBUG] CustomVideoGrid: Участников: {participants.length}
      </div>

      {/* Слоты */}
      {Array.from({ length: totalSlots }, (_, index) => {
        const participant = participants[index];
        return (
          <div
            key={participant ? participant.sid : `placeholder-${index}`}
            style={{
              background: participant ? '#222' : '#444',
              border: '1px dashed #888',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '150px',
              fontSize: '16px',
            }}
          >
            {participant ? `👤 ${participant.identity}` : `🕓 Slot ${index + 1}`}
          </div>
        );
      })}
    </div>
  );
}
