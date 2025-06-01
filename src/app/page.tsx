
"use client";

import { useState, useRef, useEffect } from 'react';

interface TranscriptionResponse {
  transcription: string;
}

import { useFirebaseHook, type FirestoreMessage } from './hooks/useFirebaseHook';
import { format } from 'date-fns';

interface AudioMessage extends FirestoreMessage {
  audioUrl?: string;
  timestamp: Date;
  translatedText?: string;
}

export default function Home() {
  // Load name from localStorage on initial render
  const [name, setName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userName') || '';
    }
    return '';
  });
  
  // Update localStorage whenever name changes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (typeof window !== 'undefined') {
      localStorage.setItem('userName', newName);
    }
  };
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showRecordingUI, setShowRecordingUI] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const storedTargetLanguage = localStorage.getItem('targetLanguage');
      return storedTargetLanguage || 'en';
    }
    return 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('targetLanguage', targetLanguage);
    }
  }, [targetLanguage]);
  const [messages, setMessages] = useState<AudioMessage[]>([]);
  const { saveTranscription, fetchMessages } = useFirebaseHook();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Function to translate text
  const translateText = async (text: string, targetLang: string): Promise<string> => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: text,
          targetLanguage: targetLang
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      return data.translatedText || text; // Return original text if translation fails
    } catch (error) {
      console.error('Translation error:', error);
      return text; // Return original text if translation fails
    }
  };

  // Effect to translate messages when target language changes
  useEffect(() => {
    let isMounted = true;

    const translateMessages = async () => {
      const updatedMessages = [...messages];
      let hasChanges = false;

      // Process messages sequentially
      for (let i = 0; i < updatedMessages.length; i++) {
        const message = updatedMessages[i];
        
        // Skip if already translated or no transcription
        if (message.translatedText || !message.transcription) continue;
        
        // Skip if message is in the target language
        if (message.language === targetLanguage) {
          updatedMessages[i] = {
            ...message,
            translatedText: message.transcription
          };
          hasChanges = true;
          continue;
        }
        
        try {
          const translatedText = await translateText(message.transcription, targetLanguage);
          
          if (isMounted) {
            updatedMessages[i] = {
              ...message,
              translatedText
            };
            hasChanges = true;
            
            // Update state after each successful translation
            setMessages([...updatedMessages]);
          }
        } catch (error) {
          console.error(`Failed to translate message ${i + 1}:`, error);
          // Continue with next message even if one fails
        }
      }
      
      // Final update if there were changes but no async operations
      if (hasChanges && isMounted) {
        setMessages(updatedMessages);
      }
    };

    if (messages.length > 0) {
      translateMessages();
    }

    return () => {
      isMounted = false;
    };
  }, [targetLanguage, messages]);

  // Fetch messages from Firestore on component mount
  useEffect(() => {
    if (!fetchMessages) return;
    
    const processMessages = async (firestoreMessages: any[]) => {
      const formattedMessages = await Promise.all(
        firestoreMessages.map(async (msg) => {
          const baseMessage = {
            ...msg,
            timestamp: msg.date?.toDate() || new Date(),
            senderName: msg.senderName || 'Anonymous',
            transcription: msg.transcription || '',
            audioUrl: undefined, // No audio URL for Firestore messages
            translatedText: undefined
          } as AudioMessage;

          // If message is already in target language, use transcription as is
          if (msg.language === targetLanguage) {
            return { ...baseMessage, translatedText: msg.transcription };
          }

          // Otherwise, translate it
          const translatedText = await translateText(msg.transcription, targetLanguage);
          return { ...baseMessage, translatedText };
        })
      );
      setMessages(formattedMessages);
    };
    
    const unsubscribe = fetchMessages(processMessages);

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetchMessages, targetLanguage]);

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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        try {
          // Upload the audio file
          const response = await uploadAudio(audioBlob);
          
          const newMessage: AudioMessage = {
            id: Date.now().toString(),
            sender: name || 'You',
            audioUrl,
            description: response.transcription || 'Audio message',
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, newMessage]);
        } catch (error) {
          console.error('Error uploading audio:', error);
          // Add message even if upload fails, but mark it as failed
          const newMessage: AudioMessage = {
            id: Date.now().toString(),
            sender: name || 'You',
            audioUrl,
            description: 'Failed to transcribe audio',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, newMessage]);
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setShowRecordingUI(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const uploadAudio = async (audioBlob: Blob): Promise<TranscriptionResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', targetLanguage);
    formData.append('sender', name);

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // First, upload to our API for transcription
      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const result = await response.json() as TranscriptionResponse;
      
      // Save to Firebase
      if (result.transcription) {
        await saveTranscription({
          senderName: name,
          transcription: result.transcription,
          language: targetLanguage
        });
      }

      return result;
    } catch (error) {
      console.error('Error uploading audio:', error);
      throw error;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setIsUploading(true);
      setUploadProgress(0);
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

  // Format time helper function
  const formatTime = (date: Date) => {
    return format(date, 'h:mm a');
  };
  
  // handleNameChange is already defined above, removing duplicate

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Audio Messages</h1>
      <div className="mb-6">
        <label htmlFor="targetLanguage" className="block mb-2 text-sm font-medium text-gray-700">
          Target Language <span className="text-gray-500 hidden">{targetLanguage}</span>
        </label>
        <select
          id="targetLanguage"
          className="block w-full px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          value={targetLanguage}
          onChange={e => setTargetLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="ha">Hausa</option>
          <option value="sh">Shona</option>
        </select>
      </div>
      <div className="mb-6">
        <label htmlFor="name" className="block mb-2 text-sm font-medium text-gray-700">
          Your Name
        </label>
        <input
          type="text"
          id="name"
          className="block w-full px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          value={name}
          onChange={handleNameChange}
          placeholder="Enter your name"
        />
      </div>
      
      {/* Messages List */}
      <h2 className="text-2xl font-bold mb-6">Conversations</h2>
      <div className="space-y-6 mb-24">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No messages yet. Record your first message!
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="border-b pb-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">{message.senderName || 'Anonymous'}</span>
                <span className="text-sm text-gray-500">
                  {format(message.timestamp, 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-800">
                  {message.translatedText || message.transcription}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
                  <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {message.language}
                  </span>
                  {message.translatedText && message.language !== targetLanguage && (
                    <span className="text-xs text-gray-400">
                      Translated to {targetLanguage}
                    </span>
                  )}
                </div>
                {message.translatedText && message.transcription !== message.translatedText && (
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer">Show original</summary>
                    <p className="mt-1 p-2 bg-gray-100 rounded">{message.transcription}</p>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Progress Bar */}
      {isUploading && (
        <div className="fixed bottom-16 left-0 right-0 bg-gray-100 h-1">
          <div 
            className="bg-blue-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}

      {/* Footer with Recording UI */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-3xl mx-auto p-4">
          {isUploading && (
            <div className="text-center text-sm text-gray-500 mb-2">
              Uploading... {uploadProgress}%
            </div>
          )}
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
              <p className='hidden'>{name}</p>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!name }
                className={`w-12 h-12 flex items-center justify-center rounded-full text-white ${
                  isRecording ? 'bg-red-500' : 'bg-blue-500'
                } ${!name ? 'opacity-50 cursor-not-allowed' : ''}`}
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
