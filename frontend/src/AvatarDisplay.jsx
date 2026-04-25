import React, { useRef, useEffect } from 'react';
import './AvatarDisplay.css';

export default function AvatarDisplay({ isSpeaking, isListening }) {
  const mouthRef = useRef(null);
  const eyesRef = useRef(null);

  useEffect(() => {
    if (!mouthRef.current) return;

    if (isSpeaking) {
      mouthRef.current.classList.add('talking');
    } else {
      mouthRef.current.classList.remove('talking');
    }
  }, [isSpeaking]);

  useEffect(() => {
    if (!eyesRef.current) return;

    if (isListening) {
      eyesRef.current.classList.add('listening');
    } else {
      eyesRef.current.classList.remove('listening');
    }
  }, [isListening]);

  return (
    <div className="avatar-display">
      <div className={`avatar-wrapper ${isListening ? 'listening' : ''}`}>
        <svg
          ref={mouthRef}
          className={`rosie-svg ${isSpeaking ? 'talking' : ''}`}
          viewBox="0 0 300 400"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base/Stand */}
          <ellipse cx="150" cy="360" rx="70" ry="20" fill="#1a1a1a" />
          <rect x="140" y="340" width="20" height="30" fill="#2a2a2a" />
          <rect x="160" y="340" width="20" height="30" fill="#2a2a2a" />

          {/* Feet */}
          <ellipse cx="130" cy="355" rx="15" ry="12" fill="#0066cc" />
          <ellipse cx="170" cy="355" rx="15" ry="12" fill="#0066cc" />

          {/* Body */}
          <circle cx="150" cy="200" r="80" fill="#5599ff" stroke="#4488ee" strokeWidth="2" />

          {/* Body panel line */}
          <line x1="150" y1="120" x2="150" y2="280" stroke="#4488ee" strokeWidth="2" opacity="0.5" />
          <circle cx="150" cy="280" r="3" fill="#4488ee" />

          {/* Apron */}
          <ellipse cx="150" cy="220" rx="65" ry="70" fill="#ffffff" opacity="0.9" />

          {/* Apron belt */}
          <rect x="85" y="155" width="130" height="20" rx="10" fill="#ff6b35" />

          {/* Apron buttons */}
          <circle cx="120" cy="200" r="5" fill="#ff4444" />
          <circle cx="150" cy="210" r="5" fill="#ff4444" />
          <circle cx="180" cy="200" r="5" fill="#ff4444" />
          <circle cx="130" cy="250" r="5" fill="#ff4444" />
          <circle cx="170" cy="250" r="5" fill="#ff4444" />

          {/* Hair */}
          <path
            d="M 80 120 Q 70 80 100 50 Q 130 30 150 25 Q 170 30 200 50 Q 230 80 220 120"
            fill="#f5f5f5"
            stroke="#e0e0e0"
            strokeWidth="2"
          />
          <path d="M 95 90 Q 90 75 105 60" stroke="#e0e0e0" strokeWidth="1.5" fill="none" opacity="0.6" />
          <path d="M 150 35 Q 145 50 155 65" stroke="#e0e0e0" strokeWidth="1.5" fill="none" opacity="0.6" />
          <path d="M 205 90 Q 210 75 195 60" stroke="#e0e0e0" strokeWidth="1.5" fill="none" opacity="0.6" />

          {/* Head/Face panel */}
          <circle cx="150" cy="160" r="60" fill="#5599ff" stroke="#4488ee" strokeWidth="2" />

          {/* Eyes */}
          <g ref={eyesRef} className="eyes-group">
            <circle cx="120" cy="140" r="15" fill="#ff4444" stroke="#dd0000" strokeWidth="1.5" />
            <circle cx="120" cy="140" r="12" fill="#ff6666" />
            <circle cx="122" cy="138" r="6" fill="#000000" />

            <circle cx="180" cy="140" r="15" fill="#ff4444" stroke="#dd0000" strokeWidth="1.5" />
            <circle cx="180" cy="140" r="12" fill="#ff6666" />
            <circle cx="182" cy="138" r="6" fill="#000000" />
          </g>

          {/* Antenna */}
          <line x1="110" y1="80" x2="95" y2="40" stroke="#5599ff" strokeWidth="8" strokeLinecap="round" />
          <circle cx="95" cy="40" r="6" fill="#ff6b35" />

          <line x1="190" y1="80" x2="205" y2="40" stroke="#5599ff" strokeWidth="8" strokeLinecap="round" />
          <circle cx="205" cy="40" r="6" fill="#ff6b35" />

          {/* Mouth */}
          <ellipse cx="150" cy="200" rx="20" ry="12" fill="#ff4444" />
          <path d="M 130 200 Q 150 210 170 200" stroke="#dd0000" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* Side panels */}
          <rect x="210" y="180" width="35" height="50" rx="5" fill="#4488ee" stroke="#3377dd" strokeWidth="2" />
          <circle cx="227" cy="200" r="4" fill="#ff4444" />
          <circle cx="227" cy="215" r="4" fill="#ff4444" />

          <rect x="55" y="180" width="35" height="50" rx="5" fill="#4488ee" stroke="#3377dd" strokeWidth="2" />
          <circle cx="72" cy="200" r="4" fill="#ff4444" />
          <circle cx="72" cy="215" r="4" fill="#ff4444" />
        </svg>
      </div>
    </div>
  );
}
