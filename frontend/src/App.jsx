import React, { useState, useRef, useEffect } from 'react';
import AvatarDisplay from './AvatarDisplay';
import VoiceInput from './VoiceInput';
import './App.css';

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsProcessing(true);

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'rosie', text: data.response }]);
      setIsSpeaking(true);

      if (data.audioBase64) {
        const audioBlob = new Blob(
          [new Uint8Array(atob(data.audioBase64).split('').map(c => c.charCodeAt(0)))],
          { type: 'audio/mpeg' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        await new Promise(resolve => { audioRef.current.onended = resolve; });
      } else if (data.useBrowserTts) {
        const utterance = new SpeechSynthesisUtterance(data.response);
        utterance.rate = 0.95;
        utterance.pitch = 1.1;
        await new Promise(resolve => {
          utterance.onend = resolve;
          speechSynthesis.speak(utterance);
        });
      }

      setIsSpeaking(false);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'rosie', text: 'Sorry, something went wrong. Try again?' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!isProcessing && textInput.trim()) {
      sendMessage(textInput.trim());
      setTextInput('');
    }
  };

  return (
    <div className="app">
      <div className="avatar-container">
        <AvatarDisplay isSpeaking={isSpeaking} isListening={isListening} />
      </div>

      <div className="controls-panel">
        <div className="transcript-area">
          {messages.length === 0 && (
            <div className="empty-state">Say something or type below...</div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'user-text' : 'rosie-text'}>
              <span className="msg-label">{msg.role === 'user' ? 'You' : 'Rosie'}:</span> {msg.text}
            </div>
          ))}
          {isProcessing && <div className="loading">Thinking...</div>}
          <div ref={messagesEndRef} />
        </div>

        <form className="text-input-row" onSubmit={handleTextSubmit}>
          <input
            ref={inputRef}
            className="text-input"
            type="text"
            placeholder="Type a message..."
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            disabled={isProcessing}
          />
          <button
            type="submit"
            className="send-button"
            disabled={isProcessing || !textInput.trim()}
          >
            Send
          </button>
        </form>

        <VoiceInput
          onTranscript={sendMessage}
          isProcessing={isProcessing}
          setIsListening={setIsListening}
        />
      </div>

      <audio ref={audioRef} />
    </div>
  );
}
