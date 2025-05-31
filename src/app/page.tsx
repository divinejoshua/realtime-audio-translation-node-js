
"use client";

import { useState, useRef } from 'react';

interface AudioMessage {
  id: string;
  sender: string;
  audioUrl: string;
  description: string;
  timestamp: Date;
}

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingUI, setShowRecordingUI] = useState(false);
  const [messages, setMessages] = useState<AudioMessage[]>([
    {
      id: '1',
      sender: 'John',
      audioUrl: '/sample-audio-1.mp3',
      description: 'Meeting notes for the project',
      timestamp: new Date(Date.now() - 3600000)
    },
    {
      id: '2',
      sender: 'You',
      audioUrl: '/sample-audio-2.mp3',
      description: 'My response to the meeting notes',
      timestamp: new Date()
    }
  ]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // In a real app, you would upload the audio to your server here
        const newMessage: AudioMessage = {
          id: Date.now().toString(),
          sender: 'You',
          audioUrl,
          description: 'New audio message',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, newMessage]);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setShowRecordingUI(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setShowRecordingUI(false);
    }
  };

  const cancelRecording = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (mediaRecorderRef.current) {
      // Stop all tracks in the stream
      mediaRecorderRef.current.stream.getTracks().forEach(track => {
        track.stop();
      });
      // Clear any recorded chunks
      audioChunksRef.current = [];
      // Reset states
      setIsRecording(false);
      setShowRecordingUI(false);
      // Clear the media recorder reference
      mediaRecorderRef.current = null;

      //Remove the last item on the audio list
      setMessages(prev => prev.slice(0, -1));
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Audio Messages</h1>
      
      {/* Messages List */}
      <div className="space-y-6 mb-24">
        {messages.map((message) => (
          <div key={message.id} className="border-b pb-4">
            <div className="font-medium">{message.sender}</div>
            <div className="text-sm text-gray-500 mb-1">
              {message.timestamp.toLocaleDateString()} at {formatTime(message.timestamp)}
            </div>
            <audio 
              src={message.audioUrl} 
              controls 
              className="w-full mt-1 mb-2"
            />
            <div className="text-gray-700">
              {message.description}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with Recording UI */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-3xl mx-auto p-4">
          {showRecordingUI ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isRecording && (
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm">Recording...</span>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {isRecording ? 'Tap to finish' : 'Review recording'}
                </div>
              </div>
              <div className="flex justify-between space-x-3">
                <button
                  onClick={(e) => cancelRecording(e)}
                  type="button"
                  className="flex-1 px-4 py-2 border rounded hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    stopRecording();
                    setShowRecordingUI(false);
                  }}
                  className="flex-1 px-4 py-2 bg-green-500 text-white hover:bg-green-600 text-sm rounded"
                >
                  {isRecording ? 'Stop & Send' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-12 h-12 flex items-center justify-center text-white ${
                  isRecording ? 'bg-red-500' : 'bg-blue-500'
                }`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <svg 
                  className="w-6 h-6" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  {isRecording ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 6a1 1 0 100-2H8a1 1 0 100 2h4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  )}
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
