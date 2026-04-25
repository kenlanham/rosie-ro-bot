import React, { useRef, useState, useEffect } from 'react';

const VoiceInput = ({ onTranscript, isProcessing, setIsListening }) => {
  const recognitionRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      setInterimTranscript(interim);

      if (final) {
        const finalText = final.trim();
        setInterimTranscript('');
        onTranscript(finalText);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [onTranscript, setIsListening]);

  const handleTalkClick = () => {
    if (isProcessing) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="voice-input">
      <button
        className={`talk-button ${isRecording ? 'recording' : ''} ${isProcessing ? 'disabled' : ''}`}
        onClick={handleTalkClick}
        disabled={isProcessing}
      >
        <span className="mic-icon">🎤</span>
        {isProcessing ? 'Thinking...' : isRecording ? 'Listening...' : 'Talk to Rosie'}
      </button>

      {interimTranscript && (
        <div className="interim-text">{interimTranscript}</div>
      )}
    </div>
  );
};

export default VoiceInput;
